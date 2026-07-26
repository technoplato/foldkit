import { Effect, pipe } from 'effect'
import { Program, Runtime } from 'foldkit'

const requestError = (
  operation: 'Load' | 'Save',
  cause: unknown,
  tapeId?: Program.ReplayTapeId,
): Runtime.ReplayTapeStoreError =>
  new Runtime.ReplayTapeStoreError({
    operation,
    cause,
    ...(tapeId === undefined ? {} : { tapeId }),
  })

const requireSuccessfulResponse = (
  operation: 'Load' | 'Save',
  response: Response,
  tapeId?: Program.ReplayTapeId,
): Effect.Effect<Response, Runtime.ReplayTapeStoreError> =>
  response.ok
    ? Effect.succeed(response)
    : Effect.fail(
        requestError(
          operation,
          `${response.status.toString()} ${response.statusText}`,
          tapeId,
        ),
      )

/** Creates the shared HTTP tape-store strategy used by every demo client. */
export const makeRemoteReplayTapeStore = (
  endpoint: URL,
  fetch_: typeof globalThis.fetch,
): Runtime.ReplayTapeStoreService => ({
  save: (tapeId, encodedTape) =>
    pipe(
      Effect.tryPromise({
        try: () =>
          fetch_(new URL('/replay-tapes', endpoint), {
            body: JSON.stringify({ encodedTape, tapeId }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          }),
        catch: cause => requestError('Save', cause, tapeId),
      }),
      Effect.flatMap(response =>
        requireSuccessfulResponse('Save', response, tapeId),
      ),
      Effect.asVoid,
    ),
  load: tapeId =>
    pipe(
      Effect.tryPromise({
        try: () =>
          fetch_(
            new URL(`/replay-tapes/${encodeURIComponent(tapeId)}`, endpoint),
          ),
        catch: cause => requestError('Load', cause, tapeId),
      }),
      Effect.flatMap(response =>
        requireSuccessfulResponse('Load', response, tapeId),
      ),
      Effect.flatMap(response =>
        Effect.tryPromise({
          try: () => response.text(),
          catch: cause => requestError('Load', cause, tapeId),
        }),
      ),
    ),
})

/** Creates the shared remote tape store configured for the replayability demo. */
export const makeReplayabilityTapeStore = (
  fetch_: typeof globalThis.fetch,
): Runtime.ReplayTapeStoreService =>
  makeRemoteReplayTapeStore(new URL('https://tapes.knophy.com'), fetch_)
