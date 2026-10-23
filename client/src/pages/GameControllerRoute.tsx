import { useParams } from 'react-router-dom'
import { PHONE_SCREEN_CLASS } from '../lib/phoneScreen'
import { TicTacToeControllerPage } from './tic-tac-toe/TicTacToeControllerPage'

/** Renders the game-specific controller page (no MasterLayout). Used when joining via QR from mobile. */
export function GameControllerRoute() {
  const { gameSlug } = useParams<{ gameSlug: string }>()

  switch (gameSlug) {
    case 'tic-tac-toe':
      return <TicTacToeControllerPage />
    default:
      return (
        <div className={`${PHONE_SCREEN_CLASS} items-center justify-center text-slate-400 px-4`}>
          Game type &quot;{gameSlug}&quot; not found.
        </div>
      )
  }
}
