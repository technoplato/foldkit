import { Effect, Schema as S } from 'effect'
import { parse as parseYaml } from 'yaml'

import { BenchError } from './error.js'

/**
 * Required Counter assert names for rung A.
 */
export const CounterAssertName = S.Literals([
  'countVisible',
  'incrementRaises',
  'decrementLowers',
  'instantSettlesLive',
  'offlineWorks',
  'actionMenuAbstraction',
  'sameScreenMirrored',
  'globalSync',
])
/** Required Counter assert name. */
export type CounterAssertName = typeof CounterAssertName.Type

/** Required Counter assert names in grade order. */
export const COUNTER_ASSERT_NAMES: ReadonlyArray<CounterAssertName> = [
  'instantSettlesLive',
  'countVisible',
  'incrementRaises',
  'decrementLowers',
  'actionMenuAbstraction',
  'sameScreenMirrored',
  'globalSync',
  'offlineWorks',
]

const stringOrList = S.Union([S.String, S.Array(S.String)])

/**
 * One named Maestro rule. Steps say what is visible, interactable, when, why.
 */
export const NamedAssert = S.Struct({
  name: CounterAssertName,
  assertVisible: S.optionalKey(stringOrList),
  assertNotVisible: S.optionalKey(stringOrList),
  tapOn: S.optionalKey(S.String),
  when: S.String,
  why: S.String,
})
/** One named Maestro rule. */
export type NamedAssert = typeof NamedAssert.Type

/** Live or future stub. v1 grades live only. */
export const RungStatus = S.Literals(['live', 'stub'])
/** Live or future stub. */
export type RungStatus = typeof RungStatus.Type

/**
 * One Maestro rung file. Live Counter is the v1 submission.
 */
export const RungFile = S.Struct({
  name: S.String,
  title: S.String,
  status: RungStatus,
  proofHost: S.String,
  mirrorHost: S.optionalKey(S.String),
  asserts: S.Array(NamedAssert),
})
/** One Maestro rung file. */
export type RungFile = typeof RungFile.Type

const CatalogEntry = S.Struct({
  id: S.String,
  title: S.String,
  status: RungStatus,
  file: S.optionalKey(S.String),
})

/** Catalog of live and stub rungs. Stubs are names only. */
export const RungCatalog = S.Struct({
  rungs: S.Array(CatalogEntry),
})
/** Catalog of live and stub rungs. */
export type RungCatalog = typeof RungCatalog.Type

const asSelectorList = (
  value: string | ReadonlyArray<string> | undefined,
): ReadonlyArray<string> => {
  if (value === undefined) {
    return []
  }
  if (S.is(S.String)(value)) {
    return [value]
  }
  return value
}

/** Visible selectors for one named rule. */
export const visibleOf = (rule: NamedAssert): ReadonlyArray<string> =>
  asSelectorList(rule.assertVisible)

/** Hidden selectors for one named rule. */
export const hiddenOf = (rule: NamedAssert): ReadonlyArray<string> =>
  asSelectorList(rule.assertNotVisible)

/** Decodes a Maestro YAML document into a rung. */
export const decodeRungYaml = (
  text: string,
): Effect.Effect<RungFile, BenchError> =>
  Effect.try({
    try: () => S.decodeUnknownSync(RungFile)(parseYaml(text)),
    catch: error =>
      new BenchError({
        detail: `Maestro YAML failed Schema decode: ${String(error)}`,
      }),
  })

/** Decodes the rung catalog YAML. */
export const decodeCatalogYaml = (
  text: string,
): Effect.Effect<RungCatalog, BenchError> =>
  Effect.try({
    try: () => S.decodeUnknownSync(RungCatalog)(parseYaml(text)),
    catch: error =>
      new BenchError({
        detail: `catalog YAML failed Schema decode: ${String(error)}`,
      }),
  })
