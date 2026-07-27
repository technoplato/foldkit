import { Data, Effect, Match as M } from 'effect'
import { Runtime } from 'foldkit'
import * as Program from 'foldkit/program'
import { type Message, type Model, WalletProgram } from 'wallet-core-example'

/** A portable Wallet route cannot be presented by the Foldkit renderer. */
export class WalletFoldkitRouteError extends Data.TaggedError(
  'WalletFoldkitRouteError',
)<{ readonly message: string }> {}

const walletRouter = Program.makeRouter(WalletProgram)

/** Converts one canonical Wallet path to a renderer-supported Program start. */
export const walletFoldkitStartForRelativePath = (
  relativePath: string,
): Effect.Effect<
  Runtime.ProgramStart<Model, Message>,
  Program.ProgramRouteError | WalletFoldkitRouteError
> =>
  walletRouter.parse(relativePath).pipe(
    Effect.flatMap(route =>
      M.value(route).pipe(
        M.withReturnType<
          Effect.Effect<
            Runtime.ProgramStart<Model, Message>,
            WalletFoldkitRouteError
          >
        >(),
        M.tagsExhaustive({
          State: ({ model }) => Effect.succeed(Runtime.fromModel(model)),
          Replay: ({ frame, tape }) =>
            Effect.fail(
              new WalletFoldkitRouteError({
                message: `The Foldkit renderer cannot mount a ReplayController for selected frame ${frame.toString()} of ${tape.transitions.length.toString()}`,
              }),
            ),
          SavedReplay: ({ tapeId }) =>
            Effect.fail(
              new WalletFoldkitRouteError({
                message: `Saved replay ${tapeId} needs a ReplayTapeStore`,
              }),
            ),
        }),
      ),
    ),
  )

/** Selects fresh startup for the root page or parses a canonical Wallet path. */
export const walletFoldkitStartForLocation = (
  pathname: string,
  search: string,
): Effect.Effect<
  Runtime.ProgramStart<Model, Message>,
  Program.ProgramRouteError | WalletFoldkitRouteError
> => {
  if (pathname === '/' && search === '') {
    return Effect.succeed(Runtime.fresh())
  } else {
    return walletFoldkitStartForRelativePath(`${pathname}${search}`)
  }
}
