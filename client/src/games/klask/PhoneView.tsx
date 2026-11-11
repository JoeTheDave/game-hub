import { useCallback, useEffect, useRef, useState } from 'react'
import type { PhoneViewProps } from '../types'
import { AdminMenu } from '../../components/AdminMenu'
import { boardGeometry, type Vec } from '@games/klask/physics'
import type { KlaskAction, KlaskPlayerView } from '@games/klask/engine'
import { useRealtimeController } from '../../realtime'
import { SENSITIVITY, clampSensitivity, recenter, seatHex, seriesSummary, standingsRows, trackpadStep, type Mapping } from './logic'
import { LivesPips, SeriesTable, Standings } from './components'
import './klask.css'

// v2: the default dropped from 1.1 to 0.6; old saved values are ignored rather than migrated.
const SENS_KEY = 'klask:sensitivity:v2'
const MAP_KEY = 'klask:mapping'
const HEARTBEAT_MS = 100

function readSetting<T>(key: string, parse: (v: string | null) => T): T {
  try {
    return parse(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null)
  } catch {
    return parse(null)
  }
}
const buzz = (ms: number) => {
  // Android only (iOS Safari has no Vibration API).
  try {
    navigator.vibrate?.(ms)
  } catch {
    // ignore
  }
}

/**
 * The phone is an eyes-up trackpad: the whole screen is the pad, finger movement moves the
 * striker (relative, so lifting and replacing the finger never jumps it), and the player watches
 * the TV. Inputs go peer-to-peer to the TV when possible, else through the relay.
 */
export function PhoneView({ instance, view, playerOrder, rematch, admin, error }: PhoneViewProps<KlaskPlayerView, KlaskAction>) {
  const me = view.players.find((p) => p.seat === playerOrder)
  const hex = seatHex(me?.color, playerOrder)
  const geo = boardGeometry(view.playerCount)
  const [sensitivity, setSensitivity] = useState(() => readSetting(SENS_KEY, (v) => (v == null ? SENSITIVITY.default : clampSensitivity(Number(v)))))
  const [mapping, setMapping] = useState<Mapping>(() => readSetting(MAP_KEY, (v) => (v === 'side' ? 'side' : 'tv')))
  const [settings, setSettings] = useState(false)
  const target = useRef<Vec>({ ...geo.homeSpots[playerOrder] })
  /** The table's input epoch this phone's targets are for (see TableDirector.epoch). */
  const epoch = useRef(0)
  const live = !view.finished && view.alive
  const sendRef = useRef<(x: number, y: number, epoch?: number) => void>(() => {})

  const onFeedback = useCallback(
    (data: unknown) => {
      const d = data as { re?: string; kind?: string; epoch?: number } | null
      if (d?.re === 'center') {
        const next = recenter({ epoch: epoch.current, target: target.current }, d.epoch, boardGeometry(view.playerCount).homeSpots[playerOrder])
        epoch.current = next.epoch
        target.current = next.target
        // Answer at once, so the table has a current-epoch target without waiting for a touch.
        sendRef.current(next.target.x, next.target.y, next.epoch)
      } else if (d?.kind === 'hit') buzz(8)
      else if (d?.kind === 'snap') buzz(20)
      else if (d?.kind === 'point') buzz(60)
    },
    [view.playerCount, playerOrder]
  )
  const rt = useRealtimeController(instance.id, live ? playerOrder : null, onFeedback)
  sendRef.current = rt.send

  // A new play (or a new match) re-centres too, in case the TV's feedback was missed.
  useEffect(() => {
    target.current = { ...geo.homeSpots[playerOrder] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.round, view.playerCount, playerOrder])

  const touching = useRef<{ id: number; x: number; y: number; t: number } | null>(null)
  const send = rt.send
  useEffect(() => {
    if (!live) return
    const h = window.setInterval(() => {
      if (touching.current) send(target.current.x, target.current.y, epoch.current)
    }, HEARTBEAT_MS)
    return () => window.clearInterval(h)
  }, [live, send])

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touching.current) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    touching.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = touching.current
    if (!t || t.id !== e.pointerId) return
    const next = trackpadStep(target.current, { dx: e.clientX - t.x, dy: e.clientY - t.y, dtMs: e.timeStamp - t.t }, { seat: playerOrder, geo, mapping, sensitivity })
    touching.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp }
    target.current = next
    rt.send(next.x, next.y, epoch.current)
  }
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (touching.current?.id === e.pointerId) touching.current = null
  }

  const saveSens = (v: number) => {
    const c = clampSensitivity(v)
    setSensitivity(c)
    try {
      localStorage.setItem(SENS_KEY, String(c))
    } catch {
      // ignore
    }
  }
  const saveMap = (m: Mapping) => {
    setMapping(m)
    try {
      localStorage.setItem(MAP_KEY, m)
    } catch {
      // ignore
    }
  }

  if (view.finished) return <Finished view={view} me={playerOrder} rematch={rematch} history={instance.history} error={error} admin={admin} />

  const conn = rt.status.mode === 'p2p' ? 'P2P' : rt.status.mode === 'relay' ? 'Relay' : 'Connecting…'
  return (
    <div className="kl-text flex-1 min-h-0 flex flex-col relative select-none" style={{ color: '#fff', background: `radial-gradient(circle at 50% 40%, ${hex}55, #0b1020 70%)` }}>
      {/* A slim header for the rare glance down. */}
      <div className="shrink-0 flex items-center gap-3 px-4 pt-2 pb-2" style={{ background: 'rgba(0,0,0,.25)' }}>
        <span className="w-4 h-4 rounded-full shrink-0" style={{ background: hex }} />
        <span className="font-extrabold truncate">{me?.name ?? 'You'}</span>
        <span className="ml-auto flex items-center gap-3">
          {view.playerCount === 2 ? <span className="font-extrabold text-xl">{me?.score ?? 0}</span> : <LivesPips lives={me?.lives ?? 0} total={view.startLives} color={hex} size={11} />}
          <span data-conn={rt.status.mode} className="text-xs px-2 py-0.5 rounded-full bg-black/40">
            {conn}
          </span>
          <button type="button" aria-label="Controls" onClick={() => setSettings(true)} className="w-8 h-8 rounded-full bg-white/10 cursor-pointer">
            ⚙
          </button>
          {admin && <AdminMenu {...admin} />}
        </span>
      </div>

      {view.alive ? (
        <div
          data-trackpad=""
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onContextMenu={(e) => e.preventDefault()}
          className="flex-1 min-h-0 flex items-center justify-center"
          style={{ touchAction: 'none', overscrollBehavior: 'none', cursor: 'crosshair' }}
        >
          <div className="text-center pointer-events-none" style={{ opacity: 0.55 }}>
            <div className="kl-title text-4xl" style={{ color: hex }}>
              Klask
            </div>
            <div className="mt-2 text-sm">Slide anywhere to move · watch the TV</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex items-center justify-center text-center px-6">
          <div>
            <div className="kl-title text-3xl">You’re out</div>
            <div className="mt-2 opacity-75">Watch the rest of the match on the TV.</div>
          </div>
        </div>
      )}

      {settings && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/50" onClick={() => setSettings(false)}>
          <div className="w-full max-w-md rounded-t-2xl p-5 pb-8" style={{ background: '#141a30' }} onClick={(e) => e.stopPropagation()}>
            <div className="font-extrabold text-lg mb-3">Controls</div>
            <label className="block text-sm mb-1">Sensitivity · {sensitivity.toFixed(2)}×</label>
            <input
              type="range"
              min={SENSITIVITY.min}
              max={SENSITIVITY.max}
              step={SENSITIVITY.step}
              value={sensitivity}
              onChange={(e) => saveSens(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
            <div className="text-sm mt-4 mb-1">Direction</div>
            <div className="flex gap-2">
              {(
                [
                  ['tv', 'Match the TV'],
                  ['side', 'From my side'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => saveMap(m)}
                  className={`flex-1 py-2 rounded-xl font-bold cursor-pointer ${mapping === m ? 'bg-yellow-300 text-slate-900' : 'bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setSettings(false)} className="mt-5 w-full py-3 rounded-xl bg-white/15 font-bold cursor-pointer">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Finished({
  view,
  me,
  rematch,
  history,
  error,
  admin,
}: {
  view: KlaskPlayerView
  me: number
  rematch?: () => Promise<boolean>
  history?: { scores: number[]; winners: number[] }[]
  error: string | null
  admin?: PhoneViewProps['admin']
}) {
  const series = seriesSummary(history, view.players)
  const [starting, setStarting] = useState(false)
  return (
    <div className="kl-text flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ color: '#fff', background: '#0b1020' }}>
      <div className="min-h-full flex flex-col items-center justify-center gap-4 px-4 py-3">
        <div className="w-full max-w-sm flex items-center">
          <div className="kl-title text-3xl flex-1 text-center" style={{ color: '#fde047' }}>
            Klask
          </div>
          {admin && <AdminMenu {...admin} />}
        </div>
        <div className="text-lg font-extrabold">Final Score</div>
        <div className="w-full max-w-sm">
          <Standings rows={standingsRows(view, me)} variant="phone" />
        </div>
        {series && (
          <div className="w-full max-w-sm">
            <SeriesTable series={series} players={view.players.map((p) => ({ seat: p.seat, name: p.name, hex: seatHex(p.color, p.seat) }))} variant="phone" />
          </div>
        )}
        {error && <div className="text-red-300 text-sm">{error}</div>}
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
            className="w-full max-w-sm py-3 rounded-xl bg-yellow-300 text-slate-900 text-lg font-extrabold cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-default"
          >
            {starting ? 'Starting…' : 'Rematch'}
          </button>
        )}
      </div>
    </div>
  )
}
