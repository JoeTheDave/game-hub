/**
 * The 3D table for the TV, built with three.js in a <canvas> (not CSS 3D).
 *
 * - Board: the original repo's thick slab:
 *   - top: a calm washi surface with a faint ink-wash landscape in the margins (iteration 2;
 *     the stretched repo mural was distracting), double deep-red borders, and deep-red frames on
 *     the five card slots
 *   - grey edges with dark lines
 *   - the 5×5 action grid (translucent white squares with dark borders) over three slowly
 *     turning yin-yangs: the centre one and the red and blue temple homes
 * - Cards: flat textured planes painted from the repo's card design (`cardArt.ts`), UNLIT so
 *   lights and the turn glow can never wash them out (`materials.ts`).
 * - The canvas is transparent: the light paper backdrop and the ink drawings are HTML behind it;
 *   a shadow-catcher floor keeps the slab's soft shadow on that paper.
 * - Pieces: procedural lathe figures (`models.ts`) with soft shadows.
 * - Camera: a three-quarter view from behind the player to move. It swings 180° between turns.
 * - Rendering is on demand: full rate while anything moves, otherwise a low rate for the
 *   yin-yangs' slow turn. Everything is disposed on `dispose()`.
 */
import * as THREE from 'three'
import type { Color } from '@games/onitama/data'
import type { OnitamaTableView } from '@games/onitama/engine'
import { paintCard, loadCardFonts, loadCardImages, CARD_TEX_H, CARD_TEX_W } from '../cardArt'
import { REPO, REPO_IMG } from '../cardStyle'
import { BOARD_TOP_IMG } from '../assets'
import {
  BOARD_PX,
  BOARD_SIZE,
  BOARD_THICK,
  BOARD_TOP,
  CAMERA,
  CAMERA_TARGET,
  CARD_D,
  CARD_SLOTS_PX,
  CARD_W,
  GLOW_LIFT,
  GRID,
  GRID_LIFT,
  YIN_YANG,
  cameraPosition,
  cameraYaw,
  glowPose,
  type Pose,
} from './geometry'
import { makePiece, makePieceKit, type PieceKit } from './models'
import { GLOW_OPACITY, RENDER_ORDER, makeCardMaterial, makeGlowMaterial, makeShadowCatcher } from './materials'
import { cardPoses, piecePoses, sampleCamera, sampleTrack, viewerColor, type Timeline } from './timeline'

/** True when a WebGL context can be created here (false in jsdom tests and very old TV browsers). */
export function webglAvailable(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

const loadTexture = (loader: THREE.TextureLoader, url: string, onLoad: () => void) =>
  loader.load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace
    onLoad()
  })

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | undefined>((resolve) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => resolve(undefined)
    im.src = src
  })

const TEX = 2048
const K = TEX / BOARD_PX

/** Paint the board's top face (everything except the yin-yangs and the action grid). */
function paintBoardTop(ctx: CanvasRenderingContext2D, surface?: HTMLImageElement) {
  ctx.fillStyle = '#efe6d2'
  ctx.fillRect(0, 0, TEX, TEX)
  // The washi surface is square and mapped 1:1 onto the square slab top: never stretched.
  if (surface) ctx.drawImage(surface, 0, 0, TEX, TEX)
  ctx.strokeStyle = REPO.deepRed
  ctx.lineWidth = 3 * K
  for (const m of [10, 20]) ctx.strokeRect((m + 1.5) * K, (m + 1.5) * K, (BOARD_PX - 2 * m - 3) * K, (BOARD_PX - 2 * m - 3) * K)
  // Deep-red frames on the five card slots (400×260), a little finer than the repo's 10px.
  ctx.lineWidth = 6 * K
  for (const s of CARD_SLOTS_PX) ctx.strokeRect((s.x + 3) * K, (s.y + 3) * K, 394 * K, 254 * K)
}

/** Paint the action grid overlay (transparent elsewhere): the repo's 184px squares, thin ink border. */
function paintGrid(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, TEX, TEX)
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x = (GRID.x + c * 188 + 2) * K
      const y = (GRID.y + r * 188 + 2) * K
      const s = 184 * K
      // Quiet squares: a faint lighter wash with a thin ink line (subtle, but every square reads).
      ctx.fillStyle = 'rgba(255,252,244,0.32)'
      ctx.fillRect(x, y, s, s)
      ctx.strokeStyle = 'rgba(46,34,22,0.6)'
      ctx.lineWidth = 2 * K
      ctx.strokeRect(x + 1 * K, y + 1 * K, s - 2 * K, s - 2 * K)
    }
  }
}

/** A soft radial glow texture (white; tinted by the material colour). */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.32)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

interface CardObj {
  group: THREE.Group
  texture: THREE.CanvasTexture
  material: THREE.MeshBasicMaterial
}

export class OnitamaScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private kit: PieceKit
  private pieces = new Map<string, THREE.Group>()
  private cards = new Map<string, CardObj>()
  private spinners: THREE.Mesh[] = []
  private disposables: { dispose(): void }[] = []
  private glow: THREE.Mesh
  private glowTarget = 0
  private yaw = 0
  private raf = 0
  private lastRender = 0
  private dirty = true
  private anim: { tl: Timeline; t0: number; next: OnitamaTableView; done: () => void } | null = null
  private disposed = false
  private cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_D)

  constructor(canvas: HTMLCanvasElement) {
    // Transparent canvas: the light paper backdrop and ink drawings are HTML behind it.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.95
    this.scene.background = null
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, 0.5, 200)
    this.kit = makePieceKit()
    this.disposables.push(this.kit, this.cardGeo)
    this.buildTable()
    this.buildLights()
    this.glow = this.buildGlow()
    this.setCameraYaw(0)
    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  // ——— Building ———
  private tex = new THREE.TextureLoader()

  private buildTable() {
    // No table mesh: a transparent floor catches only the slab's soft shadow on the paper backdrop.
    const floorMat = makeShadowCatcher()
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.002
    floor.receiveShadow = true
    this.scene.add(floor)
    this.disposables.push(floorMat, floor.geometry)

    // The board slab: painted top, grey edges, darker underside.
    const topCanvas = document.createElement('canvas')
    topCanvas.width = topCanvas.height = TEX
    const topCtx = topCanvas.getContext('2d')!
    paintBoardTop(topCtx)
    const topTex = new THREE.CanvasTexture(topCanvas)
    topTex.colorSpace = THREE.SRGBColorSpace
    topTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    void loadImage(BOARD_TOP_IMG).then((surface) => {
      if (this.disposed) return
      paintBoardTop(topCtx, surface)
      topTex.needsUpdate = true
      this.markDirty()
    })
    // Warm grey edges (the repo's grey, nudged warm to sit on the paper); a matte top.
    const edge = new THREE.MeshStandardMaterial({ color: 0x8c857b, roughness: 0.8 })
    const top = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.92 })
    const bottom = new THREE.MeshStandardMaterial({ color: 0x3a3530 })
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD_SIZE, BOARD_THICK, BOARD_SIZE), [edge, edge, top, bottom, edge, edge])
    slab.position.y = BOARD_THICK / 2
    slab.receiveShadow = true
    slab.castShadow = true
    this.scene.add(slab)
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: 0x3a2e24 }))
    lines.position.copy(slab.position)
    this.scene.add(lines)
    this.disposables.push(topTex, edge, top, bottom, slab.geometry, lines.geometry, lines.material as THREE.Material)

    // Yin-yangs (slowly turning, like the repo's 60 s rotation).
    const yy = (url: string, x: number, z: number, size: number, y: number, opacity = 1) => {
      const t = loadTexture(this.tex, url, () => this.markDirty())
      const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity, roughness: 0.9, depthWrite: false })
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 64), m)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(x, BOARD_TOP + y, z)
      mesh.receiveShadow = true
      this.scene.add(mesh)
      this.spinners.push(mesh)
      this.disposables.push(t, m, mesh.geometry)
    }
    // The big centre yin-yang sits under the play area: softened so the grid stays calm.
    yy(REPO_IMG.yinYang, YIN_YANG.centre.x, YIN_YANG.centre.z, YIN_YANG.centre.size, 0.002, 0.5)
    yy(REPO_IMG.yinYangRed, YIN_YANG.red.x, YIN_YANG.red.z, YIN_YANG.red.size, 0.003)
    yy(REPO_IMG.yinYangBlue, YIN_YANG.blue.x, YIN_YANG.blue.z, YIN_YANG.blue.size, 0.003)

    // The action grid over everything on the board.
    const gridCanvas = document.createElement('canvas')
    gridCanvas.width = gridCanvas.height = TEX
    paintGrid(gridCanvas.getContext('2d')!)
    const gridTex = new THREE.CanvasTexture(gridCanvas)
    gridTex.colorSpace = THREE.SRGBColorSpace
    gridTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    const gridMat = new THREE.MeshStandardMaterial({ map: gridTex, transparent: true, roughness: 0.8, depthWrite: false })
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_SIZE, BOARD_SIZE), gridMat)
    grid.rotation.x = -Math.PI / 2
    grid.position.y = BOARD_TOP + GRID_LIFT
    grid.receiveShadow = true
    grid.renderOrder = RENDER_ORDER.grid
    this.scene.add(grid)
    this.disposables.push(gridTex, gridMat, grid.geometry)
  }

  private buildLights() {
    // Gentle light for a light table: soft sky, a moderate key for the pieces' form and shadows.
    // Total light on the board top stays near 1.4x, so the washi keeps its texture under ACES
    // instead of blowing out to white (cards are unlit and unaffected).
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b5a48, 0.65))
    const key = new THREE.DirectionalLight(0xfff0d8, 1.15)
    key.position.set(-6, 18, 9)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.radius = 6
    key.shadow.bias = -0.0004
    const s = key.shadow.camera as THREE.OrthographicCamera
    s.left = s.bottom = -11
    s.right = s.top = 11
    s.near = 1
    s.far = 50
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35)
    fill.position.set(8, 10, -10)
    this.scene.add(fill)
  }

  private buildGlow(): THREE.Mesh {
    const t = glowTexture()
    const m = makeGlowMaterial(t)
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m)
    g.rotation.x = -Math.PI / 2
    // Below the cards (GLOW_LIFT < CARD_LIFT) and drawn before them: it can never cover a card.
    g.position.y = BOARD_TOP + GLOW_LIFT
    g.renderOrder = RENDER_ORDER.glow
    this.scene.add(g)
    this.disposables.push(t, m, g.geometry)
    return g
  }

  // ——— Objects ———
  private pieceObj(id: string, color: Color, master: boolean): THREE.Group {
    let p = this.pieces.get(id)
    if (!p) {
      p = makePiece(this.kit, color, master)
      this.scene.add(p)
      this.pieces.set(id, p)
    }
    return p
  }

  private cardObj(id: string): CardObj {
    let c = this.cards.get(id)
    if (c) return c
    const canvas = document.createElement('canvas')
    canvas.width = CARD_TEX_W
    canvas.height = CARD_TEX_H
    const ctx = canvas.getContext('2d')!
    paintCard(ctx, id, {})
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    const material = makeCardMaterial(texture)
    const mesh = new THREE.Mesh(this.cardGeo, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.renderOrder = RENDER_ORDER.card
    const group = new THREE.Group()
    group.add(mesh)
    this.scene.add(group)
    c = { group, texture, material }
    this.cards.set(id, c)
    void Promise.all([loadCardFonts(), loadCardImages(id)]).then(([, images]) => {
      if (this.disposed) return
      paintCard(ctx, id, images)
      texture.needsUpdate = true
      this.markDirty()
    })
    return c
  }

  private place(obj: THREE.Object3D, p: Pose, tumble = 0) {
    obj.position.set(p.x, p.y, p.z)
    obj.rotation.set(0, p.yaw, 0)
    if (tumble) obj.rotateX(tumble)
  }

  /** Snap everything to a view (no animation). Drops any animation in flight (e.g. a rematch reset). */
  setView(view: OnitamaTableView) {
    this.anim = null
    const pPoses = piecePoses(view)
    const seen = new Set<string>()
    const all = [...view.board, ...view.players.flatMap((p) => p.captured)]
    for (const pv of all) {
      const pose = pPoses.get(pv.id)
      if (!pose) continue
      this.place(this.pieceObj(pv.id, pv.color, pv.master), pose)
      seen.add(pv.id)
    }
    for (const [id, obj] of this.pieces) {
      if (!seen.has(id)) {
        this.scene.remove(obj)
        this.pieces.delete(id)
      }
    }
    const cPoses = cardPoses(view)
    for (const [id, pose] of cPoses) this.place(this.cardObj(id).group, pose)
    for (const [id, c] of this.cards) {
      if (!cPoses.has(id)) {
        this.scene.remove(c.group)
        c.texture.dispose()
        c.material.dispose()
        this.cards.delete(id)
      }
    }
    this.setGlow(view.finished ? null : viewerColor(view))
    this.markDirty()
  }

  setCameraYaw(yaw: number) {
    this.yaw = yaw
    const p = cameraPosition(yaw)
    this.camera.position.set(p.x, p.y, p.z)
    this.camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z)
    this.markDirty()
  }

  /** Face the camera toward a colour at once (first view, rematch, resync). */
  faceColor(color: Color) {
    this.setCameraYaw(cameraYaw(color))
  }

  getYaw() {
    return this.yaw
  }

  private setGlow(color: Color | null) {
    const mat = this.glow.material as THREE.MeshBasicMaterial
    if (!color) {
      this.glowTarget = 0
      return
    }
    const g = glowPose(color)
    this.glow.position.x = g.x
    this.glow.position.z = g.z
    this.glow.scale.set(g.w, g.d, 1)
    this.glowTarget = GLOW_OPACITY
    if (mat.opacity === 0) mat.opacity = 0.01
  }

  /** Play a planned update, then snap to `next` and call `done`. */
  play(tl: Timeline, next: OnitamaTableView, done: () => void) {
    // Make sure every animated object exists before it moves.
    const all = [...next.board, ...next.players.flatMap((p) => p.captured)]
    for (const pv of all) this.pieceObj(pv.id, pv.color, pv.master)
    for (const t of tl.tracks) if (t.kind === 'card') this.cardObj(t.id)
    this.setGlow(null)
    this.anim = { tl, t0: performance.now(), next, done }
    this.markDirty()
  }

  markDirty() {
    this.dirty = true
  }

  resize(width: number, height: number, dpr: number) {
    this.renderer.setPixelRatio(Math.min(dpr, 2))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(1, height)
    // Keep the whole slab in frame on narrower screens.
    this.camera.fov = this.camera.aspect < 1.6 ? CAMERA.fov * (1.6 / this.camera.aspect) ** 0.8 : CAMERA.fov
    this.camera.updateProjectionMatrix()
    this.markDirty()
  }

  private loop(now: number) {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    let active = false
    if (this.anim) {
      active = true
      const { tl, t0, next, done } = this.anim
      const ms = now - t0
      for (const t of tl.tracks) {
        const obj = t.kind === 'piece' ? this.pieces.get(t.id) : this.cards.get(t.id)?.group
        if (obj) {
          const p = sampleTrack(t, ms)
          this.place(obj, p, p.tumble)
        }
      }
      if (tl.camera) this.setCameraYaw(sampleCamera(tl, ms, this.yaw))
      if (ms >= tl.total) {
        if (tl.camera) this.setCameraYaw(tl.camera.toYaw)
        this.setView(next)
        done()
      }
    }
    // Glow fade.
    const gm = this.glow.material as THREE.MeshBasicMaterial
    if (Math.abs(gm.opacity - this.glowTarget) > 0.01) {
      gm.opacity += (this.glowTarget - gm.opacity) * 0.08
      active = true
    }
    // The yin-yangs turn slowly (one turn a minute); idle frames render at ~20 fps.
    const idleDue = now - this.lastRender > 50
    if (active || this.dirty || idleDue) {
      const angle = ((now / 60000) * Math.PI * 2) % (Math.PI * 2)
      for (const s of this.spinners) s.rotation.z = angle
      this.renderer.render(this.scene, this.camera)
      this.lastRender = now
      this.dirty = false
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    for (const c of this.cards.values()) {
      c.texture.dispose()
      c.material.dispose()
    }
    for (const d of this.disposables) d.dispose()
    this.renderer.dispose()
  }
}
