import { createRealisticRenderer } from './realistic'
import { createStylizedRenderer } from './stylized'
import type { Renderer } from './common'

export function createRenderer(stylized: boolean): Renderer {
  return stylized ? createStylizedRenderer() : createRealisticRenderer()
}
export type { Renderer, View, Ctx, DrawInfo } from './common'
export { boardView, fitView, hudAnchor, toPx } from './common'
