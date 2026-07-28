import { Data, Effect, Match as M } from 'effect'
import type * as Program from 'foldkit/program'
import { parseWalletProgramRoute } from 'wallet-core-example'

import type { WalletInitialRoute } from './wallet.js'

/** A saved Wallet replay cannot be loaded without a ReplayTapeStore. */
export class MissingWalletReplayTapeStoreError extends Data.TaggedError(
  'MissingWalletReplayTapeStoreError',
)<{ readonly message: string; readonly tapeId: Program.ReplayTapeId }> {}

/** Parses one canonical inline Wallet State or Replay path. */
export const parseWalletInitialRoute = (
  relativePath: string,
): Promise<WalletInitialRoute> =>
  Effect.runPromise(
    parseWalletProgramRoute(relativePath).pipe(
      Effect.flatMap(route =>
        M.value(route).pipe(
          M.withReturnType<
            Effect.Effect<WalletInitialRoute, MissingWalletReplayTapeStoreError>
          >(),
          M.tagsExhaustive({
            State: stateRoute => Effect.succeed(stateRoute),
            Replay: replayRoute => Effect.succeed(replayRoute),
            SavedReplay: ({ tapeId }) =>
              Effect.fail(
                new MissingWalletReplayTapeStoreError({
                  message: `Saved replay ${tapeId} needs a ReplayTapeStore`,
                  tapeId,
                }),
              ),
          }),
        ),
      ),
    ),
  )
