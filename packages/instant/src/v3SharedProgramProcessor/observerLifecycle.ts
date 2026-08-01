import { Effect, Option, SynchronizedRef, Tuple } from 'effect'

type ObserverGeneration = Readonly<{
  generation: number
}>

/** Finishes one current observer generation while preventing a replacement from overtaking cleanup. */
export const finishCurrentObserverGeneration = <
  Handle extends ObserverGeneration,
  FinishError,
  FinishRequirements,
>(
  observerRef: SynchronizedRef.SynchronizedRef<Option.Option<Handle>>,
  generation: number,
  finish: (
    handle: Handle,
  ) => Effect.Effect<void, FinishError, FinishRequirements>,
): Effect.Effect<Option.Option<Handle>, FinishError, FinishRequirements> =>
  SynchronizedRef.modifyEffect(observerRef, maybeHandle => {
    const maybeCurrent = Option.filter(
      maybeHandle,
      handle => handle.generation === generation,
    )
    if (Option.isNone(maybeCurrent)) {
      return Effect.succeed(Tuple.make(Option.none<Handle>(), maybeHandle))
    } else {
      return finish(maybeCurrent.value).pipe(
        Effect.as(
          Tuple.make(Option.some(maybeCurrent.value), Option.none<Handle>()),
        ),
      )
    }
  })
