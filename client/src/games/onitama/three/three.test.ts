import { describe, expect, it } from 'vitest'
import { onitamaModule, tableView, type OnitamaAction } from '@games/onitama/engine'
import { CARDS } from '@games/onitama/data'
import { seededRng, type SeatInfo } from '@games/types'
import {
  BOARD_SIZE,
  CARD_D,
  CARD_W,
  CAMERA_TARGET,
  cameraPosition,
  cameraYaw,
  facingYaw,
  handPose,
  sidePose,
  squareWorld,
  trayPose,
  YIN_YANG,
} from './geometry'
import { ease, planTimeline, sampleCamera, sampleTrack, yawTarget, type Track } from './timeline'
import { gridCell, wrapLines } from '../cardArt'
import { ALIGNMENT, REPO_SVG } from '../cardStyle'

const seats: SeatInfo[] = [0, 1].map((i) => ({ playerOrder: i, screenName: `P${i + 1}`, color: null }))
const half = BOARD_SIZE / 2
const onBoard = (x: number, z: number) => Math.abs(x) <= half && Math.abs(z) <= half

describe('3D table geometry (the repo board, 1 unit = 100 px)', () => {
  it('lays the 5×5 grid on the slab with red at −Z and blue at +Z, temples on the home rows', () => {
    const a = squareWorld([0, 0])
    const b = squareWorld([4, 4])
    expect(b.x - a.x).toBeCloseTo(4 * 1.88, 6)
    expect(b.z - a.z).toBeCloseTo(4 * 1.88, 6)
    expect(squareWorld([2, 0]).z).toBeLessThan(0)
    expect(squareWorld([2, 4]).z).toBeGreaterThan(0)
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) expect(onBoard(squareWorld([x, y]).x, squareWorld([x, y]).z)).toBe(true)
    // temple homes sit on the home rows' centre squares
    expect(YIN_YANG.red.x).toBeCloseTo(squareWorld([2, 0]).x, 1)
    expect(YIN_YANG.red.z).toBeCloseTo(squareWorld([2, 0]).z, 0)
    expect(YIN_YANG.blue.z).toBeCloseTo(squareWorld([2, 4]).z, 0)
    // the centre yin-yang sits under the centre square
    expect(YIN_YANG.centre.x).toBeCloseTo(squareWorld([2, 2]).x, 1)
    expect(YIN_YANG.centre.z).toBeCloseTo(squareWorld([2, 2]).z, 1)
  })

  it('puts each hand in front of its player, the side card beside the board, all on the slab and not overlapping the grid', () => {
    const grid = { x0: squareWorld([0, 0]).x - 0.94, x1: squareWorld([4, 0]).x + 0.94, z0: squareWorld([0, 0]).z - 0.94, z1: squareWorld([0, 4]).z + 0.94 }
    const rects = [handPose('red', 0), handPose('red', 1), handPose('blue', 0), handPose('blue', 1), sidePose('red')].map((p) => ({
      x0: p.x - CARD_W / 2,
      x1: p.x + CARD_W / 2,
      z0: p.z - CARD_D / 2,
      z1: p.z + CARD_D / 2,
    }))
    const overlap = (a: typeof grid, b: typeof grid) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
    for (const r of rects) {
      expect(onBoard(r.x0, r.z0) && onBoard(r.x1, r.z1)).toBe(true)
      expect(overlap(r, grid)).toBe(false)
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j])).toBe(false)
    expect(handPose('red', 0).z).toBeLessThan(grid.z0)
    expect(handPose('blue', 0).z).toBeGreaterThan(grid.z1)
    // cards face their holder; the side card turns to face its receiver
    expect(handPose('red', 0).yaw).toBe(facingYaw('red'))
    expect(sidePose('blue').yaw).toBe(facingYaw('blue'))
    expect(sidePose('red').yaw).not.toBe(sidePose('blue').yaw)
  })

  it('keeps capture trays on the capturer\'s side of the slab', () => {
    for (let i = 0; i < 5; i++) {
      const r = trayPose('red', i)
      const b = trayPose('blue', i)
      expect(onBoard(r.x, r.z) && onBoard(b.x, b.z)).toBe(true)
      expect(r.z).toBeLessThan(0)
      expect(b.z).toBeGreaterThan(0)
    }
  })

  it('places the camera behind the player to move, looking across the table from above', () => {
    for (const c of ['red', 'blue'] as const) {
      const p = cameraPosition(cameraYaw(c))
      expect(p.y).toBeGreaterThan(8)
      // behind that player's home row
      expect(Math.sign(p.z - CAMERA_TARGET.z)).toBe(c === 'red' ? -1 : 1)
    }
  })
})

describe('3D animation timeline (pure)', () => {
  const track: Track = { kind: 'piece', id: 'x', from: { x: 0, y: 0.3, z: 0, yaw: 0 }, to: { x: 2, y: 0.3, z: -2, yaw: 0 }, start: 100, duration: 600, arc: 1.4 }

  it('hops pieces along an arc and lands exactly on the destination', () => {
    expect(sampleTrack(track, 0)).toMatchObject({ x: 0, z: 0, y: 0.3 })
    const mid = sampleTrack(track, 400)
    expect(mid.y).toBeCloseTo(0.3 + 1.4, 6)
    const end = sampleTrack(track, 10_000)
    expect(end.x).toBeCloseTo(2, 9)
    expect(end.z).toBeCloseTo(-2, 9)
    expect(end.y).toBeCloseTo(0.3, 9)
  })

  it('eases smoothly from 0 to 1 and turns half-turns consistently', () => {
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    expect(ease(0.5)).toBeCloseTo(0.5, 9)
    expect(yawTarget(0, Math.PI)).toBeCloseTo(Math.PI, 9)
    expect(yawTarget(Math.PI, 0)).toBeCloseTo(2 * Math.PI, 9) // keeps rotating the same way
    expect(yawTarget(0, 0.2)).toBeCloseTo(0.2, 9)
  })

  it('swings the camera to the next player within the cap, and compresses busy turns', () => {
    const rng = seededRng(9)
    let { state } = onitamaModule.setup(seats, rng)
    for (let i = 0; i < 12 && !onitamaModule.isFinished(state); i++) {
      const seat = onitamaModule.activeSeats(state)[0]
      const legal = onitamaModule.legalActions(state, seat)
      const res = onitamaModule.applyAction(state, seat, legal[0] as OnitamaAction, rng)
      if (!res.ok) throw new Error(res.error)
      const a = tableView(state, seats)
      const b = tableView(res.state, seats)
      const tl = planTimeline(res.events, a, b, 0)
      expect(tl.total).toBeLessThanOrEqual(2500)
      if (tl.camera) {
        expect(sampleCamera(tl, 0, 0)).toBeCloseTo(tl.camera.fromYaw, 9)
        expect(sampleCamera(tl, tl.total, 0)).toBeCloseTo(tl.camera.toYaw, 9)
        expect(tl.camera.duration).toBeGreaterThanOrEqual(1000)
      }
      const reduced = planTimeline(res.events, a, b, 0, true)
      expect(reduced.total).toBeLessThanOrEqual(400)
      state = res.state
    }
  })
})

describe('repo card art', () => {
  it('has the animal art and an alignment for every card', () => {
    for (const c of CARDS) {
      expect(REPO_SVG[c.id], c.id).toBeTruthy()
      expect(ALIGNMENT[c.id], c.id).toBeTruthy()
    }
    for (const k of ['swish', 'master-icon', 'logo']) expect(REPO_SVG[k]).toBeTruthy()
  })

  it('draws the attack grid upright for the holder (forward = up), like the repo', () => {
    expect(gridCell([0, 1])).toEqual([2, 1])
    expect(gridCell([1, 0])).toEqual([3, 2])
    expect(gridCell([-2, -1])).toEqual([0, 3])
  })

  it('wraps the wisdom text into at most three lines, with an ellipsis when it overflows', () => {
    const measure = (s: string) => s.length * 10
    const lines = wrapLines('one two three four five six seven eight nine ten eleven twelve', 120, measure, 3)
    expect(lines.length).toBeLessThanOrEqual(3)
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(120)
    expect(lines[lines.length - 1].endsWith('…')).toBe(true)
    expect(wrapLines('short', 120, measure)).toEqual(['short'])
  })
})

describe('iteration 2: cards never wash out; calm, centred table', () => {
  it('draws cards unlit with tone mapping off, so lights and the turn glow cannot blow them out', async () => {
    const THREE = await import('three')
    const { makeCardMaterial, makeGlowMaterial, RENDER_ORDER } = await import('./materials')
    const card = makeCardMaterial(null)
    expect(card).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect(card.toneMapped).toBe(false)
    // The glow is normal-blended (additive turns a light board white) and drawn before cards.
    const glow = makeGlowMaterial(null)
    expect(glow.blending).toBe(THREE.NormalBlending)
    expect(RENDER_ORDER.glow).toBeLessThan(RENDER_ORDER.card)
    expect(RENDER_ORDER.grid).toBeLessThan(RENDER_ORDER.glow)
  })

  it('keeps the turn glow below the cards (it lay above them and washed the near card out)', async () => {
    const g = await import('./geometry')
    expect(g.GLOW_LIFT).toBeGreaterThan(g.GRID_LIFT)
    expect(g.GLOW_LIFT).toBeLessThan(g.CARD_LIFT)
    for (const c of ['red', 'blue'] as const) {
      expect(handPose(c, 0).y).toBeCloseTo(g.BOARD_TOP + g.CARD_LIFT)
      expect(sidePose(c).y).toBeCloseTo(g.BOARD_TOP + g.CARD_LIFT)
    }
  })

  it('centres the slab under the camera so both flanks have equal room for the ink drawings', () => {
    expect(CAMERA_TARGET.x).toBe(0)
    expect(CAMERA_TARGET.z).toBe(0)
    const a = cameraPosition(cameraYaw('blue'))
    const b = cameraPosition(cameraYaw('red'))
    expect(a.x).toBeCloseTo(-b.x)
  })
})
