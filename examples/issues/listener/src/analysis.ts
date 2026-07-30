import { Option, Schema as S } from 'effect'

import {
  RecordingSegment,
  TrackedProduct,
  TriageCandidate,
} from '@foldkit/instant-tools/issues'

/** One finalized Scribe projection event accepted by the listener. */
export const ScribeSegmentEvent = S.Struct({
  event: S.Literal('transcript-segment'),
  initial: S.Boolean,
  recordingId: S.String,
  segment: S.Struct({
    endTimeSeconds: S.Number,
    id: S.String,
    isFinal: S.Boolean,
    startTimeSeconds: S.Number,
    text: S.String,
  }),
})
/** One finalized Scribe projection event accepted by the listener. */
export type ScribeSegmentEvent = typeof ScribeSegmentEvent.Type

/** Controlled defaults used to turn explicit issue language into a draft. */
export const ListenerAnalysisConfig = S.Struct({
  product: TrackedProduct,
  shareBaseUrl: S.String,
})
/** Controlled defaults used to turn explicit issue language into a draft. */
export type ListenerAnalysisConfig = typeof ListenerAnalysisConfig.Type

const issueLanguage =
  /\b(bug|broken|crash(?:es|ed)?|fail(?:s|ed|ing)?|issue|need to|not working|should)\b/i

const compactTitle = (text: string): string => {
  const normalized = text.replaceAll(/\s+/g, ' ').trim()
  const firstSentence = normalized.split(/[.!?]/u)[0] ?? normalized
  return firstSentence.length <= 96
    ? firstSentence
    : `${firstSentence.slice(0, 93)}…`
}

/** Creates a review-only draft from new, final, explicit issue language. */
export const analyzeScribeSegment = (
  event: ScribeSegmentEvent,
  config: ListenerAnalysisConfig,
  nowMs: number,
): Option.Option<TriageCandidate> => {
  const text = event.segment.text.trim()
  if (
    event.initial ||
    !event.segment.isFinal ||
    text === '' ||
    !issueLanguage.test(text)
  ) {
    return Option.none()
  }
  const segmentId = `scribe-${event.recordingId}-${event.segment.id}`
  const segment = RecordingSegment.make({
    createdAtMs: nowMs,
    endMilliseconds: Math.round(event.segment.endTimeSeconds * 1000),
    id: segmentId,
    publicUrl: Option.some(`${config.shareBaseUrl}/issues/triage#${segmentId}`),
    recordingId: event.recordingId,
    startMilliseconds: Math.round(event.segment.startTimeSeconds * 1000),
    transcript: text,
  })
  return Option.some(
    TriageCandidate.make({
      createdAtMs: nowMs,
      id: `candidate-${segmentId}`,
      product: config.product,
      segment,
      status: 'Draft',
      suggestedDetails: text,
      suggestedPriority: 'P2',
      suggestedTitle: compactTitle(text),
      updatedAtMs: nowMs,
    }),
  )
}
