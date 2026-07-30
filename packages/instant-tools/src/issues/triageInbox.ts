import { Context, Data, Effect, Option, Stream } from 'effect'

import { RecordingSegment, TriageCandidate } from './domain.js'

/** Instant-backed triage or segment persistence failed. */
export class TriageInboxError extends Data.TaggedError('TriageInboxError')<{
  readonly cause: unknown
  readonly operation:
    | 'ObserveCandidates'
    | 'ObserveSegment'
    | 'SaveCandidate'
    | 'SaveSegment'
}> {}

/** The side-effecting capability required by transcript-assisted triage. */
export type TriageInboxService = Readonly<{
  observeCandidates: Stream.Stream<
    ReadonlyArray<TriageCandidate>,
    TriageInboxError
  >
  observeSegment: (
    segmentId: string,
  ) => Stream.Stream<Option.Option<RecordingSegment>, TriageInboxError>
  saveCandidate: (
    candidate: TriageCandidate,
  ) => Effect.Effect<void, TriageInboxError>
  saveSegment: (
    segment: RecordingSegment,
  ) => Effect.Effect<void, TriageInboxError>
}>

/** An injected triage inbox selected by the host. */
export class TriageInbox extends Context.Service<
  TriageInbox,
  TriageInboxService
>()('@foldkit/instant-tools/TriageInbox') {}
