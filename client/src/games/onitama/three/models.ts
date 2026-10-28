/**
 * Procedural 3D pieces (no photo textures): stylised lathe-turned figures like carved game
 * pieces, in the team's lacquer colour.
 * - Student: a round base, a flared robe, a sash, shoulders and a round head (about 1.25 tall)
 * - Master: taller, with a wider robe, a gold sash, and a broad conical kasa hat (about 1.95 tall)
 * Geometry is shared across pieces; each piece gets a group whose origin is the base centre.
 */
import * as THREE from 'three'
import type { Color } from '@games/onitama/data'

export const TEAM_HEX: Record<Color, number> = { red: 0xa3241c, blue: 0x2f5c9a }
const TEAM_DARK: Record<Color, number> = { red: 0x5e120d, blue: 0x172f52 }

const v = (x: number, y: number) => new THREE.Vector2(x, y)

function lathe(points: THREE.Vector2[], segments = 28) {
  const g = new THREE.LatheGeometry(points, segments)
  g.computeVertexNormals()
  return g
}

export interface PieceKit {
  student: { body: THREE.BufferGeometry; head: THREE.BufferGeometry; sash: THREE.BufferGeometry }
  master: { body: THREE.BufferGeometry; head: THREE.BufferGeometry; sash: THREE.BufferGeometry; hat: THREE.BufferGeometry; knob: THREE.BufferGeometry }
  materials: Record<Color, { body: THREE.Material; dark: THREE.Material; head: THREE.Material }>
  gold: THREE.Material
  dispose(): void
}

export function makePieceKit(): PieceKit {
  // Profile: base plinth → robe flaring down → waist → shoulders → neck.
  const studentBody = lathe([v(0, 0), v(0.46, 0), v(0.47, 0.08), v(0.4, 0.12), v(0.4, 0.16), v(0.36, 0.24), v(0.28, 0.62), v(0.24, 0.72), v(0.3, 0.82), v(0.27, 0.9), v(0.12, 0.96), v(0.1, 1.0), v(0, 1.0)])
  const masterBody = lathe([v(0, 0), v(0.52, 0), v(0.53, 0.1), v(0.45, 0.15), v(0.45, 0.2), v(0.42, 0.3), v(0.3, 0.98), v(0.26, 1.1), v(0.34, 1.24), v(0.3, 1.34), v(0.13, 1.4), v(0.11, 1.45), v(0, 1.45)])
  const head = new THREE.SphereGeometry(0.2, 22, 16)
  const masterHead = new THREE.SphereGeometry(0.22, 22, 16)
  const sash = new THREE.TorusGeometry(0.255, 0.04, 10, 32)
  const masterSash = new THREE.TorusGeometry(0.29, 0.05, 10, 32)
  // A broad, shallow conical straw-hat (kasa) and its knob.
  const hat = lathe([v(0, 0.24), v(0.06, 0.22), v(0.5, 0.02), v(0.52, 0), v(0.5, -0.01), v(0.06, 0.19), v(0, 0.2)], 32)
  const knob = new THREE.SphereGeometry(0.05, 12, 8)
  const mat = (color: number, rough = 0.5) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05 })
  const materials = {
    red: { body: mat(TEAM_HEX.red, 0.42), dark: mat(TEAM_DARK.red, 0.6), head: mat(0xe8d5b5, 0.65) },
    blue: { body: mat(TEAM_HEX.blue, 0.42), dark: mat(TEAM_DARK.blue, 0.6), head: mat(0xe8d5b5, 0.65) },
  }
  // The kasa hat is a thin shell: show both faces.
  materials.red.dark.side = THREE.DoubleSide
  materials.blue.dark.side = THREE.DoubleSide
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9971f, roughness: 0.35, metalness: 0.6 })
  const geos = [studentBody, masterBody, head, masterHead, sash, masterSash, hat, knob]
  return {
    student: { body: studentBody, head, sash },
    master: { body: masterBody, head: masterHead, sash: masterSash, hat, knob },
    materials,
    gold,
    dispose() {
      geos.forEach((g) => g.dispose())
      for (const c of ['red', 'blue'] as const) Object.values(materials[c]).forEach((m) => m.dispose())
      gold.dispose()
    },
  }
}

/** A new piece figure. The group's origin sits at the base centre; pieces stand on +Y. */
export function makePiece(kit: PieceKit, color: Color, master: boolean): THREE.Group {
  const g = new THREE.Group()
  const m = kit.materials[color]
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, y: number, rotX = 0) => {
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.y = y
    mesh.rotation.x = rotX
    mesh.castShadow = true
    mesh.receiveShadow = true
    g.add(mesh)
    return mesh
  }
  if (master) {
    add(kit.master.body, m.body, 0)
    add(kit.master.sash, kit.gold, 0.98, Math.PI / 2)
    add(kit.master.head, m.head, 1.62)
    add(kit.master.hat, m.dark, 1.72)
    add(kit.master.knob, kit.gold, 1.98)
  } else {
    add(kit.student.body, m.body, 0)
    add(kit.student.sash, m.dark, 0.66, Math.PI / 2)
    add(kit.student.head, m.head, 1.16)
  }
  g.userData = { color, master }
  return g
}
