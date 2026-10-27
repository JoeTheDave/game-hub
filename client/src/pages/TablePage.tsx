import { useEffect, useRef } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTableFeed } from '../hooks/useTableFeed'
import { useGameModule } from '../hooks/useGameModule'
import { useSoundBoard } from '../hooks/useSoundBoard'

/**
 * The shared table screen (TV). Full-screen; the game's TableView owns everything inside.
 * Hosts the sound unlock overlay and mute toggle so every game gets them for free.
 */
export function TablePage() {
  const { gameSlug, id } = useParams<{ gameSlug: string; id: string }>()
  const navigate = useNavigate()
  const { current, done, error, loading } = useTableFeed(id ?? null)
  const mod = useGameModule(gameSlug)
  const { soundBoard, muted, unlocked, toggleMute } = useSoundBoard()
  const prepared = useRef<string | null>(null)

  useEffect(() => {
    if (mod && prepared.current !== mod.slug) {
      prepared.current = mod.slug
      mod.prepareTable?.(soundBoard)
    }
  }, [mod, soundBoard])

  useEffect(() => {
    if (current?.instance.phase === 'lobby') navigate(`/lobby/${gameSlug}/${id}`, { replace: true })
  }, [current, gameSlug, id, navigate])

  const shell = 'game-surface fixed inset-0 overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900'
  const centered = `${shell} flex items-center justify-center text-slate-400`

  if (loading && !current) return <div className={centered}>Loading…</div>
  if (!current) return <div className={centered}>{error ?? 'Game not found.'}</div>
  if (mod === null) return <div className={centered}>Game type &quot;{gameSlug}&quot; not found.</div>
  if (mod === undefined || current.instance.tableView == null) return <div className={centered}>Loading…</div>

  const { TableView } = mod
  return (
    // Any tap on the table unlocks audio (browsers require a gesture).
    <div className={shell} onClickCapture={() => void soundBoard.unlock()}>
      <div className="absolute inset-0 overflow-hidden">
        <TableView
          instance={current.instance}
          view={current.instance.tableView}
          players={current.instance.players}
          events={current.events}
          seq={current.seq}
          onEventsDone={done}
          sound={soundBoard}
        />
      </div>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={toggleMute}
          className="h-9 px-3 rounded-full bg-black/50 text-white text-sm cursor-pointer hover:bg-black/70"
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <Link to="/" className="h-9 px-3 rounded-full bg-black/50 text-white text-sm flex items-center hover:bg-black/70">
          Exit
        </Link>
      </div>

      {!unlocked && !muted && (
        <button
          type="button"
          onClick={() => void soundBoard.unlock()}
          className="absolute inset-x-0 bottom-6 mx-auto w-fit z-50 px-6 py-3 rounded-full bg-amber-400 text-slate-900 font-bold shadow-xl shadow-black/40 cursor-pointer animate-pulse"
        >
          🔊 Tap to enable sound
        </button>
      )}
    </div>
  )
}
