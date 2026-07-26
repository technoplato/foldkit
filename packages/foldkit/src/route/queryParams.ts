import { Array, Data, Effect, Option, Record, String, pipe } from 'effect'

/** An immutable, ordered collection of URI query parameter pairs. */
export type QueryParams = ReadonlyArray<readonly [string, string]>

/** A URI query string could not be decoded. */
export class QueryParamsError extends Data.TaggedError('QueryParamsError')<{
  readonly cause: unknown
  readonly component: string
}> {}

/** Empty URI query parameters. */
export const empty: QueryParams = []

const encodeComponent = (component: string): string =>
  encodeURIComponent(component)
    .replace(/%20/g, '+')
    .replace(
      /[!'()~]/g,
      character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    )

const decodeComponent = (
  component: string,
): Effect.Effect<string, QueryParamsError> =>
  Effect.try({
    try: () => decodeURIComponent(component.replace(/\+/g, ' ')),
    catch: cause => new QueryParamsError({ cause, component }),
  })

const decodePair = (
  pair: string,
): Effect.Effect<readonly [string, string], QueryParamsError> =>
  Array.matchLeft(String.split('=')(pair), {
    onEmpty: () => Effect.succeed(['', '']),
    onNonEmpty: (rawKey, rawValues) =>
      Effect.all([
        decodeComponent(rawKey),
        decodeComponent(Array.join(rawValues, '=')),
      ]),
  })

/** Parses a query string without requiring a platform URL implementation. */
export const parse = (
  search: string,
): Effect.Effect<QueryParams, QueryParamsError> => {
  const normalizedSearch = search.startsWith('?') ? search.slice(1) : search
  if (String.isEmpty(normalizedSearch)) {
    return Effect.succeed(empty)
  }
  return pipe(
    normalizedSearch,
    String.split('&'),
    Array.filter(String.isNonEmpty),
    Effect.forEach(decodePair),
  )
}

/** Returns the last value associated with a query parameter key. */
export const getLast = (
  queryParams: QueryParams,
  key: string,
): Option.Option<string> =>
  pipe(
    queryParams,
    Array.findLast(([candidate]) => candidate === key),
    Option.map(([, value]) => value),
  )

/** Replaces a query parameter while preserving deterministic insertion order. */
export const set = (
  queryParams: QueryParams,
  key: string,
  value: string,
): QueryParams => {
  const entry: readonly [string, string] = [key, value]
  return pipe(
    queryParams,
    Array.filter(([candidate]) => candidate !== key),
    Array.append(entry),
  )
}

/** Converts query pairs to the record shape consumed by route Schemas. */
export const toRecord = (
  queryParams: QueryParams,
): Record.ReadonlyRecord<string, string> => Record.fromEntries(queryParams)

/** Prints ordered query pairs in canonical form encoding. */
export const toString = (queryParams: QueryParams): string =>
  pipe(
    queryParams,
    Array.map(
      ([key, value]) => `${encodeComponent(key)}=${encodeComponent(value)}`,
    ),
    Array.join('&'),
  )
