import { Game } from './screens/Game'
import { GameOver } from './screens/GameOver'
import { Home } from './screens/Home'
import { Lobby } from './screens/Lobby'
import { deriveScreen, useGameStore } from './store'
import { ConnectionOverlay } from './ui/ConnectionOverlay'
import { useGameSocket } from './useGameSocket'

function renderScreen(
  screen: ReturnType<typeof deriveScreen>,
  socket: ReturnType<typeof useGameSocket>,
) {
  switch (screen) {
    case 'home':
      return <Home createRoom={socket.createRoom} joinRoom={socket.joinRoom} />
    case 'lobby':
      return <Lobby startGame={socket.startGame} />
    case 'game':
      return (
        <Game
          chooseWord={socket.chooseWord}
          guess={socket.guess}
          sendStroke={socket.sendStroke}
          sendUndo={socket.sendUndo}
          sendClearCanvas={socket.sendClearCanvas}
        />
      )
    case 'gameover':
      return <GameOver playAgain={socket.playAgain} />
  }
}

export function App() {
  const socket = useGameSocket()
  const state = useGameStore()
  const screen = deriveScreen(state)

  return (
    <>
      <ConnectionOverlay status={state.status} />
      {renderScreen(screen, socket)}
    </>
  )
}
