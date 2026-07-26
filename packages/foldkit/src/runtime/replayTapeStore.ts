import { Array, Context, Crypto, Data, Effect, Match as M, pipe } from 'effect'

import type { Ports } from '../port/port.js'
import type { Program } from '../program/program.js'
import {
  ContentAddressedReplayTapeId,
  type ProgramRoute,
  type ReplayTapeId,
  type ResolvedProgramRoute,
  type SavedReplayRoute,
  isContentAddressedReplayTapeId,
  replay,
  savedReplay,
} from '../program/route.js'
import {
  type ReplayFrameError,
  type ReplayTape,
  type ReplayTapeDecodeError,
  type ReplayTapeExportError,
  decodeReplayTape,
  encodeReplayTape,
  replayToFrame,
} from './replayTape.js'

/** A saved replay tape could not be written or read. */
export class ReplayTapeStoreError extends Data.TaggedError(
  'ReplayTapeStoreError',
)<{
  readonly operation: 'Load' | 'Save'
  readonly cause: unknown
  readonly tapeId?: ReplayTapeId
}> {}

/** A deterministic replay tape identifier could not be derived. */
export class ReplayTapeAddressError extends Data.TaggedError(
  'ReplayTapeAddressError',
)<{
  readonly cause: unknown
}> {}

/** A saved replay tape did not match the content address in its URI. */
export class ReplayTapeIntegrityError extends Data.TaggedError(
  'ReplayTapeIntegrityError',
)<{
  readonly expectedTapeId: ContentAddressedReplayTapeId
  readonly actualTapeId: ContentAddressedReplayTapeId
}> {}

/** The storage strategy used to persist and resolve encoded replay tapes. */
export type ReplayTapeStoreService = Readonly<{
  save: (
    tapeId: ContentAddressedReplayTapeId,
    encodedTape: string,
  ) => Effect.Effect<void, ReplayTapeStoreError>
  load: (tapeId: ReplayTapeId) => Effect.Effect<string, ReplayTapeStoreError>
}>

/** The injected storage capability for portable UUID-backed replay routes. */
export class ReplayTapeStore extends Context.Service<
  ReplayTapeStore,
  ReplayTapeStoreService
>()('foldkit/ReplayTapeStore') {}

/** Errors that can occur while saving one typed replay tape. */
export type SaveReplayTapeError =
  | ReplayTapeExportError
  | ReplayTapeAddressError
  | ReplayTapeStoreError

/** Errors that can occur while resolving one portable Program route. */
export type ResolveProgramRouteError =
  | ReplayTapeStoreError
  | ReplayTapeAddressError
  | ReplayTapeIntegrityError
  | ReplayTapeDecodeError
  | ReplayFrameError

const utf8Bytes = (value: string): Uint8Array =>
  Uint8Array.from(
    pipe(
      Array.fromIterable(value),
      Array.flatMap(character => {
        const maybeCodePoint = character.codePointAt(0)
        if (maybeCodePoint === undefined) {
          return []
        } else if (maybeCodePoint <= 0x7f) {
          return [maybeCodePoint]
        } else if (maybeCodePoint <= 0x7ff) {
          return [0xc0 | (maybeCodePoint >> 6), 0x80 | (maybeCodePoint & 0x3f)]
        } else if (maybeCodePoint <= 0xffff) {
          return [
            0xe0 | (maybeCodePoint >> 12),
            0x80 | ((maybeCodePoint >> 6) & 0x3f),
            0x80 | (maybeCodePoint & 0x3f),
          ]
        } else {
          return [
            0xf0 | (maybeCodePoint >> 18),
            0x80 | ((maybeCodePoint >> 12) & 0x3f),
            0x80 | ((maybeCodePoint >> 6) & 0x3f),
            0x80 | (maybeCodePoint & 0x3f),
          ]
        }
      }),
    ),
  )

const uuidUriFromDigest = (
  digest: Uint8Array,
): ContentAddressedReplayTapeId => {
  const uuidBytes = pipe(
    Array.fromIterable(digest),
    Array.take(16),
    Array.map((byte, index) => {
      if (index === 6) {
        return (byte & 0x0f) | 0x80
      } else if (index === 8) {
        return (byte & 0x3f) | 0x80
      } else {
        return byte
      }
    }),
  )
  const hexadecimal = pipe(
    uuidBytes,
    Array.map(byte => byte.toString(16).padStart(2, '0')),
    Array.join(''),
  )
  return ContentAddressedReplayTapeId.make(
    `uuiduri:${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20, 32)}`,
  )
}

/** Derives the canonical SHA-256-backed UUID URI for an encoded replay tape. */
export const deriveReplayTapeId = (
  encodedTape: string,
): Effect.Effect<
  ContentAddressedReplayTapeId,
  ReplayTapeAddressError,
  Crypto.Crypto
> =>
  pipe(
    Crypto.Crypto,
    Effect.flatMap(crypto => crypto.digest('SHA-256', utf8Bytes(encodedTape))),
    Effect.map(uuidUriFromDigest),
    Effect.mapError(cause => new ReplayTapeAddressError({ cause })),
  )

/** Saves a typed replay tape and returns its canonical UUID-backed route. */
export const saveReplayTape = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  tape: ReplayTape<Model, Message>,
  frame = tape.transitions.length,
): Effect.Effect<
  SavedReplayRoute,
  SaveReplayTapeError,
  ReplayTapeStore | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const store = yield* ReplayTapeStore
    const encodedTape = yield* encodeReplayTape(program, tape)
    const tapeId = yield* deriveReplayTapeId(encodedTape)
    yield* store.save(tapeId, encodedTape)
    return savedReplay(tapeId, frame)
  })

/** Resolves a parsed state, embedded replay, or UUID-backed replay route. */
export const resolveProgramRoute = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  route: ProgramRoute<Model, Message>,
): Effect.Effect<
  ResolvedProgramRoute<Model, Message>,
  ResolveProgramRouteError,
  ReplayTapeStore | Crypto.Crypto
> =>
  M.value(route).pipe(
    M.withReturnType<
      Effect.Effect<
        ResolvedProgramRoute<Model, Message>,
        ResolveProgramRouteError,
        ReplayTapeStore | Crypto.Crypto
      >
    >(),
    M.tagsExhaustive({
      State: stateRoute => Effect.succeed(stateRoute),
      Replay: replayRoute => Effect.succeed(replayRoute),
      SavedReplay: ({ tapeId, frame, isPlaying }) =>
        Effect.gen(function* () {
          const store = yield* ReplayTapeStore
          const encodedTape = yield* store.load(tapeId)
          if (isContentAddressedReplayTapeId(tapeId)) {
            const actualTapeId = yield* deriveReplayTapeId(encodedTape)
            if (actualTapeId !== tapeId) {
              return yield* new ReplayTapeIntegrityError({
                expectedTapeId: tapeId,
                actualTapeId,
              })
            }
          }
          const tape = yield* decodeReplayTape(program, encodedTape)
          yield* replayToFrame(program, tape, frame)
          return replay(tape, frame, isPlaying)
        }),
    }),
  )
