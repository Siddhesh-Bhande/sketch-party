import json
import random

from sketch_party.config import Settings
from sketch_party.manager import ConnectionManager, RoomManager
from sketch_party.models import RoomSettings
from sketch_party.protocol import ErrorMsg


class FakeWS:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send_text(self, data: str) -> None:
        self.sent.append(data)


def make_rm() -> RoomManager:
    return RoomManager(settings=Settings(max_rooms=3), clock=lambda: 0.0, rng=random.Random(0))


def test_create_room_returns_code_and_stores() -> None:
    rm = make_rm()
    code = rm.create_room(RoomSettings())
    assert len(code) == 4 and code.isupper() and code.isalpha()
    assert rm.get(code) is not None


def test_create_room_unique_codes() -> None:
    rm = RoomManager(settings=Settings(max_rooms=50), clock=lambda: 0.0, rng=random.Random(1))
    codes = {rm.create_room(RoomSettings()) for _ in range(30)}
    assert len(codes) == 30


def test_create_room_enforces_max() -> None:
    rm = make_rm()  # max 3
    for _ in range(3):
        rm.create_room(RoomSettings())
    try:
        rm.create_room(RoomSettings())
        raise AssertionError("expected RoomError")
    except Exception as exc:
        assert type(exc).__name__ == "RoomError"


def test_get_returns_none_for_unknown_code() -> None:
    rm = make_rm()
    assert rm.get("NOPE") is None


def test_remove_empty_deletes_rooms_with_no_players() -> None:
    rm = make_rm()
    code = rm.create_room(RoomSettings())
    rm.remove_empty(code)
    assert rm.get(code) is None
    room = rm.get(rm.create_room(RoomSettings()))
    assert room is not None
    room.add_player("p1", "Alex")
    rm.remove_empty(room.code)
    assert rm.get(room.code) is not None


async def test_broadcast_hits_all_and_exclude_skips() -> None:
    cm = ConnectionManager()
    a, b = FakeWS(), FakeWS()
    await cm.connect("WXYZ", "p1", a)
    await cm.connect("WXYZ", "p2", b)
    await cm.broadcast("WXYZ", ErrorMsg(message="hi"))
    assert len(a.sent) == 1 and len(b.sent) == 1
    assert json.loads(a.sent[0])["type"] == "error"
    a.sent.clear()
    b.sent.clear()
    await cm.broadcast("WXYZ", ErrorMsg(message="x"), exclude="p1")
    assert a.sent == [] and len(b.sent) == 1


async def test_send_targets_one_and_disconnect_removes() -> None:
    cm = ConnectionManager()
    a, b = FakeWS(), FakeWS()
    await cm.connect("R", "p1", a)
    await cm.connect("R", "p2", b)
    await cm.send("R", "p1", ErrorMsg(message="only-you"))
    assert len(a.sent) == 1 and b.sent == []
    cm.disconnect("R", "p1", a)
    await cm.broadcast("R", ErrorMsg(message="again"))
    assert len(a.sent) == 1  # unchanged


async def test_is_current_reflects_the_live_sender_for_an_id() -> None:
    cm = ConnectionManager()
    a, b = FakeWS(), FakeWS()
    await cm.connect("R", "p1", a)
    assert cm.is_current("R", "p1", a) is True
    assert cm.is_current("R", "p1", b) is False

    await cm.connect("R", "p1", b)  # a newer socket supersedes a
    assert cm.is_current("R", "p1", a) is False
    assert cm.is_current("R", "p1", b) is True


async def test_disconnect_from_superseded_sender_is_a_noop() -> None:
    cm = ConnectionManager()
    a, b = FakeWS(), FakeWS()
    await cm.connect("R", "p1", a)
    await cm.connect("R", "p1", b)  # b supersedes a, same id

    cm.disconnect("R", "p1", a)  # stale: a is no longer the registered sender
    await cm.send("R", "p1", ErrorMsg(message="still-here"))
    assert len(b.sent) == 1  # b is untouched by a's stale disconnect

    cm.disconnect("R", "p1", b)  # the real, current sender disconnecting
    await cm.send("R", "p1", ErrorMsg(message="gone"))
    assert len(b.sent) == 1  # unchanged: b really is gone now
