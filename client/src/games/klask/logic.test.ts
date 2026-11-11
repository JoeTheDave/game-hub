import { describe, expect, it } from 'vitest'
import { boardGeometry, clampToZone, zoneOf } from '@games/klask/physics'
import { bannerText, clampSensitivity, recenter, deltaToTable, flickGain, isFreshMatch, makeThrottle, seriesSummary, shouldReset, standingsRows, trackpadStep } from './logic'

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9)

describe('trackpad mapping', () => {
  it('"Match the TV": finger right → striker right, finger up → striker up (screen y is down)', () => {
    const geo = boardGeometry(4)
    for (let seat = 0; seat < 4; seat++) {
      expect(deltaToTable(10, 0, seat, geo, 'tv')).toEqual({ x: 10, y: -0 })
      expect(deltaToTable(0, -10, seat, geo, 'tv')).toEqual({ x: 0, y: 10 })
    }
  })

  it('"From my side": finger away from you moves toward the centre, for every seat and board', () => {
    for (const n of [2, 3, 4]) {
      const geo = boardGeometry(n)
      for (let seat = 0; seat < n; seat++) {
        const d = deltaToTable(0, -10, seat, geo, 'side') // finger moves up the phone (away)
        const home = geo.homeSpots[seat]
        // moving along d from the home spot gets closer to the centre
        expect(Math.hypot(home.x + d.x, home.y + d.y)).toBeLessThan(Math.hypot(home.x, home.y))
        close(Math.hypot(d.x, d.y), 10)
      }
    }
  })

  it('"From my side": right is perpendicular to forward (a proper rotation, not a mirror)', () => {
    const geo = boardGeometry(4)
    // seat 0 sits at the bottom of the TV: its side mapping equals the TV mapping
    const r = deltaToTable(10, 0, 0, geo, 'side')
    close(r.x, 10)
    close(r.y, 0)
    // seat 2 sits at the top, facing down: everything is flipped
    const r2 = deltaToTable(10, -10, 2, geo, 'side')
    close(r2.x, -10)
    close(r2.y, -10)
  })

  it('flicks travel further, slow moves don’t, and the gain is capped', () => {
    expect(flickGain(5, 50)).toBe(1)
    expect(flickGain(40, 20)).toBeGreaterThan(1)
    expect(flickGain(10000, 1)).toBe(1.5)
    expect(flickGain(5, 0)).toBe(1)
  })

  it('a trackpad step scales by sensitivity and clamps into the player’s zone', () => {
    const geo = boardGeometry(2)
    const home = geo.homeSpots[0]
    const slow = trackpadStep(home, { dx: 10, dy: 0, dtMs: 100 }, { seat: 0, geo, mapping: 'tv', sensitivity: 1.5 })
    close(slow.x, home.x + 15)
    // a huge push to the right stops at seat 0's half
    const far = trackpadStep(home, { dx: 5000, dy: 0, dtMs: 100 }, { seat: 0, geo, mapping: 'tv', sensitivity: 2 })
    expect(far).toEqual(clampToZone(geo, 0, far.x, far.y))
    expect(far.x).toBeLessThan(0)
    // circle board too
    const g4 = boardGeometry(4)
    const p = trackpadStep(g4.homeSpots[1], { dx: 9999, dy: 9999, dtMs: 10 }, { seat: 1, geo: g4, mapping: 'tv', sensitivity: 2.5 })
    const again = clampToZone(g4, 1, p.x, p.y)
    expect(Math.hypot(again.x - p.x, again.y - p.y)).toBeLessThan(0.01)
    expect(zoneOf(g4, p.x, p.y)).toBe(1)
  })

  it('sensitivity is clamped to its range with a sane default', () => {
    expect(clampSensitivity(9)).toBe(1.5)
    expect(clampSensitivity(0.1)).toBe(0.3)
    expect(clampSensitivity('x')).toBe(0.6)
  })
})

describe('point flow helpers', () => {
  it('resets only after the platform applied the point and the banner had its moment', () => {
    const base = { pointRound: 3, pointAt: 1000, finished: false }
    expect(shouldReset({ ...base, now: 1200, viewRound: 4 })).toBe(false)
    expect(shouldReset({ ...base, now: 2600, viewRound: 3 })).toBe(false)
    expect(shouldReset({ ...base, now: 2600, viewRound: 4 })).toBe(true)
    expect(shouldReset({ ...base, now: 2600, viewRound: 4, finished: true })).toBe(false)
  })

  it('spots a rematch (finished → fresh round 0)', () => {
    expect(isFreshMatch(true, false, 0)).toBe(true)
    expect(isFreshMatch(false, false, 0)).toBe(false)
    expect(isFreshMatch(true, true, 5)).toBe(false)
  })

  it('banner names what happened and who conceded', () => {
    expect(bannerText('goal', 'Joe')).toEqual({ title: 'Goal!', sub: 'into Joe’s goal' })
    expect(bannerText('klask', 'Joe').title).toBe('Klask!')
    expect(bannerText('biscuits', 'Joe').title).toBe('Biscuits!')
  })

  it('throttles per key', () => {
    const t = makeThrottle(70)
    expect(t('a', 0)).toBe(true)
    expect(t('a', 50)).toBe(false)
    expect(t('b', 50)).toBe(true)
    expect(t('a', 80)).toBe(true)
  })
})

describe('end screen', () => {
  const players = [
    { seat: 0, name: 'Ann', color: 'red', lives: 0, alive: false, score: 2 },
    { seat: 1, name: 'Bo', color: 'blue', lives: 3, alive: true, score: 6 },
    { seat: 2, name: 'Cy', color: null, lives: 0, alive: false, score: 1 },
  ]
  it('standings put the winner first, show lives for 3–4 players and score for 2', () => {
    const rows = standingsRows({ playerCount: 3, players, result: { winners: [1] } }, 0)
    expect(rows[0]).toMatchObject({ seat: 1, winner: true, value: '3 ♥' })
    expect(rows.find((r) => r.seat === 0)).toMatchObject({ value: 'Out', me: true })
    const two = standingsRows({ playerCount: 2, players: players.slice(0, 2), result: { winners: [1] } })
    expect(two.map((r) => r.value)).toEqual(['6', '2'])
  })

  it('series counts match wins once there are 2+ matches', () => {
    const named = players.map((p) => ({ seat: p.seat, name: p.name }))
    expect(seriesSummary([{ scores: [0, 1, 0], winners: [1] }], named)).toBeNull()
    const s = seriesSummary(
      [
        { scores: [0, 1, 0], winners: [1] },
        { scores: [1, 0, 0], winners: [0] },
        { scores: [0, 1, 0], winners: [1] },
      ],
      named
    )!
    expect(s.totals).toEqual([1, 2, 0])
    expect(s.leaders).toEqual([1])
    expect(s.line).toContain('Bo leads the series')
  })
})

describe('recenter (input epochs)', () => {
  const home = { x: -110, y: 0 }
  it('a new epoch sends the target home and adopts the epoch', () => {
    expect(recenter({ epoch: 3, target: { x: -150, y: 20 } }, 4, home)).toEqual({ epoch: 4, target: home })
    // also when the table restarted and its epoch is lower (a reloaded TV)
    expect(recenter({ epoch: 9, target: { x: -150, y: 20 } }, 1, home)).toEqual({ epoch: 1, target: home })
  })
  it('a repeat of the current epoch keeps the target (the table just missed our input)', () => {
    expect(recenter({ epoch: 4, target: { x: -150, y: 20 } }, 4, home)).toEqual({ epoch: 4, target: { x: -150, y: 20 } })
  })
})

