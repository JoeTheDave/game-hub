import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AdminMenu } from '../../components/AdminMenu'
import type { PhoneViewProps } from '../types'
import type { MoveOption, OnitamaAction, OnitamaPlayerView, Square } from '@games/onitama/engine'
import { CARD_BY_ID } from '@games/onitama/data'
import type { GameSummary } from '../../types/game'
import { Card, INK, Piece, SeriesTable, TempleMark } from './components'
import { describeMove, destinations, movablePieces, mustPass, phoneCell, seriesSummary, wayLine } from './logic'
import { TABLE_IMG } from './assets'
import { FINAL_HEADLINE } from './TableView'
import './onitama.css'

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  // A sensible starting size; the layout effect measures the real one before the first paint.
  const [size, setSize] = useState({ w: 360, h: 360 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
  return [ref, size] as const
}

const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // unsupported
  }
}

/** Reserved height of the action area, so choosing a card/piece never resizes anything. */
export const ACTION_AREA_PX = 64

const same = (a: readonly number[] | null | undefined, b: readonly number[] | null | undefined) => !!a && !!b && a[0] === b[0] && a[1] === b[1]

const btn = 'rounded-xl font-bold transition-transform active:scale-[0.97] cursor-pointer disabled:cursor-default disabled:opacity-40 disabled:active:scale-100'
const primaryBtn = `${btn} bg-[#a3241c] text-amber-50 shadow-lg shadow-black/40`
const ghostBtn = `${btn} bg-white/10 text-amber-50 border border-white/15`

export function PhoneView({ instance, view, playerOrder, sendAction, pending, error, clearError, rematch, admin }: PhoneViewProps<OnitamaPlayerView, OnitamaAction>) {
  const [selCard, setSelCard] = useState<string | null>(null)
  const [selFrom, setSelFrom] = useState<Square | null>(null)
  const [confirm, setConfirm] = useState<MoveOption | null>(null)
  const me = view.players.find((p) => p.seat === playerOrder)
  const opp = view.players.find((p) => p.seat !== playerOrder)
  const isMyTurn = view.isMyTurn && !view.finished
  const passOnly = isMyTurn && mustPass(view.legalActions)
  const options = isMyTurn ? view.options : []

  // Selections never outlive the position they were made in.
  useEffect(() => {
    setSelCard(null)
    setSelFrom(null)
    setConfirm(null)
  }, [view.ply, isMyTurn])

  const act = async (action: OnitamaAction) => {
    buzz(12)
    const ok = await sendAction(action)
    if (!ok) buzz([30, 40, 30])
    setConfirm(null)
    setSelFrom(null)
    setSelCard(null)
    return ok
  }

  const turnName = view.players.find((p) => p.seat === view.turn)?.name ?? ''
  let status: ReactNode = null
  if (view.finished) status = null // no "Game Over" heading on the phone's end screen
  else if (isMyTurn) status = <span className="text-emerald-300 font-bold">Your turn</span>
  else status = <span className="text-amber-100/75">{`Waiting for ${turnName}…`}</span>

  const myColor = view.myColor
  const pickCard = (id: string) => {
    if (!isMyTurn) return
    buzz(6)
    setConfirm(null)
    setSelCard((c) => (c === id ? null : id))
    // Keep the chosen piece only if it can still move with the new card.
    setSelFrom((f) => (f && movablePieces(options, id).some((s) => same(s, f)) ? f : null))
  }

  return (
    <div
      className="flex-1 min-h-0 flex flex-col relative text-amber-50"
      style={{ backgroundImage: `linear-gradient(rgba(20,12,6,.72), rgba(20,12,6,.86)), url(${TABLE_IMG})`, backgroundSize: 'auto, cover' }}
    >
      {/* Header: me, my colour, the turn status inline, and the admin's Players button */}
      <div className="shrink-0 px-3 pt-2 pb-2 border-b border-white/10" style={{ background: 'rgba(0,0,0,.25)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-4 h-4 rounded-full shrink-0" style={{ background: INK[myColor], boxShadow: '0 0 0 2px rgba(255,255,255,.25)' }} title={`You play ${myColor}`} />
          <span className="oni-brush text-xl truncate shrink min-w-0 max-w-[50%]">{me?.name}</span>
          <span className="flex-1 min-w-0 truncate text-right text-sm">{status}</span>
          {admin && <AdminMenu {...admin} />}
        </div>
      </div>

      {error && (
        <button type="button" onClick={clearError} className="absolute left-3 right-3 top-14 z-20 px-3 py-2 rounded-lg bg-red-900/90 text-red-100 text-sm text-left cursor-pointer shadow-lg">
          {error} <span className="opacity-60">(tap to dismiss)</span>
        </button>
      )}

      {view.finished ? (
        <Finished view={view} me={playerOrder} rematch={rematch} history={instance?.history} />
      ) : (
        <>
          {/* The opponent's cards (public), facing them */}
          {opp && (
            <div className="shrink-0 flex items-center gap-2 px-3 pt-2" style={{ height: 70 }}>
              <span className="oni-brush text-sm text-amber-100/70 truncate max-w-[30%]">{opp.name}</span>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: INK[opp.side] }} />
              <div className="flex-1" />
              {opp.hand.map((id) => (
                <Card key={id} id={id} w={44} facing="down" quote={false} />
              ))}
            </div>
          )}

          <PhoneBoard view={view} options={options} selCard={selCard} selFrom={selFrom} interactive={isMyTurn && !passOnly}
            onPiece={(sq) => {
              buzz(6)
              setConfirm(null)
              setSelFrom((f) => (same(f, sq) ? null : sq))
            }}
            onDest={(o) => {
              buzz(8)
              setConfirm(o)
            }}
          />

          <MyCards view={view} selCard={selCard} canPick={isMyTurn} onPick={pickCard} />

          {/* Action area: always reserved, so nothing resizes as you choose */}
          <div className="shrink-0 px-3 pb-3 flex flex-col justify-center" style={{ height: ACTION_AREA_PX }}>
            {passOnly ? (
              selCard ? (
                <button type="button" disabled={pending} onClick={() => void act({ type: 'pass', card: selCard })} className={`${primaryBtn} w-full py-3`}>
                  {pending ? 'Passing…' : `Pass ${CARD_BY_ID[selCard]?.name ?? ''} to the side`}
                </button>
              ) : (
                <div className="text-center text-sm text-amber-100/80">No legal move — choose a card to pass</div>
              )
            ) : isMyTurn ? (
              <div className="text-center text-sm text-amber-100/70">
                {!selCard ? 'Choose a card' : !selFrom ? 'Now choose a piece to move' : 'Tap a highlighted square'}
              </div>
            ) : (
              <div className="text-center text-sm text-amber-100/55">Study the board while you wait</div>
            )}
          </div>

          {confirm && confirm.action.type === 'move' && (
            <ConfirmSheet
              option={confirm}
              master={!!view.board.find((p) => same([p.x, p.y], (confirm.action as { from: Square }).from))?.master}
              pending={pending}
              onPlay={() => void act(confirm.action)}
              onCancel={() => setConfirm(null)}
            />
          )}
        </>
      )}
    </div>
  )
}

/** The board seen from my own side: my home row at the bottom, forward = up. */
function PhoneBoard({
  view,
  options,
  selCard,
  selFrom,
  interactive,
  onPiece,
  onDest,
}: {
  view: OnitamaPlayerView
  options: MoveOption[]
  selCard: string | null
  selFrom: Square | null
  interactive: boolean
  onPiece: (sq: Square) => void
  onDest: (o: MoveOption) => void
}) {
  const [ref, size] = useSize<HTMLDivElement>()
  const side = Math.floor(Math.max(0, Math.min(size.w, size.h)))
  const cell = side / 5
  const me = view.myColor
  const movable = interactive && selCard ? movablePieces(options, selCard) : []
  const dests = interactive ? destinations(options, selCard, selFrom) : []
  return (
    <div ref={ref} className="flex-1 min-h-0 mx-3 my-2 flex items-center justify-center">
      {side > 0 && (
        <div data-phone-board="" className="relative rounded-lg" style={{ width: side, height: side, background: 'rgba(243,232,207,.9)', boxShadow: '0 8px 20px rgba(0,0,0,.5)' }}>
          {Array.from({ length: 25 }, (_, i) => {
            const col = i % 5
            const row = Math.floor(i / 5)
            return <div key={i} className="absolute rounded" style={{ left: col * cell + 2, top: row * cell + 2, width: cell - 4, height: cell - 4, border: '2px solid rgba(40,26,14,.55)' }} />
          })}
          {(['red', 'blue'] as const).map((c) => {
            const [col, row] = phoneCell(view.temples[c], me)
            return <TempleMark key={c} color={c} size={cell * 0.7} style={{ position: 'absolute', left: col * cell + cell * 0.15, top: row * cell + cell * 0.15 }} />
          })}
          {view.board.map((p) => {
            const [col, row] = phoneCell([p.x, p.y], me)
            const mine = p.color === me
            const can = mine && movable.some((s) => same(s, [p.x, p.y]))
            const chosen = same(selFrom, [p.x, p.y])
            const s = cell * (p.master ? 0.86 : 0.76)
            return (
              <button
                key={p.id}
                type="button"
                disabled={!can}
                onClick={() => onPiece([p.x, p.y])}
                className="absolute flex items-center justify-center cursor-pointer disabled:cursor-default rounded-full"
                style={{
                  left: col * cell,
                  top: row * cell,
                  width: cell,
                  height: cell,
                  outline: chosen ? '3px solid #fbbf24' : can ? '2px dashed rgba(251,191,36,.8)' : 'none',
                  outlineOffset: -4,
                }}
              >
                <Piece id={p.id} color={p.color} master={p.master} size={s} />
              </button>
            )
          })}
          {dests.map((o, i) => {
            const to = (o.action as { to: Square }).to
            const [col, row] = phoneCell(to, me)
            return (
              <button
                key={i}
                type="button"
                data-dest={o.danger ? 'danger' : o.wins ? 'win' : 'safe'}
                onClick={() => onDest(o)}
                className="absolute flex items-center justify-center cursor-pointer"
                style={{ left: col * cell, top: row * cell, width: cell, height: cell }}
                title={o.danger ? 'Your Master could be captured here' : o.wins ? 'This move wins' : undefined}
              >
                <span
                  className="rounded-full"
                  style={{
                    width: cell * 0.42,
                    height: cell * 0.42,
                    background: o.danger ? 'rgba(220,38,38,.55)' : o.wins ? 'rgba(234,179,8,.8)' : 'rgba(251,191,36,.6)',
                    boxShadow: o.danger ? '0 0 0 3px rgba(220,38,38,.9)' : '0 0 0 3px rgba(251,191,36,.9)',
                  }}
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** My two cards (large, with move diagrams) and the side card (small, for reference). */
function MyCards({ view, selCard, canPick, onPick }: { view: OnitamaPlayerView; selCard: string | null; canPick: boolean; onPick: (id: string) => void }) {
  const [ref, size] = useSize<HTMLDivElement>()
  const me = view.players.find((p) => p.seat === view.me)
  const gap = 10
  // Two hand cards plus a smaller side card share the width; the row's height follows from that.
  const handW = Math.max(0, Math.floor((size.w - gap * 2) / 2.62))
  const sideW = Math.floor(handW * 0.62)
  const sideMine = view.sideFor === view.me
  return (
    <div ref={ref} className="shrink-0 mx-3 flex items-end justify-center" style={{ gap, height: handW ? handW * 1.4 + 4 : 'auto', minHeight: 120 }}>
      {handW > 0 &&
        me?.hand.map((id) => {
          const on = selCard === id
          return (
            <button
              key={id}
              type="button"
              disabled={!canPick}
              onClick={() => onPick(id)}
              className="relative rounded-[6%] cursor-pointer disabled:cursor-default"
              style={{ outline: on ? '3px solid #fbbf24' : 'none', outlineOffset: 2, transition: 'outline-color 120ms' }}
            >
              <Card id={id} w={handW} facing="up" />
            </button>
          )
        })}
      {handW > 0 && (
        <div className="flex flex-col items-center gap-1" title="The side card">
          <span className="text-[10px] text-amber-100/60">{sideMine ? 'next for you' : 'side'}</span>
          <Card id={view.side} w={sideW} facing={sideMine ? 'up' : 'down'} quote={false} style={{ opacity: 0.92 }} />
        </div>
      )}
    </div>
  )
}

function ConfirmSheet({ option, master, pending, onPlay, onCancel }: { option: MoveOption; master: boolean; pending: boolean; onPlay: () => void; onCancel: () => void }) {
  const a = option.action as { card: string }
  const name = CARD_BY_ID[a.card]?.name ?? ''
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 p-3 rounded-t-2xl" style={{ background: '#2a1c12', boxShadow: '0 -10px 30px rgba(0,0,0,.5)' }}>
      <div className="text-center text-base mb-1">{describeMove(option, master, name)}</div>
      {option.danger && <div className="text-center text-sm text-red-300 mb-2">Careful: your Master could be captured there.</div>}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button type="button" onClick={onCancel} className={`${ghostBtn} py-3`}>
          Cancel
        </button>
        <button type="button" disabled={pending} onClick={onPlay} className={`${primaryBtn} py-3`}>
          {pending ? 'Playing…' : 'Play'}
        </button>
      </div>
    </div>
  )
}

function Finished({ view, me, rematch, history }: { view: OnitamaPlayerView; me: number; rematch?: () => Promise<boolean>; history?: GameSummary[] }) {
  const r = view.result!
  const series = seriesSummary(history, view.players)
  const [starting, setStarting] = useState(false)
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
      <div className="min-h-full flex flex-col items-center justify-center gap-4 px-4 py-3">
        <div className="oni-title text-5xl" style={{ color: '#f3c9a6' }}>
          Onitama
        </div>
        <div className="oni-brush text-xl text-center">{FINAL_HEADLINE}</div>
        <div className="oni-serif italic text-sm text-amber-100/80">{wayLine(r.way)}</div>
        <div className="w-full max-w-sm flex flex-col gap-2">
          {view.players.map((p) => (
            <div key={p.seat} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${p.seat === me ? 'bg-amber-300/20 border border-amber-300/40' : 'bg-white/5'}`}>
              <span className="w-6 shrink-0 text-center">{r.winners.includes(p.seat) ? '👑' : ''}</span>
              <span className="w-3 h-3 shrink-0 rounded-full" style={{ background: INK[p.side] }} />
              <span className="flex-1 oni-brush truncate">{p.name}</span>
              <span className="oni-serif text-sm">{r.winners.includes(p.seat) ? 'Victory' : r.way === 'draw' ? 'Draw' : ''}</span>
            </div>
          ))}
        </div>
        {series && (
          <div className="w-full max-w-sm">
            <SeriesTable series={series} players={view.players} variant="phone" />
          </div>
        )}
        {rematch && (
          <button
            type="button"
            disabled={starting}
            onClick={async () => {
              setStarting(true)
              buzz(12)
              await rematch()
              setStarting(false)
            }}
            className="mt-2 w-full max-w-sm py-3 rounded-xl bg-[#a3241c] text-amber-50 text-lg font-extrabold oni-brush shadow-lg shadow-black/40 cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-default"
          >
            {starting ? 'Starting…' : 'Rematch'}
          </button>
        )}
      </div>
    </div>
  )
}
