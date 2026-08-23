import { Data, Effect } from 'effect'
import { Program } from 'foldkit'
import { type Model, productOfReady } from 'puzzle-core-example'

/** CLI failure for a bad token, Device, or tape. */
export class PuzzleCliError extends Data.TaggedError('PuzzleCliError')<{
  readonly message: string
}> {}

/** Reads the Ready product or fails with the sync error. */
export const readyCount = (
  model: Program.SyncedModel<unknown, unknown>,
): Effect.Effect<Model, PuzzleCliError> => {
  if (model._tag === 'Ready') {
    const product = productOfReady(model)
    if (product === undefined) {
      return Effect.fail(
        new PuzzleCliError({
          message: 'CLI Ready Model has no tape.',
        }),
      )
    }
    return Effect.succeed(product)
  }
  if (model._tag === 'Failed') {
    return Effect.fail(
      new PuzzleCliError({
        message: Program.describeSyncError(model.error, message =>
          typeof message === 'object' &&
          message !== null &&
          '_tag' in message &&
          typeof message._tag === 'string'
            ? message._tag
            : 'Message',
        ),
      }),
    )
  }
  return Effect.fail(
    new PuzzleCliError({
      message: 'CLI waited for Ready and Instant stayed Starting.',
    }),
  )
}
