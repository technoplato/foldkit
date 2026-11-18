import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { Milliseconds, SearchQuery } from './ids.js'
import { Match, Passage } from './model.js'

// FACT

/**
 * The audio reached a place, at a moment by the wall clock: `placeMs` into
 * the recording at `wallClockMs` since 1970, so a holder knows what played
 * when, such as 12:03 into a book at 15:20:03.
 */
export const ReachedPlace = m('ReachedPlace', {
  placeMs: Milliseconds,
  wallClockMs: S.Number,
})
/** The audio reached the end of the recording. */
export const ReachedEnd = m('ReachedEnd')
/** The audio would not play, and why, safe to show. */
export const FailedPlayAudio = m('FailedPlayAudio', { reason: S.String })
/** The words near the place arrived. */
export const ReceivedPassages = m('ReceivedPassages', {
  passages: S.Array(Passage),
})
/** The words near the place could not be read, and why, safe to show. */
export const FailedLoadTranscript = m('FailedLoadTranscript', {
  reason: S.String,
})
/**
 * A search of the recording for `query` finished: how many places it
 * found, and the first of them, each with its time and a few words
 * around it.
 */
export const ReceivedMatches = m('ReceivedMatches', {
  query: SearchQuery,
  total: S.Int,
  matches: S.Array(Match),
  partsRead: S.Int,
  partsTotal: S.Int,
})
/**
 * More of the recording's words are in for searching: `partsRead` of the
 * `partsTotal` parts they are read in.
 */
export const ReadSearchWords = m('ReadSearchWords', {
  partsRead: S.Int,
  partsTotal: S.Int,
})
/** The recording's words could not be read for searching, and why, safe to show. */
export const FailedReadSearchWords = m('FailedReadSearchWords', {
  reason: S.String,
})
/** The recording could not be searched for `query`, and why, safe to show. */
export const FailedSearch = m('FailedSearch', {
  query: SearchQuery,
  reason: S.String,
})
