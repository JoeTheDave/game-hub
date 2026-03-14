import { useParams } from 'react-router-dom'
import { TicTacToeGamePage } from './tic-tac-toe/TicTacToeGamePage'

/** Renders the game-specific main view page (host display, with MasterLayout). */
export function GameViewRoute() {
  const { gameSlug } = useParams<{ gameSlug: string }>()

  switch (gameSlug) {
    case 'tic-tac-toe':
      return <TicTacToeGamePage />
    default:
      return (
        <div className="py-12 text-center text-slate-400">
          Game type &quot;{gameSlug}&quot; not found.
        </div>
      )
  }
}
