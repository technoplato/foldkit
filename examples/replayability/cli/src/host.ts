import { Console, Data, Effect, Layer } from 'effect'
import { factEndpoint, makeFactHttpClient } from 'fact-http-client-example'
import { Program, Runtime } from 'foldkit'
import {
  Workbench,
  makeReplayabilityTapeStore,
  parseReplayDestination,
} from 'replayability-core-example'

import { NodeCrypto, NodeHttpClient } from '@effect/platform-node'

/** A platform carrier could not be reduced to its portable relative URI. */
export class ReplayCarrierError extends Data.TaggedError('ReplayCarrierError')<{
  readonly cause: unknown
  readonly uri: string
}> {}

/** The replay workbench did not reach a ready Model. */
export class ReplayWorkbenchStateError extends Data.TaggedError(
  'ReplayWorkbenchStateError',
)<{ readonly reason: string }> {}

/** Removes an absolute platform carrier while preserving path and query. */
export const relativeRouteForCarrier = (
  uri: string,
): Effect.Effect<string, ReplayCarrierError> => {
  if (!uri.includes('://')) {
    return Effect.succeed(uri)
  }
  return Effect.try({
    try: () => {
      const url = new URL(uri)
      return `${url.pathname}${url.search}`
    },
    catch: cause => new ReplayCarrierError({ cause, uri }),
  })
}

/** Runs an engine-owned state or replay URI through the shared workbench. */
export const executeReplayUri = (
  uri: string,
  message?: Workbench.Message,
): Effect.Effect<
  Workbench.ReadyModel,
  | ReplayCarrierError
  | ReplayWorkbenchStateError
  | Program.ProgramRouteError
  | Runtime.ProgramRuntimeStartError
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const relativeRoute = yield* relativeRouteForCarrier(uri)
      const destination = yield* parseReplayDestination(relativeRoute)
      const { program, resources } = Workbench.makeReplayWorkbench(
        destination,
        makeReplayabilityTapeStore(globalThis.fetch),
        NodeCrypto.layer,
        Layer.provide(
          makeFactHttpClient(factEndpoint),
          NodeHttpClient.layerUndici,
        ),
      )
      const runtime = yield* Runtime.makeProgramRuntime({
        program,
        resources,
      })
      yield* runtime.initialization
      const model =
        message === undefined
          ? runtime.readModel()
          : yield* runtime.run(message)
      yield* runtime.shutdown
      if (Workbench.isReady(model)) {
        return model
      } else {
        return yield* Effect.fail(
          new ReplayWorkbenchStateError({
            reason: Workbench.detailForModel(model),
          }),
        )
      }
    }),
  )

/** Prints the final display produced by a portable state or replay URI. */
export const runReplayUri = (uri: string): Effect.Effect<void, unknown> =>
  executeReplayUri(uri).pipe(
    Effect.flatMap(model => Console.log(Workbench.displayForModel(model))),
  )

/** Runs one host-allowed action against a portable Program URI. */
export const runReplayAction = (
  actionId: string,
  uri: string,
): Effect.Effect<void, unknown> =>
  executeReplayUri(uri, Workbench.PressedReplayAction({ actionId })).pipe(
    Effect.flatMap(model => Console.log(Workbench.displayForModel(model))),
  )

/** Prints an exact state link for the Model resolved by another link. */
export const runStateLink = (uri: string): Effect.Effect<void, unknown> =>
  executeReplayUri(uri).pipe(
    Effect.flatMap(model => Console.log(model.stateUri)),
  )

/** Prints a replay link for the tape and frame resolved by another link. */
export const runReplayLink = (uri: string): Effect.Effect<void, unknown> =>
  executeReplayUri(uri).pipe(
    Effect.flatMap(model => Console.log(model.replayUri)),
  )

/** Saves the resolved tape and prints its canonical UUID-backed replay link. */
export const runSavedReplayLink = (uri: string): Effect.Effect<void, unknown> =>
  executeReplayUri(uri, Workbench.ClickedSaveReplay()).pipe(
    Effect.flatMap(model => Console.log(model.replayUri)),
  )

/** Saves the resolved tape and prints a link that replays it automatically. */
export const runSavedAutoplayReplayLink = (
  uri: string,
): Effect.Effect<void, unknown> =>
  executeReplayUri(uri, Workbench.ClickedSaveReplay()).pipe(
    Effect.flatMap(model => {
      if (model.replaySaveStatus._tag === 'SavedReplay') {
        return Console.log(model.replaySaveStatus.autoplayUri)
      } else {
        return Console.log(model.replayUri)
      }
    }),
  )
