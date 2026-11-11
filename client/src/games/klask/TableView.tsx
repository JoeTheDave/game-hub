import { useEffect, useMemo, useRef, useState } from 'react'
import type { TableViewProps } from '../types'
import { boardGeometry } from '@games/klask/physics'
import type { KlaskTableView } from '@games/klask/engine'
import { useRealtimeHost, postAuthorityAction } from '../../realtime'
import { boardView, createRenderer, hudAnchor } from './render'
import { TableDirector, type Target } from './director'
import { bannerText, seatHex, seriesSummary, standingsRows } from './logic'
import { LivesPips, SeriesTable, Standings } from './components'
import { preloadImages } from './assets'
import './klask.css'

/**
 * The TV: runs the live physics from every phone's latest target (WebRTC, relay fallback) and
 * draws the table in canvas 2D at the display's frame rate. Points are reported to the platform
 * as the table authority (the host's signed-in browser), which keeps lives, the series and
 * rematch working like every other game.
 */
export function TableView({ instance, view, seq, onEventsDone, sound }: TableViewProps<KlaskTableView>) {
  const host = useRealtimeHost(instance.id)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1920, h: typeof window !== 'undefined' ? window.innerHeight : 1080 })
  const [banner, setBanner] = useState<{ title: string; sub: string; key: number; color: string } | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const renderer = useMemo(() => createRenderer(view.stylized), [view.stylized])
  const rendererRef = useRef(renderer)
  rendererRef.current = renderer
  const geo = boardGeometry(view.playerCount)
  const colors = useMemo(
    () => view.players.slice().sort((a, b) => a.seat - b.seat).map((p) => seatHex(p.color, p.seat)),
    [view.players]
  )
  const colorsRef = useRef(colors)
  colorsRef.current = colors
  const namesRef = useRef(view.players)
  namesRef.current = view.players

  // The director lives for the whole table session; its callbacks read the latest props via refs.
  const soundRef = useRef(sound)
  soundRef.current = sound
  const sendRef = useRef(host.send)
  sendRef.current = host.send
  const directorRef = useRef<TableDirector | null>(null)
  if (!directorRef.current) {
    directorRef.current = new TableDirector(view, {
      post: (action) => postAuthorityAction(instance.id, action),
      play: (name, volume) => soundRef.current.play(name, { volume: (volume ?? 1) * 0.6 }),
      send: (seat, data) => sendRef.current(seat, data),
      onPoint: ({ against, reason }) => {
        const p = namesRef.current.find((x) => x.seat === against)
        const b = bannerText(reason, p?.name ?? `Player ${against + 1}`)
        setBanner({ ...b, key: Date.now(), color: colorsRef.current[against] ?? '#fff' })
        const d = directorRef.current
        if (d) {
          const g = d.geo.goals.find((x) => x.seat === against)
          rendererRef.current.burst(g?.x ?? 0, g?.y ?? 0, colorsRef.current[against] ?? '#fff')
        }
      },
      onAuthError: setAuthError,
    })
  }

  useEffect(() => {
    void preloadImages()
  }, [])

  // Every platform update: nothing to animate here (the canvas is live), so release the queue.
  const wasFinished = useRef(view.finished)
  useEffect(() => {
    directorRef.current?.setView(view, performance.now())
    if (view.finished && !wasFinished.current) sound.play('win', { volume: 0.7 })
    wasFinished.current = view.finished
    onEventsDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])

  useEffect(() => {
    if (!banner) return
    const t = window.setTimeout(() => setBanner(null), 1600)
    return () => window.clearTimeout(t)
  }, [banner])

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The frame loop: physics at 120 Hz (fixed steps), drawing at the display's rate.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || typeof requestAnimationFrame === 'undefined') return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const d = directorRef.current!
      const targets: Record<number, Target> = {}
      for (const [seat, inp] of Object.entries(host.inputs.current)) targets[Number(seat)] = { x: inp.x, y: inp.y, epoch: inp.epoch }
      d.tick(dt, targets, now)
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      rendererRef.current.draw(ctx, w, h, d.world, d.geo, { colors: colorsRef.current, dt })
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [host.inputs])

  // The board fills the screen; each player's tag sits in the free space beside it, on their side.
  const v = boardView(geo, size.w, size.h)
  const hud = view.players.map((p) => ({ p, ...hudAnchor(geo, p.seat, v, size.w, size.h) }))
  const series = seriesSummary(instance.history, view.players)

  return (
    <div ref={wrapRef} className="kl-text" style={{ position: 'absolute', inset: 0, background: view.stylized ? '#05050b' : '#140e0a', overflow: 'hidden', color: '#fff' }}>
      <canvas ref={canvasRef} data-klask-canvas="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

      {hud.map(({ p, x, y, inside }) => {
        const st = host.status[p.seat]
        return (
          <div
            key={p.seat}
            data-hud={p.seat}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              opacity: p.alive ? 1 : 0.45,
              pointerEvents: 'none',
              // On the board (narrow screens only), a soft backing keeps the tag readable.
              ...(inside ? { background: 'rgba(0,0,0,.35)', padding: '6px 12px', borderRadius: 12 } : {}),
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 24, color: colors[p.seat], textShadow: '0 2px 6px rgba(0,0,0,.6)' }}>{p.name}</span>
            {view.playerCount === 2 ? (
              <span style={{ fontWeight: 800, fontSize: 34, lineHeight: 1 }}>{p.score}</span>
            ) : p.alive ? (
              <LivesPips lives={p.lives} total={view.startLives} color={colors[p.seat]} size={13} />
            ) : (
              <span style={{ fontWeight: 800, fontSize: 18 }}>OUT</span>
            )}
            <span data-conn={st?.mode ?? 'none'} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'rgba(0,0,0,.45)', opacity: 0.8 }}>
              {!st || st.mode === 'connecting' ? 'connecting…' : `${st.mode === 'p2p' ? 'P2P' : 'relay'}${st.rttMs != null ? ` · ${st.rttMs} ms` : ''}`}
            </span>
          </div>
        )
      })}

      {banner && (
        <div key={banner.key} className="kl-banner" style={{ position: 'absolute', left: '50%', top: '50%', textAlign: 'center', pointerEvents: 'none', textShadow: '0 4px 18px rgba(0,0,0,.7)' }}>
          <div className="kl-title" style={{ fontSize: 110, color: '#fde047', lineHeight: 1 }}>
            {banner.title}
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: banner.color }}>{banner.sub}</div>
        </div>
      )}

      {authError && (
        <div data-auth-error="" style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', padding: '10px 18px', borderRadius: 12, background: 'rgba(185,28,28,.9)', fontWeight: 800, fontSize: 20 }}>
          {authError}
        </div>
      )}

      {view.finished && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
          <div style={{ width: 760, maxWidth: '90vw', padding: '28px 36px', borderRadius: 24, background: view.stylized ? '#0b0b1d' : '#1d2a4a', boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}>
            <div className="kl-title" style={{ fontSize: 60, textAlign: 'center', color: '#fde047' }}>
              Klask
            </div>
            <div style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, marginBottom: 16 }}>Final Score</div>
            <Standings rows={standingsRows(view)} variant="tv" />
            {series && <SeriesTable series={series} players={view.players.map((p) => ({ seat: p.seat, name: p.name, hex: seatHex(p.color, p.seat) }))} variant="tv" />}
          </div>
        </div>
      )}
    </div>
  )
}
