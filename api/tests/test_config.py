from sketch_party.config import Settings


def test_defaults() -> None:
    s = Settings()
    assert s.max_rooms >= 100
    assert s.max_players == 10
    assert s.max_name_length == 20
    assert s.max_guess_length == 60
    assert "http://localhost:5173" in s.allowed_origins


def test_allowed_origins_parse_csv(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.com,https://b.com")
    s = Settings()
    assert s.allowed_origins == ["https://a.com", "https://b.com"]
