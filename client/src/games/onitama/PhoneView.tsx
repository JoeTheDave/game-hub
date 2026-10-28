import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AdminMenu } from '../../components/AdminMenu'
import type { PhoneViewProps } from '../types'
import type { MoveOption, OnitamaAction, OnitamaPlayerView, Square } from '@games/onitama/engine'
import { CARD_BY_ID } from '@games/onitama/data'
import type { GameSummary } from '../../types/game'
import { Card, INK, Piece, SeriesTable, TempleMark } from './components'
import { destinations, isSameMove, moveLabel, movablePieces, mustPass, phoneCell, seriesSummary, wayLine } from './logic'
import { ACTION_AREA_PX, phoneLayout, type PhoneLayout } from './phoneLayout'
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

export { ACTION_AREA_PX }

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
        <InGame
          view={view}
          opp={opp}
          options={options}
          isMyTurn={isMyTurn}
          passOnly={passOnly}
          pending={pending}
          selCard={selCard}
          selFrom={selFrom}
          confirm={confirm}
          onPick={pickCard}
          onPiece={(sq) => {
            buzz(6)
            setConfirm(null)
            setSelFrom((f) => (same(f, sq) ? null : sq))
          }}
          onDest={(o) => {
            buzz(8)
            // Tapping another option switches the selection; tapping the chosen one again keeps it.
            setConfirm(o)
          }}
          onCancel={() => setConfirm(null)}
          act={act}
        />
      )}
    </div>
  )
}

/**
 * Everything below the header during play, laid out by the pure `phoneLayout` for the measured
 * size: portrait stacks opponent / board / my cards / actions; landscape puts the board left and
 * the rest right. The board always fits and never disappears; the action area is fixed.
 */
function InGame(props: {
  view: OnitamaPlayerView
  opp: OnitamaPlayerView['players'][number] | undefined
  options: MoveOption[]
  isMyTurn: boolean
  passOnly: boolean
  pending: boolean
  selCard: string | null
  selFrom: Square | null
  confirm: MoveOption | null
  onPick: (id: string) => void
  onPiece: (sq: Square) => void
  onDest: (o: MoveOption) => void
  onCancel: () => void
  act: (a: OnitamaAction) => Promise<boolean>
}) {
  const [ref, size] = useSize<HTMLDivElement>()
  const L = phoneLayout(size.w, size.h)
  return (
    <div ref={ref} data-orientation={L.orientation} className="flex-1 min-h-0 relative">
      <InGameBody {...props} L={L} />
    </div>
  )
}

/** The positioned pieces of the in-game screen (exported for tests via PhoneInGameAt). */
function InGameBody({
  view,
  opp,
  options,
  isMyTurn,
  passOnly,
  pending,
  selCard,
  selFrom,
  confirm,
  onPick,
  onPiece,
  onDest,
  onCancel,
  act,
  L,
}: Parameters<typeof InGame>[0] & { L: PhoneLayout }) {
  const box = (b: { x: number; y: number; w: number; h: number }) => ({ position: 'absolute' as const, left: b.x, top: b.y, width: b.w, height: b.h })
  const oppCardW = Math.max(24, Math.min(44, Math.floor(L.opp.h * 0.62)))
  const confirmMaster = confirm && confirm.action.type === 'move' ? !!view.board.find((p) => same([p.x, p.y], (confirm.action as { from: Square }).from))?.master : false
  const confirmName = confirm ? (CARD_BY_ID[(confirm.action as { card: string }).card]?.name ?? '') : ''
  return (
    <>
      {/* The opponent's cards (public), facing them */}
      {opp && (
        <div className="flex items-center gap-2" style={box(L.opp)}>
          <span className="oni-brush text-sm text-amber-100/70 truncate max-w-[40%]">{opp.name}</span>
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: INK[opp.side] }} />
          <div className="flex-1" />
          {opp.hand.map((id) => (
            <Card key={id} id={id} w={oppCardW} facing="down" quote={false} />
          ))}
        </div>
      )}

      <div data-phone-board-box="" style={box(L.board)}>
        <PhoneBoard
          view={view}
          side={L.board.w}
          options={options}
          selCard={selCard}
          selFrom={selFrom}
          selected={confirm}
          interactive={isMyTurn && !passOnly}
          onPiece={onPiece}
          onDest={onDest}
        />
      </div>

      <div style={box(L.cards)}>
        <MyCards view={view} handW={L.handW} sideW={L.sideW} selCard={selCard} canPick={isMyTurn} onPick={onPick} />
      </div>

      {/* Action area: always reserved, so nothing resizes as you choose. The confirm bar lives
          here too, naming the chosen move. */}
      <div className="flex flex-col justify-center gap-1.5" style={box(L.action)}>
        {confirm && confirm.action.type === 'move' ? (
          <>
            <div data-confirm-text="" className="text-center text-sm leading-tight truncate">
              {moveLabel(confirm, confirmMaster, confirmName, view.myColor)}
              {confirm.danger && <span className="text-red-300"> · your Master could be captured</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={onCancel} className={`${ghostBtn} py-2.5`}>
                Cancel
              </button>
              <button type="button" disabled={pending} onClick={() => void act(confirm.action)} className={`${primaryBtn} py-2.5`}>
                {pending ? 'Playing…' : 'Play'}
              </button>
            </div>
          </>
        ) : passOnly ? (
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
    </>
  )
}

/** Test hook: the in-game screen laid out for an explicit size (no measuring). */
export function PhoneInGameAt(props: Parameters<typeof InGame>[0] & { w: number; h: number }) {
  const { w, h, ...rest } = props
  return (
    <div style={{ position: 'relative', width: w, height: h }}>
      <InGameBody {...rest} L={phoneLayout(w, h)} />
    </div>
  )
}

/** The board seen from my own side: my home row at the bottom, forward = up. */
export function PhoneBoard({
  view,
  side,
  options,
  selCard,
  selFrom,
  selected,
  interactive,
  onPiece,
  onDest,
}: {
  view: OnitamaPlayerView
  side: number
  options: MoveOption[]
  selCard: string | null
  selFrom: Square | null
  /** The chosen destination (marked distinctly, with a ghost piece and an arrow). */
  selected: MoveOption | null
  interactive: boolean
  onPiece: (sq: Square) => void
  onDest: (o: MoveOption) => void
}) {
  const cell = side / 5
  const me = view.myColor
  const movable = interactive && selCard ? movablePieces(options, selCard) : []
  const dests = interactive ? destinations(options, selCard, selFrom) : []
  return (
    <>
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
            if (isSameMove(selected, o)) return null // drawn below as the selected marker
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
          {selected && selected.action.type === 'move' && (
            <SelectedMarker view={view} option={selected} cell={cell} onTap={() => onDest(selected)} />
          )}
        </div>
      )}
    </>
  )
}

/**
 * The chosen destination: a bold filled square with a ring, a ghost of the moving piece on it,
 * and an arrow from the piece, so it's unmistakable which of several options is selected.
 */
function SelectedMarker({ view, option, cell, onTap }: { view: OnitamaPlayerView; option: MoveOption; cell: number; onTap: () => void }) {
  const a = option.action as { from: Square; to: Square }
  const me = view.myColor
  const [fc, fr] = phoneCell(a.from, me)
  const [tc, tr] = phoneCell(a.to, me)
  const piece = view.board.find((p) => same([p.x, p.y], a.from))
  const tint = option.danger ? '220,38,38' : '234,179,8'
  const x1 = (fc + 0.5) * cell
  const y1 = (fr + 0.5) * cell
  const x2 = (tc + 0.5) * cell
  const y2 = (tr + 0.5) * cell
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  // stop the arrow at the edge of the destination ring
  const ex = x2 - ((x2 - x1) / len) * cell * 0.36
  const ey = y2 - ((y2 - y1) / len) * cell * 0.36
  return (
    <>
      <svg className="absolute inset-0 pointer-events-none" width={cell * 5} height={cell * 5} style={{ zIndex: 3 }}>
        <defs>
          <marker id="oni-sel-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={`rgb(${tint})`} />
          </marker>
        </defs>
        <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={`rgb(${tint})`} strokeWidth={Math.max(3, cell * 0.07)} strokeLinecap="round" markerEnd="url(#oni-sel-arrow)" opacity={0.95} />
      </svg>
      <button
        type="button"
        data-dest-selected=""
        onClick={onTap}
        className="absolute flex items-center justify-center cursor-pointer rounded-md"
        style={{
          left: tc * cell + 2,
          top: tr * cell + 2,
          width: cell - 4,
          height: cell - 4,
          zIndex: 4,
          background: `rgba(${tint},.38)`,
          boxShadow: `inset 0 0 0 4px rgb(${tint}), 0 0 14px rgba(${tint},.7)`,
        }}
      >
        {piece && (
          <span style={{ opacity: 0.6 }}>
            <Piece id={`${piece.id}-ghost`} color={piece.color} master={piece.master} size={cell * (piece.master ? 0.8 : 0.7)} />
          </span>
        )}
      </button>
    </>
  )
}

/** My two cards (large, with move diagrams) and the side card (small, for reference). */
function MyCards({ view, handW, sideW, selCard, canPick, onPick }: { view: OnitamaPlayerView; handW: number; sideW: number; selCard: string | null; canPick: boolean; onPick: (id: string) => void }) {
  const me = view.players.find((p) => p.seat === view.me)
  const gap = 8
  const sideMine = view.sideFor === view.me
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ gap }}>
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
