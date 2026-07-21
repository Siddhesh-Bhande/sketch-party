import { Game } from './screens/Game'
import { GamePlaceholder } from './screens/GamePlaceholder'
import { Home } from './screens/Home'
import { Lobby } from './screens/Lobby'
import { deriveScreen, useGameStore } from './store'
import { useGameSocket } from './useGameSocket'

export function App() {
  const socket = useGameSocket()
  const state = useGameStore()
  const screen = deriveScreen(state)

  switch (screen) {
    case 'home':
      return <Home createRoom={socket.createRoom} joinRoom={socket.joinRoom} />
    case 'lobby':
      return <Lobby startGame={socket.startGame} />
    case 'game':
      return (
        <Game
          chooseWord={socket.chooseWord}
          sendStroke={socket.sendStroke}
          sendUndo={socket.sendUndo}
          sendClearCanvas={socket.sendClearCanvas}
        />
      )
    case 'gameover':
      return <GamePlaceholder />
  }
}
