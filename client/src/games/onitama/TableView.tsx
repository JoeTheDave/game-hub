import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { TableViewProps } from '../types'
import type { OnitamaTableView, PublicPlayer } from '@games/onitama/engine'
import type { GameSummary } from '../../types/game'
import { SeriesTable, seatHex, INK } from './components'
import { seriesSummary, wayLine } from './logic'
import { PARCHMENT_IMG, preloadImages } from './assets'
import { REPO_IMG } from './cardStyle'
import { OnitamaScene, webglAvailable } from './three/scene'
import { planTimeline, viewerColor, MAX_TURN_MS as TL_MAX } from './three/timeline'
import './onitama.css'

/**
 * The TV: a 3D table in a <canvas> (three.js), drawn in the style of Joe's original Onitama (the
 * mural board, yin-yangs, deep-red slots, the repo's cards), seen from behind the player to move.
 * The camera swings round between turns. Name tents, theme decorations and the final score are
 * HTML on top of the canvas.
 */

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Sounds play well below full level; the files themselves are already soft. */
const SOUND_GAIN = 0.5

/** The single uniform warm candlelight for the current turn (never the seat colour). */
export const TURN_LIGHT = 'rgba(255,196,112,0.5)'

/** Every turn's animation (camera swing included) settles within this. */
export const MAX_TURN_MS = TL_MAX

// ——— The table ———
export function TableView({ instance, view, events, seq, onEventsDone, sound }: TableViewProps<OnitamaTableView>) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<OnitamaScene | null>(null)
  const prevViewRef = useRef<OnitamaTableView | null>(null)
  const latestRef = useRef(view)
  latestRef.current = view
  const lastSeqRef = useRef<number | null>(null)
  // The seat the camera is behind (its name tent sits nearest the viewer).
  const [nearSeat, setNearSeat] = useState(view.turn)
  const [settled, setSettled] = useState(true)
  const [noGl, setNoGl] = useState(false)
  const reduced = useMemo(prefersReducedMotion, [])

  // Build the 3D scene once.
  useEffect(() => {
    void preloadImages()
    const canvas = canvasRef.current
    if (!canvas || !webglAvailable()) {
      setNoGl(true)
      return
    }
    let scene: OnitamaScene
    try {
      scene = new OnitamaScene(canvas)
    } catch {
      setNoGl(true)
      return
    }
    sceneRef.current = scene
    const fit = () => scene.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
    fit()
    window.addEventListener('resize', fit)
    const v = latestRef.current
    scene.setView(v)
    scene.faceColor(viewerColor(v))
    return () => {
      window.removeEventListener('resize', fit)
      scene.dispose()
      sceneRef.current = null
    }
  }, [])

  // A new update: plan it (pure) and let the scene play it.
  useLayoutEffect(() => {
    if (lastSeqRef.current === seq) return
    const first = lastSeqRef.current === null
    lastSeqRef.current = seq
    const prev = prevViewRef.current
    prevViewRef.current = view
    const scene = sceneRef.current
    if (!scene || first || !prev || events.length === 0) {
      if (scene) {
        scene.setView(view)
        scene.faceColor(viewerColor(view))
      }
      setNearSeat(view.turn)
      setSettled(true)
      onEventsDone()
      return
    }
    const tl = planTimeline(events, prev, view, scene.getYaw(), reduced)
    for (const s of tl.sounds) sound.play(s.name, { delayMs: s.at, volume: (s.volume ?? 1) * SOUND_GAIN })
    setSettled(false)
    const turn = view.turn
    scene.play(tl, view, () => {
      setNearSeat(turn)
      setSettled(true)
      onEventsDone()
    })
  })

  const near = view.players.find((p) => p.seat === nearSeat) ?? view.players[0]
  const far = view.players.find((p) => p.seat !== near?.seat)

  return (
    <div data-onitama-backdrop="" className="absolute inset-0 overflow-hidden" style={BACKDROP}>
      {/* The repo's martial-arts ink drawings, at their default black-on-white (multiplied onto the
          paper so the white disappears), large and flanking the board. Behind the transparent canvas. */}
      <img data-ink="left" src={REPO_IMG.inkOne} alt="" draggable={false} style={{ ...INK_DRAWING, left: '1.2vw' }} />
      <img data-ink="right" src={REPO_IMG.inkTwo} alt="" draggable={false} style={{ ...INK_DRAWING, right: '1.2vw' }} />

      <canvas ref={canvasRef} data-onitama-canvas="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: noGl ? 'none' : 'block' }} />

      <img src={REPO_IMG.logo} alt="Onitama" draggable={false} style={{ position: 'absolute', right: '2.2vw', bottom: '2.6vh', width: '11vw', opacity: 0.9, pointerEvents: 'none' }} />

      {/* Name tents: the player the camera is behind is nearest (bottom); the opponent across the table (top). */}
      {far && <NameTent p={far} pos="far" toMove={!view.finished && settled && view.turn === far.seat} />}
      {near && <NameTent p={near} pos="near" toMove={!view.finished && settled && view.turn === near.seat} />}

      {noGl && (
        <div className="oni-serif" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a2a1a', fontSize: 26, textAlign: 'center', padding: 40 }}>
          This screen can&apos;t draw the 3D table (WebGL isn&apos;t available in this browser).
        </div>
      )}

      {view.finished && settled && view.result && <Standings view={view} history={instance?.history} />}
    </div>
  )
}

/** Warm light paper (washi) behind the transparent 3D canvas, with a soft vignette. */
export const BACKDROP = {
  backgroundColor: '#efe7d5',
  backgroundImage: `radial-gradient(ellipse at 50% 45%, rgba(255,252,244,0.55) 0%, rgba(255,252,244,0) 55%, rgba(120,96,64,0.18) 100%), url(${PARCHMENT_IMG})`,
  backgroundSize: 'cover, 512px 512px',
} as const

/**
 * The ink drawings: full strength, black on white, multiplied onto the paper. Vertically centred
 * beside the board. The slab is centred and at mid-height spans about the middle 55% of the
 * screen, so 19vw on each side stays clear of it and of the corner name tents and logo.
 */
export const INK_DRAWING = {
  position: 'absolute' as const,
  top: '50%',
  transform: 'translateY(-50%)',
  width: '19vw',
  maxHeight: '40vh',
  objectFit: 'contain' as const,
  opacity: 1,
  mixBlendMode: 'multiply' as const,
  pointerEvents: 'none' as const,
}

/** A parchment tent card with the player's name, inked in their colour this game. */
function NameTent({ p, pos, toMove }: { p: PublicPlayer; pos: 'near' | 'far'; toMove: boolean }) {
  return (
    <div
      data-tent={pos}
      style={{
        position: 'absolute',
        left: '2.4vw',
        [pos === 'near' ? 'bottom' : 'top']: '3vh',
        display: 'flex',
        alignItems: 'center',
        gap: '0.8vw',
        pointerEvents: 'none',
      }}
    >
      <div
        className="oni-repo-name"
        style={{
          padding: '0.5vh 1.1vw',
          borderRadius: 4,
          background: 'linear-gradient(180deg, #f6ecd4 0%, #e6d6b2 60%, #d6c29a 100%)',
          // On light paper: a soft drop shadow and a fine ink outline; a warm glow when it's their move.
          boxShadow: toMove ? '0 0 22px 6px rgba(255,170,70,.55), 0 2px 5px rgba(60,40,20,.3)' : '0 2px 5px rgba(60,40,20,.3)',
          outline: '1px solid rgba(60,40,20,.25)',
          color: '#2a1d12',
          fontSize: pos === 'near' ? 'max(18px, 1.7vw)' : 'max(15px, 1.3vw)',
          lineHeight: 1.15,
          maxWidth: '22vw',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          borderLeft: `7px solid ${INK[p.side]}`,
          borderRight: `3px solid ${seatHex(p.seatColor)}`,
          transition: 'box-shadow 600ms ease',
        }}
      >
        {p.name}
      </div>
    </div>
  )
}

/** The end-of-game headline (Joe: always "Final Score"). */
export const FINAL_HEADLINE = 'Final Score'

function Standings({ view, history }: { view: OnitamaTableView; history?: GameSummary[] }) {
  const r = view.result!
  const series = seriesSummary(history, view.players)
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,6,2,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div
        className="oni-pop"
        style={{
          minWidth: 720,
          padding: '34px 48px',
          borderRadius: 10,
          backgroundColor: '#f3e8cf',
          backgroundImage: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.5), rgba(255,255,255,0) 60%)',
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          color: '#2a1d12',
        }}
      >
        <img src={REPO_IMG.logo} alt="Onitama" draggable={false} style={{ display: 'block', margin: '0 auto', width: 320 }} />
        <div className="oni-brush" style={{ fontSize: 30, textAlign: 'center', margin: '4px 0 6px' }}>
          {FINAL_HEADLINE}
        </div>
        <div data-way="" className="oni-serif" style={{ fontSize: 22, textAlign: 'center', fontStyle: 'italic', marginBottom: 16, color: '#5a3a1c' }}>
          {wayLine(r.way)}
        </div>
        {view.players.map((p) => {
          const won = r.winners.includes(p.seat)
          return (
            <div key={p.seat} className="oni-brush" style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 34, padding: '6px 0' }}>
              {/* The winner's crown has its own column, so every row's colour mark lines up. */}
              <span data-crown-cell="" style={{ width: 40, flexShrink: 0, textAlign: 'center' }}>
                {won ? '👑' : ''}
              </span>
              <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: '50%', background: INK[p.side] }} />
              <span style={{ flex: 1 }}>{p.name}</span>
              <span className="oni-serif" style={{ fontSize: 26, fontWeight: 700 }}>
                {won ? 'Victory' : r.way === 'draw' ? 'Draw' : ''}
              </span>
            </div>
          )
        })}
        {series && <SeriesTable series={series} players={view.players} variant="tv" />}
      </div>
    </div>
  )
}
