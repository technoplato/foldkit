import {
  Model as CounterModel,
  type Model,
  countOfReady,
} from 'counter-core-example'
import { Data, Effect } from 'effect'
import { Program } from 'foldkit'

/** CLI failure for a bad token, Device, or tape. */
export class CounterCliError extends Data.TaggedError('CounterCliError')<{
  readonly message: string
}> {}

export { countOfReady }

/** Reads the Ready count or fails with the sync error. */
export const readyCount = (
  model: Program.SyncedModel<unknown, unknown>,
): Effect.Effect<Model, CounterCliError> => {
  if (model._tag === 'Ready') {
    const count = countOfReady(model)
    if (count === undefined) {
      return Effect.fail(
        new CounterCliError({
          message: 'CLI Ready Model has no count.',
        }),
      )
    }
    return Effect.succeed(CounterModel.make({ count }))
  }
  if (model._tag === 'Failed') {
    return Effect.fail(
      new CounterCliError({
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
    new CounterCliError({
      message: 'CLI waited for Ready and Instant stayed Starting.',
    }),
  )
}
