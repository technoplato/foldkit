import { Data, Effect, Schema as S } from 'effect'

import type {
  InstantReadableStream,
  InstantWritableStream,
  RuleParams,
} from '@instantdb/core'

import type { InstantProgramDatabase } from '../schema/index.js'

const NonNegativeInteger = S.Int.check(S.isGreaterThanOrEqualTo(0))
const Sha256Digest = S.String.check(S.isPattern(/^[0-9a-f]{64}$/u))

/** An immutable reference to large media stored outside the Message journal. */
export const LinkedProgramArtifact = S.Struct({
  artifactId: S.NonEmptyString,
  byteLength: S.NullOr(NonNegativeInteger),
  contentSha256: S.NullOr(Sha256Digest),
  mediaType: S.NonEmptyString,
  programId: S.NonEmptyString,
  sessionId: S.NonEmptyString,
  streamId: S.NonEmptyString,
})
/** An immutable reference to large media stored outside the Message journal. */
export type LinkedProgramArtifact = typeof LinkedProgramArtifact.Type

/** A resumable byte position in one linked Instant stream. */
export const ProgramArtifactReadPosition = S.Struct({
  byteOffset: NonNegativeInteger,
  streamId: S.NonEmptyString,
})
/** A resumable byte position in one linked Instant stream. */
export type ProgramArtifactReadPosition =
  typeof ProgramArtifactReadPosition.Type

/** Creating a host-owned Instant artifact stream failed. */
export class ProgramArtifactStreamError extends Data.TaggedError(
  'ProgramArtifactStreamError',
)<{
  readonly cause: unknown
  readonly operation: 'CreateReadStream' | 'CreateWriteStream'
}> {}

/** Options for a host-authorized artifact write stream. */
export type ProgramArtifactWriteInput = Readonly<{
  clientId: string
  ruleParams?: RuleParams
}>

/** Options for resuming a host-authorized artifact read stream. */
export type ProgramArtifactReadInput = Readonly<{
  position: ProgramArtifactReadPosition
  ruleParams?: RuleParams
}>

/** Host boundary for large artifacts that Messages reference but never contain. */
export type ProgramArtifactStreamsService = Readonly<{
  createReadStream: (
    input: ProgramArtifactReadInput,
  ) => Effect.Effect<InstantReadableStream<string>, ProgramArtifactStreamError>
  createWriteStream: (
    input: ProgramArtifactWriteInput,
  ) => Effect.Effect<InstantWritableStream<string>, ProgramArtifactStreamError>
}>

/** The host-owned Instant stream surface required by the artifact adapter. */
export type ProgramArtifactStreamsBoundary = Readonly<{
  streams: Pick<
    InstantProgramDatabase['streams'],
    'createReadStream' | 'createWriteStream'
  >
}>

/** Creates resumable stream handles without placing media or credentials in Messages. */
export const makeProgramArtifactStreams = (
  database: ProgramArtifactStreamsBoundary,
): ProgramArtifactStreamsService => ({
  createReadStream: input =>
    Effect.try({
      try: () =>
        database.streams.createReadStream({
          byteOffset: input.position.byteOffset,
          ruleParams: input.ruleParams,
          streamId: input.position.streamId,
        }),
      catch: cause =>
        new ProgramArtifactStreamError({
          cause,
          operation: 'CreateReadStream',
        }),
    }),
  createWriteStream: input =>
    Effect.try({
      try: () =>
        database.streams.createWriteStream({
          clientId: input.clientId,
          ruleParams: input.ruleParams,
        }),
      catch: cause =>
        new ProgramArtifactStreamError({
          cause,
          operation: 'CreateWriteStream',
        }),
    }),
})
