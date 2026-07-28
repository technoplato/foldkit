import { CardboardRouter } from 'cardboard-core-example'
import { Data, Effect, Match as M } from 'effect'
import * as Program from 'foldkit/program'

import type { CardboardInitialRoute } from './cardboard.js'

/** A saved Cardboard replay needs a ReplayTapeStore supplied by its host. */
export class MissingCardboardReplayTapeStoreError extends Data.TaggedError(
  'MissingCardboardReplayTapeStoreError',
)<{ readonly message: string; readonly tapeId: Program.ReplayTapeId }> {}

/** Parses one portable Cardboard state or inline replay route. */
export const parseCardboardInitialRoute = (
  relativePath: string,
): Promise<CardboardInitialRoute> =>
  Effect.runPromise(
    CardboardRouter.parse(relativePath).pipe(
      Effect.flatMap(route =>
        M.value(route).pipe(
          M.withReturnType<
            Effect.Effect<
              CardboardInitialRoute,
              MissingCardboardReplayTapeStoreError
            >
          >(),
          M.tagsExhaustive({
            State: stateRoute => Effect.succeed(stateRoute),
            Replay: replayRoute => Effect.succeed(replayRoute),
            SavedReplay: ({ tapeId }) =>
              Effect.fail(
                new MissingCardboardReplayTapeStoreError({
                  message: `Saved replay ${tapeId} needs a ReplayTapeStore`,
                  tapeId,
                }),
              ),
          }),
        ),
      ),
    ),
  )
