import { Game } from './screens/Game'
import { GameOver } from './screens/GameOver'
import { Home } from './screens/Home'
import { Lobby } from './screens/Lobby'
import { deriveScreen, useGameStore } from './store'
import { ConnectionOverlay } from './ui/ConnectionOverlay'
import { useEntry } from './useEntry'
import { useGameSocket } from './useGameSocket'

function renderScreen(
  screen: ReturnType<typeof deriveScreen>,
  socket: ReturnType<typeof useGameSocket>,
  initialCode: string | undefined,
) {
  switch (screen) {
    case 'home':
      return (
        <Home createRoom={socket.createRoom} joinRoom={socket.joinRoom} initialCode={initialCode} />
      )
    case 'lobby':
      return <Lobby startGame={socket.startGame} leaveRoom={socket.leaveRoom} />
    case 'game':
      return (
        <Game
          chooseWord={socket.chooseWord}
          guess={socket.guess}
          sendStroke={socket.sendStroke}
          sendUndo={socket.sendUndo}
          sendClearCanvas={socket.sendClearCanvas}
          leaveRoom={socket.leaveRoom}
        />
      )
    case 'gameover':
      return <GameOver playAgain={socket.playAgain} leaveRoom={socket.leaveRoom} />
  }
}

export function App() {
  const socket = useGameSocket()
  const state = useGameStore()
  const screen = deriveScreen(state)
  const initialCode = useEntry(socket.joinRoom)

  return (
    <>
      <ConnectionOverlay status={state.status} />
      {renderScreen(screen, socket, initialCode)}
    </>
  )
}
