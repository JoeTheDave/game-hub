import { useState } from 'react'
import { createPortal } from 'react-dom'
import { COLOR_BG_CLASSES } from '../lib/playerColors'
import type { AdminControls } from '../games/types'

/**
 * The admin's "Players" control (platform, every game). A small unobtrusive button that opens a
 * sheet listing the other players with "Make admin", plus a confirmation on this phone, so the
 * role is never handed on by accident. The new admin isn't asked. Renders nothing for non-admins.
 */
export function AdminMenu({ isAdmin, playerOrder, players, promote, className = '' }: AdminControls & { className?: string }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!isAdmin) return null
  const others = players.filter((p) => p.playerOrder !== playerOrder)
  const target = players.find((p) => p.playerOrder === confirm)

  const close = () => {
    setOpen(false)
    setConfirm(null)
    setError(null)
  }

  const doPromote = async () => {
    if (confirm == null) return
    setBusy(true)
    setError(null)
    const ok = await promote(confirm)
    setBusy(false)
    if (ok) close()
    else setError('Could not change the admin. Try again.')
  }

  const sheet = (
    <div
      className="game-surface fixed inset-0 z-50 flex items-end justify-center bg-black/55 pb-[env(safe-area-inset-bottom)]"
      onClick={close}
      data-admin-sheet=""
    >
      <div className="w-full max-w-sm m-3 rounded-2xl bg-slate-900 border border-white/15 p-4 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {target ? (
          <div className="flex flex-col gap-3" data-admin-confirm="">
            <p className="text-base">
              Make <span className="font-bold">{target.screenName}</span> the admin? You&apos;ll lose the admin controls.
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="flex-1 py-3 rounded-xl bg-white/10 cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void doPromote()}
                disabled={busy}
                className="flex-1 py-3 rounded-xl bg-amber-500 text-slate-900 font-bold cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                {busy ? 'Changing…' : 'Confirm'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Players</span>
              <button type="button" onClick={close} className="text-slate-400 text-sm cursor-pointer">
                Close
              </button>
            </div>
            {others.length === 0 && <p className="text-sm text-slate-400">No other players yet.</p>}
            {others.map((p) => (
              <div key={p.playerOrder} className="flex items-center gap-3 py-1.5">
                <span className={`w-4 h-4 rounded-full shrink-0 ${p.color ? COLOR_BG_CLASSES[p.color] : 'bg-slate-500'}`} />
                <span className="flex-1 truncate">{p.screenName}</span>
                <button
                  type="button"
                  onClick={() => setConfirm(p.playerOrder)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 text-sm cursor-pointer active:scale-95"
                >
                  Make admin
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        aria-label="Players"
        title="Players"
        onClick={() => setOpen(true)}
        data-admin-menu=""
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-white/10 text-white/70 cursor-pointer active:scale-95 ${className}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M16.5 14.2c2.8.3 5 2.2 5 5.3" />
        </svg>
      </button>
      {open && typeof document !== 'undefined' ? createPortal(sheet, document.body) : null}
    </>
  )
}
