import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { PhoneViewProps } from '../types'
import type { DragonheartAction, DragonheartPlayerView } from '@games/dragonheart/engine'
import { CARD_BY_ID, GREAT_DRAGON_POINTS, KIND_NAMES } from '@games/dragonheart/data'
import { CARD_RATIO, Card, GreatDragon, kindOf } from './components'
import { choiceLabel, handGrid, matchingOptions, previewText, selectable, toggle } from './logic'
import { TABLE_IMG } from './assets'
import { verdict } from './TableView'
import './dragonheart.css'

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0, landscape: false })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight, landscape: window.innerWidth > window.innerHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
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

const btn = 'rounded-xl font-bold transition-transform active:scale-[0.97] cursor-pointer disabled:cursor-default disabled:opacity-40 disabled:active:scale-100'
const primaryBtn = `${btn} bg-amber-400 text-stone-900 shadow-lg shadow-black/40`
const ghostBtn = `${btn} bg-white/10 text-amber-50 border border-white/15`

export function PhoneView({ view, playerOrder, sendAction, pending, error, clearError }: PhoneViewProps<DragonheartPlayerView, DragonheartAction>) {
  const [selected, setSelected] = useState<string[]>([])
  const [pileOpen, setPileOpen] = useState(false)
  const me = view.players.find((p) => p.seat === playerOrder)
  const isMyTurn = view.isMyTurn && !view.finished
  const options = isMyTurn ? view.options : []

  // A selection never outlives the hand it was made from (or my turn).
  const handKey = view.hand.join(',')
  useEffect(() => {
    setSelected((sel) => (isMyTurn ? sel.filter((id) => view.hand.includes(id)) : []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handKey, isMyTurn])

  const act = async (action: DragonheartAction) => {
    buzz(12)
    const ok = await sendAction(action)
    if (ok) setSelected([])
    else buzz([30, 40, 30])
    return ok
  }

  const turnName = view.players.find((p) => p.seat === view.turn)?.name ?? ''
  let status: ReactNode
  if (view.finished) status = 'Game over'
  else if (isMyTurn) status = <span className="text-emerald-300 font-bold">{view.finalTurn ? 'Your final turn!' : 'Your turn'}</span>
  else status = `Waiting for ${turnName}…${view.finalTurn ? ' (final turn)' : ''}`

  const deckHex = me?.deck === 'red' ? '#a32020' : '#2f8a3a'
  const matches = matchingOptions(options, selected)
  const canPass = isMyTurn && view.legalActions.some((a) => a.type === 'pass')

  return (
    <div
      className="flex-1 min-h-0 flex flex-col relative text-amber-50"
      style={{ backgroundImage: `linear-gradient(rgba(20,12,6,.7), rgba(20,12,6,.86)), url(${TABLE_IMG})`, backgroundSize: 'auto, 420px' }}
    >
      {/* Header: me */}
      <div className="shrink-0 px-3 pt-2 pb-2 border-b border-white/10" style={{ background: 'rgba(0,0,0,.25)' }}>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-5 rounded-sm shrink-0" style={{ background: deckHex }} title={`${me?.deck} deck`} />
          <span className="dh-serif text-xl truncate flex-1">{me?.name}</span>
          <span className="flex items-center gap-1 text-sm text-amber-100/85">
            {view.handMax > 5 && <GreatDragon size={26} />}
            Hand {view.hand.length}/{view.handMax}
          </span>
          <button
            type="button"
            onClick={() => setPileOpen(true)}
            className="ml-1 px-2.5 py-1 rounded-full bg-amber-100/15 border border-amber-100/20 flex items-baseline gap-1 cursor-pointer"
            title="Your score pile"
          >
            <span className="dh-numeral text-xl">{view.scorePileValue}</span>
            <span className="text-amber-300 text-xs">pts</span>
          </button>
        </div>
        <div className="mt-1.5 text-center text-sm text-amber-100/80">{status}</div>
      </div>

      {error && (
        <button type="button" onClick={clearError} className="shrink-0 mx-3 mt-2 px-3 py-2 rounded-lg bg-red-900/80 text-red-100 text-sm text-left cursor-pointer">
          {error} <span className="opacity-60">(tap to dismiss)</span>
        </button>
      )}

      {view.finished ? (
        <Finished view={view} me={playerOrder} />
      ) : (
        <>
          <Hand view={view} selected={selected} canAct={isMyTurn} onTap={(id) => setSelected((s) => toggle(options, s, id))} />

          {/* Action bar */}
          <div className="shrink-0 px-3 pb-3 pt-1 flex flex-col gap-2">
            {isMyTurn && selected.length > 0 && matches.length === 1 && (
              <>
                <div className="text-center text-sm text-amber-100/85 min-h-5">{previewText(matches[0].preview)}</div>
                <button type="button" disabled={pending} onClick={() => void act(matches[0].action)} className={`${primaryBtn} w-full py-3.5 text-lg`}>
                  {pending ? 'Playing…' : `Play ${selected.length} to ${KIND_NAMES[kindOf(selected[0])]}`}
                </button>
              </>
            )}
            {isMyTurn && selected.length > 0 && matches.length > 1 && (
              <>
                <div className="text-center text-sm text-amber-100/85">
                  Play {selected.length} {KIND_NAMES[kindOf(selected[0])]} — then take one:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {matches.map((m, i) => (
                    <button key={i} type="button" disabled={pending} onClick={() => void act(m.action)} className={`${primaryBtn} py-3.5`}>
                      {choiceLabel(m)}
                      {m.preview?.takesDragon && <span className="block text-xs font-semibold">+ the Great Dragon</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
            {isMyTurn && selected.length === 0 && !canPass && (
              <div className="text-center text-sm text-amber-100/70 py-2">Tap matching cards to play them</div>
            )}
            {canPass && (
              <button type="button" disabled={pending} onClick={() => void act({ type: 'pass' })} className={`${ghostBtn} w-full py-3`}>
                No cards in hand — Pass
              </button>
            )}
          </div>
        </>
      )}

      {pileOpen && <ScorePileSheet view={view} onClose={() => setPileOpen(false)} />}
    </div>
  )
}

function Hand({ view, selected, canAct, onTap }: { view: DragonheartPlayerView; selected: string[]; canAct: boolean; onTap: (id: string) => void }) {
  const [ref, size] = useSize<HTMLDivElement>()
  const n = Math.max(1, view.hand.length)
  const grid = handGrid(size.w, size.h, n, CARD_RATIO, 10, size.landscape)
  const options = canAct ? view.options : []
  return (
    <div ref={ref} className="flex-1 min-h-0 mx-3 my-2 flex items-center justify-center">
      {grid.cardW > 0 && (
        <div className="grid" style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.cardW}px)`, gap: 10 }}>
          {view.hand.map((id) => {
            const on = selected.includes(id)
            const can = canAct && selectable(options, selected, id)
            return (
              <button
                key={id}
                type="button"
                disabled={!canAct || (!can && !on)}
                onClick={() => {
                  buzz(6)
                  onTap(id)
                }}
                className="relative rounded-[8%] transition-transform cursor-pointer disabled:cursor-default"
                style={{
                  transform: on ? 'translateY(-6%) scale(1.03)' : undefined,
                  opacity: canAct && !can && !on ? 0.45 : 1,
                  outline: on ? '3px solid #fbbf24' : 'none',
                  outlineOffset: 2,
                }}
              >
                <Card id={id} size={grid.cardW} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ScorePileSheet({ view, onClose }: { view: DragonheartPlayerView; onClose: () => void }) {
  const cards = [...view.scorePile].sort((a, b) => CARD_BY_ID[b].points - CARD_BY_ID[a].points)
  const dragon = view.players.find((p) => p.seat === view.me)?.hasDragon
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose}>
      <div className="rounded-t-2xl p-4 max-h-[85%] flex flex-col" style={{ background: '#2a1c12' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-3">
          <span className="dh-serif text-lg flex-1">Your score pile</span>
          <span className="dh-numeral text-2xl">{view.scorePileValue}</span>
          <span className="text-amber-300 text-xs ml-1">pts</span>
        </div>
        {dragon && (
          <div className="flex items-center gap-2 text-sm text-amber-100/85 mb-2">
            <GreatDragon size={30} /> You hold the Great Dragon: +{GREAT_DRAGON_POINTS} at the end, and it wins ties.
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {cards.length === 0 ? (
            <div className="text-center text-amber-100/60 py-6">No cards collected yet.</div>
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {cards.map((id) => (
                <Card key={id} id={id} size={58} />
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} className={`${ghostBtn} w-full py-3 mt-3`}>
          Close
        </button>
      </div>
    </div>
  )
}

function Finished({ view, me }: { view: DragonheartPlayerView; me: number }) {
  const r = view.result!
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-4 px-4">
      <div className="dh-title text-4xl">Dragonheart</div>
      <div className="dh-serif text-lg text-center">{verdict(view)}</div>
      <div className="w-full max-w-sm flex flex-col gap-2">
        {view.players.map((p) => (
          <div
            key={p.seat}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl ${p.seat === me ? 'bg-amber-300/20 border border-amber-300/40' : 'bg-white/5'}`}
          >
            <span className="w-3 h-4 rounded-sm" style={{ background: p.deck === 'green' ? '#2f8a3a' : '#a32020' }} />
            <span className="flex-1 dh-serif truncate">
              {r.winners.includes(p.seat) ? '👑 ' : ''}
              {p.name}
            </span>
            {p.hasDragon && <GreatDragon size={24} />}
            <span className="dh-numeral text-2xl">{r.scores[p.seat]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
