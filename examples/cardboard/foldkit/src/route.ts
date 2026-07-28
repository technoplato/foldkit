import {
  CardboardRouter,
  type Message,
  type Model,
} from 'cardboard-core-example'
import { Data, Effect, Match as M } from 'effect'
import { Runtime } from 'foldkit'
import * as Program from 'foldkit/program'

/** A portable Cardboard route cannot be mounted by the Foldkit page host. */
export class CardboardFoldkitRouteError extends Data.TaggedError(
  'CardboardFoldkitRouteError',
)<{ readonly message: string }> {}

/** Converts one portable Cardboard route to a Foldkit application start. */
export const cardboardFoldkitStartForRelativePath = (
  relativePath: string,
): Effect.Effect<
  Runtime.ProgramStart<Model, Message>,
  Program.ProgramRouteError | CardboardFoldkitRouteError
> =>
  CardboardRouter.parse(relativePath).pipe(
    Effect.flatMap(route =>
      M.value(route).pipe(
        M.withReturnType<
          Effect.Effect<
            Runtime.ProgramStart<Model, Message>,
            CardboardFoldkitRouteError
          >
        >(),
        M.tagsExhaustive({
          State: ({ model }) => Effect.succeed(Runtime.fromModel(model)),
          Replay: ({ frame, tape }) =>
            Effect.fail(
              new CardboardFoldkitRouteError({
                message: `The Foldkit page host cannot mount selected replay frame ${frame.toString()} of ${tape.transitions.length.toString()} yet`,
              }),
            ),
          SavedReplay: ({ tapeId }) =>
            Effect.fail(
              new CardboardFoldkitRouteError({
                message: `Saved replay ${tapeId} needs a ReplayTapeStore`,
              }),
            ),
        }),
      ),
    ),
  )

/** Selects fresh startup or parses one canonical Cardboard path. */
export const cardboardFoldkitStartForLocation = (
  pathname: string,
  search: string,
): Effect.Effect<
  Runtime.ProgramStart<Model, Message>,
  Program.ProgramRouteError | CardboardFoldkitRouteError
> =>
  pathname === '/' && search === ''
    ? Effect.succeed(Runtime.fresh())
    : cardboardFoldkitStartForRelativePath(`${pathname}${search}`)
