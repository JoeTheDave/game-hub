import { useParams } from 'react-router-dom'
import { TicTacToeLobbyPage } from './tic-tac-toe/TicTacToeLobbyPage'

/** Renders the game-specific lobby page (with MasterLayout). */
export function GameLobbyRoute() {
  const { gameSlug } = useParams<{ gameSlug: string }>()

  switch (gameSlug) {
    case 'tic-tac-toe':
      return <TicTacToeLobbyPage />
    default:
      return (
        <div className="py-12 text-center text-slate-400">
          Game type &quot;{gameSlug}&quot; not found.
        </div>
      )
  }
}
