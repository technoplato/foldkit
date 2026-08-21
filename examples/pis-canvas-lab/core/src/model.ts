/**
 * Model surface for the lab — explicit types + chrome helpers.
 * Runtime source of truth: Program.compose in catalog.ts.
 */
import { ShowcaseShell } from './catalog.js'
import type { FocusedSlot as ChromeFocusedSlot } from './chrome.js'
import type { Model as LabModel } from './program.js'

export type Model = LabModel
export const Model = ShowcaseShell.Model

export type CanvasChrome = {
  x: number
  y: number
  scale: number
}

export type FocusedSlot = ChromeFocusedSlot
export { FocusedSlot as FocusedSlotSchema } from './chrome.js'

/** Flatten chrome canvas fields for hosts that still read model.canvas. */
export const canvasOf = (model: Model): CanvasChrome => ({
  x: model.chrome.x,
  y: model.chrome.y,
  scale: model.chrome.scale,
})
