import {
  Data,
  Effect,
  Match as M,
  Schema as S,
  SchemaTransformation,
  String,
  pipe,
} from 'effect'
import { Route } from 'foldkit'

import { Loading, Model, Ready, Saving } from './counter.js'

const loadingQuery = S.Struct({
  mode: S.Literals(['Loading']),
}).pipe(
  S.decodeTo(
    S.Struct({}),
    SchemaTransformation.transform({
      decode: () => ({}),
      encode: () => ({ mode: 'Loading' }),
    }),
  ),
)

const stateQuery = <Mode extends 'Ready' | 'Saving'>(mode: Mode) =>
  S.Struct({
    mode: S.Literals([mode]),
    count: S.FiniteFromString,
  }).pipe(
    S.decodeTo(
      S.Struct({ count: S.Number }),
      SchemaTransformation.transform({
        decode: ({ count }) => ({ count }),
        encode: ({ count }) => ({ mode, count }),
      }),
    ),
  )

const loadingRouter = pipe(
  Route.root,
  Route.query(loadingQuery),
  Route.mapTo(Loading),
)

const readyRouter = pipe(
  Route.root,
  Route.query(stateQuery('Ready')),
  Route.mapTo(Ready),
)

const savingRouter = pipe(
  Route.root,
  Route.query(stateQuery('Saving')),
  Route.mapTo(Saving),
)

const counterStateParser = Route.oneOf(loadingRouter, readyRouter, savingRouter)

/** A failure to decode host-neutral Counter state from a relative URI. */
export class CounterUriError extends Data.TaggedError('CounterUriError')<{
  readonly reason: string
}> {}

/** Parses a relative path and query into a portable Counter Model. */
export const parseCounterUri = (
  uri: string,
): Effect.Effect<Model, CounterUriError> =>
  Effect.gen(function* () {
    if (!uri.startsWith('/')) {
      return yield* Effect.fail(
        new CounterUriError({ reason: 'Counter URI must be relative' }),
      )
    }

    const url = yield* Effect.try({
      try: () => new URL(uri, 'counter://portable'),
      catch: error => new CounterUriError({ reason: globalThis.String(error) }),
    })

    if (url.pathname !== '/' || String.isNonEmpty(url.hash)) {
      return yield* Effect.fail(
        new CounterUriError({
          reason: 'Counter URI must contain only the root path and query',
        }),
      )
    }

    const search = url.search.substring(1)
    const [model] = yield* counterStateParser
      .parse([], String.isNonEmpty(search) ? search : undefined)
      .pipe(
        Effect.mapError(
          error => new CounterUriError({ reason: error.message }),
        ),
      )
    return model
  })

/** Prints a Counter Model as its canonical relative URI. */
export const printCounterUri = (model: Model): string =>
  M.value(model).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Loading: () => loadingRouter({}),
      Ready: ({ count }) => readyRouter({ count }),
      Saving: ({ count }) => savingRouter({ count }),
    }),
  )

/** Parses a Counter URI synchronously for process-entry initialization. */
export const parseCounterUriSync = (uri: string): Model =>
  Effect.runSync(parseCounterUri(uri))
