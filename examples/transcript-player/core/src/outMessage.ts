import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { Milliseconds } from './ids.js'

// OUT MESSAGE

/**
 * The audio played on to a new second, at a moment by the wall clock. A
 * parent may save the place, or tell what played when.
 */
export const Advanced = ts('Advanced', {
  placeMs: Milliseconds,
  wallClockMs: S.Number,
})
/** The player stopped, paused or unplayable, at a place. */
export const Stopped = ts('Stopped', { placeMs: Milliseconds })
/** A person moved the place: a skip, a seek, or a word. */
export const Moved = ts('Moved', { placeMs: Milliseconds })
/** The audio reached the end of the recording. */
export const Finished = ts('Finished')

/** What the Transcript Player tells the Program that holds it. */
export const OutMessage = S.Union([Advanced, Stopped, Moved, Finished])
/** What the Transcript Player tells the Program that holds it. */
export type OutMessage = typeof OutMessage.Type
