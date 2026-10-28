import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AdminMenu } from '../../components/AdminMenu'
import type { PhoneViewProps } from '../types'
import type { SplendorAction, SplendorPlayerView } from '@games/splendor/engine'
import { DefsProvider, useAccumulatedDefs } from './defs'
import { CARD_BY_ID, TOKENS, type Gem, type Tier, type Token as TokenKind } from '@games/splendor/data'
import { CARD_RATIO, Card, CardBack, CountBadge, GEM_COLOR, GEM_NAME, GemImg, NobleTile, Token, seatHex } from './components'
import {
  adjustDiscard,
  discardTotal,
  findBuyBoard,
  findBuyReserved,
  findReserve,
  gemSelectable,
  selectionAction,
  toggleGem,
} from './logic'
import { TABLE_IMG } from './assets'
import './splendor.css'

type Tab = 'gems' | 'cards' | 'reserved'
type Sheet = null | { kind: 'board'; tier: Tier; slot: number; id: string } | { kind: 'deck'; tier: Tier } | { kind: 'reserved'; id: string }

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
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

const btn = 'rounded-xl font-bold transition-transform active:scale-[0.97] cursor-pointer disabled:cursor-default disabled:opacity-40 disabled:active:scale-100'
const primaryBtn = `${btn} bg-amber-400 text-stone-900 shadow-lg shadow-black/40`
const ghostBtn = `${btn} bg-white/10 text-amber-50 border border-white/15`

export function PhoneView({ view, playerOrder, sendAction, pending, error, clearError, rematch, admin }: PhoneViewProps<SplendorPlayerView, SplendorAction>) {
  const [tab, setTab] = useState<Tab>('gems')
  const [sheet, setSheet] = useState<Sheet>(null)
  const me = view.players.find((p) => p.seat === playerOrder)
  const legal = view.legalActions
  const isMyTurn = view.isMyTurn && !view.finished

  const act = async (action: SplendorAction) => {
    buzz(12)
    const ok = await sendAction(action)
    if (ok) setSheet(null)
    else buzz([30, 40, 30])
    return ok
  }

  // A rejected card sheet shouldn't linger once it's no longer my turn.
  useEffect(() => {
    if (!isMyTurn) setSheet(null)
  }, [isMyTurn])

  const turnName = view.players.find((p) => p.seat === view.turn)?.name ?? ''
  let status: ReactNode
  if (view.finished) status = 'Game over'
  else if (view.pending && view.pending.seat !== playerOrder)
    status = `${turnName} is ${view.pending.kind === 'discard' ? 'returning tokens' : 'choosing a noble'}…`
  else if (isMyTurn) status = <span className="text-emerald-300 font-bold">Your turn</span>
  else status = `Waiting for ${turnName}…`

  const takeover = view.finished ? 'finished' : view.myPending?.kind ?? null
  const defs = useAccumulatedDefs(view)

  return (
    <DefsProvider value={defs}>
    <div
      className="flex-1 min-h-0 flex flex-col relative text-amber-50"
      style={{
        backgroundImage: `linear-gradient(rgba(20,12,6,.72), rgba(20,12,6,.86)), url(${TABLE_IMG})`,
        backgroundSize: 'auto, 420px',
      }}
    >
      {/* Header: me */}
      <div className="shrink-0 px-3 pt-2 pb-2 border-b border-white/10" style={{ background: 'rgba(0,0,0,.25)' }}>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: seatHex(me?.color) }} />
          <span className="spl-serif text-xl truncate flex-1">{me?.name}</span>
          {view.endTriggered && !view.finished && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-900 text-amber-200 font-semibold">Final round</span>
          )}
          <span className="spl-numeral text-3xl">{me?.points ?? 0}</span>
          <span className="text-amber-300 text-xs">pts</span>
          {admin && <AdminMenu {...admin} />}
        </div>
        <div className="mt-1.5 grid grid-cols-6 gap-1">
          {TOKENS.map((t) => (
            <div key={t} className="flex flex-col items-center gap-0.5">
              <div className="relative" style={{ opacity: (me?.tokens[t] ?? 0) > 0 ? 1 : 0.3 }}>
                <Token gem={t} size={30} />
                <CountBadge n={me?.tokens[t] ?? 0} style={{ position: 'absolute', right: -7, top: -5, fontSize: 10 }} />
              </div>
              {t !== 'gold' ? (
                <span
                  className="text-[11px] font-bold leading-none px-1.5 py-0.5 rounded"
                  style={{ background: GEM_COLOR[t], color: t === 'white' ? '#1c1917' : '#fff', opacity: (me?.bonuses[t as Gem] ?? 0) > 0 ? 1 : 0.35 }}
                  title={`${GEM_NAME[t]} bonus`}
                >
                  +{me?.bonuses[t as Gem] ?? 0}
                </span>
              ) : (
                <span className="text-[10px] text-amber-200/80 leading-none py-0.5">{me?.tokenCount ?? 0}/10</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-1.5 text-center text-sm text-amber-100/80">{status}</div>
      </div>

      {error && (
        <button
          type="button"
          onClick={clearError}
          className="shrink-0 mx-3 mt-2 px-3 py-2 rounded-lg bg-red-900/80 text-red-100 text-sm text-left cursor-pointer"
        >
          {error} <span className="opacity-60">(tap to dismiss)</span>
        </button>
      )}

      {takeover === 'finished' ? (
        <Finished view={view} me={playerOrder} rematch={rematch} />
      ) : takeover === 'discard' && view.myPending?.kind === 'discard' ? (
        <DiscardPicker view={view} over={view.myPending.over} pending={pending} onSubmit={(tokens) => act({ type: 'discard', tokens })} />
      ) : takeover === 'noble' && view.myPending?.kind === 'noble' ? (
        <NobleChoice options={view.myPending.options} pending={pending} onPick={(nobleId) => act({ type: 'chooseNoble', nobleId })} />
      ) : (
        <>
          <div className="shrink-0 grid grid-cols-3 gap-1 px-3 pt-2">
            {(
              [
                ['gems', 'Gems'],
                ['cards', 'Cards'],
                ['reserved', `Reserved ${view.myReserved.length}/3`],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`py-2 rounded-t-xl text-sm font-semibold cursor-pointer ${tab === k ? 'bg-amber-100/15 text-amber-100' : 'text-amber-100/55'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 mx-3 mb-3 rounded-b-xl rounded-tr-xl bg-amber-100/[0.06] border border-white/10 flex flex-col">
            {tab === 'gems' && <GemsTab view={view} canAct={isMyTurn} pending={pending} onTake={act} />}
            {tab === 'cards' && <CardsTab view={view} highlight onCard={setSheet} />}
            {tab === 'reserved' && <ReservedTab view={view} highlight onCard={(id) => setSheet({ kind: 'reserved', id })} />}
          </div>
          {isMyTurn && legal.some((a) => a.type === 'pass') && (
            <div className="shrink-0 px-3 pb-3 -mt-1">
              <button type="button" disabled={pending} onClick={() => void act({ type: 'pass' })} className={`${ghostBtn} w-full py-3`}>
                No legal move — Pass
              </button>
            </div>
          )}
        </>
      )}

      {sheet && <CardSheet sheet={sheet} view={view} canAct={isMyTurn} pending={pending} onAct={act} onClose={() => setSheet(null)} />}
    </div>
    </DefsProvider>
  )
}

// ——— Gems ———
function GemsTab({ view, canAct, pending, onTake }: { view: SplendorPlayerView; canAct: boolean; pending: boolean; onTake: (a: SplendorAction) => Promise<boolean> }) {
  const [sel, setSel] = useState<Gem[]>([])
  const [ref, size] = useSize<HTMLDivElement>()
  const legal = view.legalActions
  useEffect(() => setSel([]), [view.turn, canAct])
  const chosen = selectionAction(sel, legal)
  const chip = Math.max(48, Math.min((size.w - 48) / 3, (size.h - 110) / 2 - 34, 120))

  return (
    <div className="flex-1 min-h-0 flex flex-col p-3">
      <div ref={ref} className="flex-1 min-h-0 grid grid-cols-3 content-center justify-items-center gap-y-3">
        {TOKENS.map((t) => {
          const gem = t as Gem
          const n = sel.filter((g) => g === t).length
          const selectable = canAct && t !== 'gold' && gemSelectable(gem, legal)
          return (
            <button
              key={t}
              type="button"
              disabled={!selectable && n === 0}
              onClick={() => {
                buzz(8)
                setSel((s) => toggleGem(s, gem, legal))
              }}
              className="flex flex-col items-center gap-1 cursor-pointer disabled:cursor-default"
            >
              <div
                className="relative rounded-full transition-transform"
                style={{
                  transform: n ? 'translateY(-6px) scale(1.06)' : 'none',
                  boxShadow: n ? `0 0 0 4px #fde68a, 0 0 22px 4px ${GEM_COLOR[t]}` : 'none',
                  opacity: t === 'gold' || selectable || n ? 1 : 0.38,
                }}
              >
                <Token gem={t} size={chip} />
                <CountBadge n={view.bank[t]} style={{ position: 'absolute', right: -6, top: -4, fontSize: Math.max(12, chip * 0.2) }} />
                {n > 0 && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 rounded-full bg-amber-300 text-stone-900 text-xs font-extrabold">
                    {n === 2 ? '×2' : '✓'}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-amber-100/70">{t === 'gold' ? 'Gold (reserve)' : GEM_NAME[t]}</span>
            </button>
          )
        })}
      </div>
      <p className="text-center text-xs text-amber-100/60 h-8 leading-4">
        {canAct ? 'Pick 3 different gems, or tap one twice for 2 of a kind (needs 4 in the pile).' : 'You can take gems on your turn.'}
      </p>
      {canAct && (
        <div className="flex gap-2">
          <button type="button" disabled={sel.length === 0} onClick={() => setSel([])} className={`${ghostBtn} flex-1 py-3`}>
            Clear
          </button>
          <button
            type="button"
            disabled={!chosen || pending}
            onClick={async () => {
              if (chosen && (await onTake(chosen))) setSel([])
            }}
            className={`${primaryBtn} flex-[2] py-3`}
          >
            {pending ? 'Taking…' : chosen ? `Take ${sel.length}` : 'Take'}
          </button>
        </div>
      )}
    </div>
  )
}

// ——— Board ———
function CardsTab({ view, highlight, onCard }: { view: SplendorPlayerView; highlight: boolean; onCard: (s: Sheet) => void }) {
  const [ref, size] = useSize<HTMLDivElement>()
  const gap = 6
  const nobleSize = Math.max(28, Math.min((size.w - gap * 5) / 5, size.h * 0.13))
  const cw = Math.max(30, Math.min((size.w - gap * 4) / 5, (size.h - nobleSize - gap * 4) / 3 / CARD_RATIO))
  return (
    <div ref={ref} className="flex-1 min-h-0 flex flex-col items-center justify-center p-2" style={{ gap }}>
      <div className="flex" style={{ gap }}>
        {view.nobles.map((id) => (
          <NobleTile key={id} id={id} size={nobleSize} />
        ))}
      </div>
      {([3, 2, 1] as Tier[]).map((tier) => (
        <div key={tier} className="flex" style={{ gap }}>
          <button
            type="button"
            disabled={view.decks[tier] === 0}
            onClick={() => onCard({ kind: 'deck', tier })}
            className="relative cursor-pointer disabled:cursor-default disabled:opacity-30"
          >
            <CardBack tier={tier} size={cw} />
            <CountBadge n={view.decks[tier]} style={{ position: 'absolute', right: -4, bottom: -4, fontSize: 10 }} />
          </button>
          {view.board[tier].map((id, slot) =>
            id ? (
              <button key={slot} type="button" onClick={() => onCard({ kind: 'board', tier, slot, id })} className="relative cursor-pointer">
                <Card id={id} size={cw} />
                {highlight && view.affordable[id] && <AffordableMark />}
              </button>
            ) : (
              <div key={slot} style={{ width: cw, height: cw * CARD_RATIO, borderRadius: cw * 0.07, border: '1.5px dashed rgba(255,235,200,.2)' }} />
            )
          )}
        </div>
      ))}
    </div>
  )
}

/** Affordable cards glow blue (play-test: blue, no checkmark). */
export const AFFORDABLE_GLOW = '0 0 0 2px #60a5fa, 0 0 12px 2px rgba(96,165,250,.65)'

export function AffordableMark() {
  return <span data-affordable className="absolute inset-0 rounded-[7%] pointer-events-none" style={{ boxShadow: AFFORDABLE_GLOW }} />
}

// ——— Reserved hand (private) ———
function ReservedTab({ view, highlight, onCard }: { view: SplendorPlayerView; highlight: boolean; onCard: (id: string) => void }) {
  const [ref, size] = useSize<HTMLDivElement>()
  const cw = Math.max(60, Math.min((size.w - 40) / 3, (size.h - 40) / CARD_RATIO, 170))
  if (view.myReserved.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center text-sm text-amber-100/60 px-6">
        No reserved cards. Reserve a card from the board (or blind from a deck) to hold it here and gain a gold.
      </div>
    )
  }
  return (
    <div ref={ref} className="flex-1 min-h-0 flex items-center justify-center gap-3 p-3">
      {view.myReserved.map((r) => (
        <button key={r.id} type="button" onClick={() => onCard(r.id)} className="relative cursor-pointer">
          <Card id={r.id} size={cw} />
          {highlight && view.affordable[r.id] && <AffordableMark />}
          {r.fromDeck && <span className="absolute bottom-1 right-1 text-[10px] px-1.5 rounded bg-black/60 text-amber-100">blind</span>}
        </button>
      ))}
    </div>
  )
}

// ——— Card detail sheet ———
function CardSheet({
  sheet,
  view,
  canAct,
  pending,
  onAct,
  onClose,
}: {
  sheet: Exclude<Sheet, null>
  view: SplendorPlayerView
  canAct: boolean
  pending: boolean
  onAct: (a: SplendorAction) => Promise<boolean>
  onClose: () => void
}) {
  const legal = view.legalActions
  const id = sheet.kind === 'deck' ? null : sheet.id
  const buy = !canAct
    ? null
    : sheet.kind === 'board'
      ? findBuyBoard(legal, sheet.tier, sheet.slot)
      : sheet.kind === 'reserved'
        ? findBuyReserved(legal, sheet.id)
        : null
  const reserve = !canAct ? null : sheet.kind === 'board' ? findReserve(legal, sheet.tier, sheet.slot) : sheet.kind === 'deck' ? findReserve(legal, sheet.tier, 'deck') : null
  const pay = id ? view.payments[id] : undefined
  const goldLeft = view.bank.gold > 0

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div className="spl-banner rounded-t-3xl px-4 pt-4 pb-5 flex flex-col items-center gap-3" style={{ background: 'linear-gradient(180deg,#3a2614,#22160b)' }} onClick={(e) => e.stopPropagation()}>
        {sheet.kind === 'deck' ? <CardBack tier={sheet.tier} size={150} /> : <Card id={sheet.id} size={170} />}
        {sheet.kind === 'deck' ? (
          <p className="text-sm text-amber-100/80 text-center">Reserve the top card of tier {sheet.tier} without showing anyone{goldLeft ? ', and take a gold.' : '. (No gold left.)'}</p>
        ) : pay ? (
          <PaymentLine pay={pay} bonusGem={(view.cardDefs?.[sheet.id] ?? CARD_BY_ID[sheet.id]).bonus} />
        ) : null}
        {canAct ? (
          <div className="w-full flex gap-2">
            {sheet.kind !== 'reserved' && (
              <button type="button" disabled={!reserve || pending} onClick={() => reserve && void onAct(reserve)} className={`${ghostBtn} flex-1 py-3`}>
                Reserve{goldLeft ? ' + gold' : ''}
              </button>
            )}
            {sheet.kind !== 'deck' && (
              <button type="button" disabled={!buy || pending} onClick={() => buy && void onAct(buy)} className={`${primaryBtn} flex-1 py-3`}>
                {pending ? '…' : 'Buy'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-amber-100/60">You can buy or reserve on your turn.</p>
        )}
        {canAct && sheet.kind !== 'reserved' && !reserve && view.myReserved.length >= 3 && (
          <p className="text-xs text-amber-200/70">You already hold 3 reserved cards.</p>
        )}
        <button type="button" onClick={onClose} className="text-sm text-amber-100/70 cursor-pointer py-1">
          Close
        </button>
      </div>
    </div>
  )
}

function PaymentLine({ pay, bonusGem }: { pay: { tokens: Partial<Record<TokenKind, number>>; goldShort: number }; bonusGem: Gem }) {
  const entries = TOKENS.filter((t) => (pay.tokens[t] ?? 0) > 0)
  if (pay.goldShort > 0) {
    return <p className="text-sm text-red-300 font-semibold">You&apos;re short {pay.goldShort} gem{pay.goldShort === 1 ? '' : 's'} for this card.</p>
  }
  return (
    <div className="flex items-center gap-2 text-sm text-amber-100/85">
      {entries.length === 0 ? (
        <span>Free with your bonuses!</span>
      ) : (
        <>
          <span>You pay</span>
          {entries.map((t) => (
            <span key={t} className="relative">
              <Token gem={t} size={28} />
              <CountBadge n={pay.tokens[t]!} style={{ position: 'absolute', right: -7, top: -5, fontSize: 10 }} />
            </span>
          ))}
        </>
      )}
      <span className="ml-1 flex items-center gap-1 opacity-80">
        → +1 <GemImg gem={bonusGem} size={18} />
      </span>
    </div>
  )
}

// ——— Takeovers ———
function DiscardPicker({ view, over, pending, onSubmit }: { view: SplendorPlayerView; over: number; pending: boolean; onSubmit: (t: Partial<Record<TokenKind, number>>) => void }) {
  const me = view.players.find((p) => p.seat === view.me)!
  const [pick, setPick] = useState<Partial<Record<TokenKind, number>>>({})
  const total = discardTotal(pick)
  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 gap-3">
      <div className="text-center">
        <p className="spl-serif text-2xl">Too many tokens</p>
        <p className="text-sm text-amber-100/75">You can hold 10. Return {over - total} more.</p>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-3 gap-3 content-center">
        {TOKENS.filter((t) => me.tokens[t] > 0).map((t) => (
          <div key={t} className="flex flex-col items-center gap-1">
            <div className="relative">
              <Token gem={t} size={58} />
              <CountBadge n={me.tokens[t] - (pick[t] ?? 0)} style={{ position: 'absolute', right: -6, top: -4, fontSize: 12 }} />
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={!pick[t]} onClick={() => setPick((p) => adjustDiscard(p, t, -1, me.tokens, over))} className={`${ghostBtn} w-9 h-9`}>
                −
              </button>
              <span className="w-5 text-center font-bold">{pick[t] ?? 0}</span>
              <button
                type="button"
                disabled={total >= over || (pick[t] ?? 0) >= me.tokens[t]}
                onClick={() => setPick((p) => adjustDiscard(p, t, 1, me.tokens, over))}
                className={`${ghostBtn} w-9 h-9`}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" disabled={total !== over || pending} onClick={() => onSubmit(pick)} className={`${primaryBtn} w-full py-3`}>
        Return {over} token{over === 1 ? '' : 's'}
      </button>
    </div>
  )
}

function NobleChoice({ options, pending, onPick }: { options: string[]; pending: boolean; onPick: (id: string) => void }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 p-4">
      <p className="spl-serif text-2xl text-center">More than one noble wants to visit!</p>
      <p className="text-sm text-amber-100/75 -mt-2">Choose one. The other stays on the table.</p>
      <div className="flex flex-wrap justify-center gap-4">
        {options.map((id) => (
          <button key={id} type="button" disabled={pending} onClick={() => onPick(id)} className="cursor-pointer disabled:cursor-default disabled:opacity-50 active:scale-95 transition-transform">
            <NobleTile id={id} size={130} />
          </button>
        ))}
      </div>
    </div>
  )
}

function Finished({ view, me, rematch }: { view: SplendorPlayerView; me: number; rematch?: () => Promise<boolean> }) {
  const r = view.result
  const [starting, setStarting] = useState(false)
  if (!r) return null
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-4">
      <div className="spl-title text-4xl">Splendor</div>
      <p className="text-lg">{r.winners.includes(me) ? '👑 You win!' : 'Game over'}</p>
      <div className="w-full max-w-sm flex flex-col gap-2">
        {r.ranking.map((seat) => {
          const p = view.players.find((x) => x.seat === seat)!
          return (
            <div
              key={seat}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
              style={{ background: seat === me ? 'rgba(253,230,138,.18)' : 'rgba(255,255,255,.06)', outline: seat === me ? '2px solid #fde68a' : 'none' }}
            >
              <span data-crown-col className="w-6 text-center">{r.winners.includes(seat) ? '👑' : ''}</span>
              <span className="w-3 h-3 rounded-full" style={{ background: seatHex(p.color) }} />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="font-bold">{p.points}</span>
              <span className="text-xs opacity-60">{p.cardCount} cards</span>
            </div>
          )
        })}
      </div>
      {rematch && (
        <button
          type="button"
          disabled={starting}
          onClick={async () => {
            setStarting(true)
            await rematch()
            setStarting(false)
          }}
          className={`${primaryBtn} w-full max-w-sm py-3.5 text-lg mt-1`}
        >
          {starting ? 'Starting…' : 'Rematch'}
        </button>
      )}
    </div>
  )
}
