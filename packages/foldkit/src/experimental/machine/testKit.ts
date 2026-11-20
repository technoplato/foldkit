import { type Effect, Schema as S } from 'effect'

import * as Command from '../../command/index.js'
import { type CallableTaggedStruct, ts } from '../../schema/index.js'

// NOTE: upstream's Machine tests declare their unions with
// `defineTaggedUnion` and `defineMessageUnion`, and their Commands with
// one record, none of which this fork has. These give those tests the
// same shapes from this fork's `ts` and `Command.define`, so the tests
// read as upstream's do.

type Members<Cases extends Record<string, S.Struct.Fields>> = {
  readonly [Tag in keyof Cases & string]: CallableTaggedStruct<Tag, Cases[Tag]>
}

/** A union Schema that also holds a constructor for each of its variants. */
export type TestUnion<Cases extends Record<string, S.Struct.Fields>> = S.Union<
  ReadonlyArray<Members<Cases>[keyof Cases & string]>
> &
  Members<Cases> &
  Readonly<{
    subset: <const Tags extends ReadonlyArray<keyof Cases & string>>(
      tags: Tags,
    ) => S.Union<ReadonlyArray<Members<Cases>[Tags[number]]>>
  }>

/**
 * Declares every variant of a union in one object, for the Machine's own
 * tests.
 *
 * @example
 * ```typescript
 * const RemoteData = defineTaggedUnion({ Idle: {}, Ok: { data: S.String } })
 * RemoteData.Ok({ data: 'ready' }) // { _tag: 'Ok', data: 'ready' }
 * ```
 */
export const defineTaggedUnion = <
  const Cases extends Record<string, S.Struct.Fields>,
>(
  cases: Cases,
): TestUnion<Cases> => {
  const callables = Object.fromEntries(
    Object.entries(cases).map(([tag, fields]) => [tag, ts(tag, fields)]),
  )
  const subset = (tags: ReadonlyArray<string>) =>
    S.Union(tags.flatMap(tag => callables[tag] ?? []))
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  return Object.assign(S.Union(Object.values(callables)), callables, {
    subset,
  }) as unknown as TestUnion<Cases>
}

/** Declares every Message of a union in one object, for the Machine's own tests. */
export const defineMessageUnion = defineTaggedUnion

/**
 * Declares a Command the way upstream's `Command.define` does, with one
 * record, on this fork's `Command.define`.
 *
 * @example
 * ```typescript
 * const Presign = defineCommand('Presign', {
 *   messages: [SucceededPresign],
 *   execute: Effect.succeed(SucceededPresign({ url: 'https://made-up.example/u1' })),
 * })
 * ```
 */
export function defineCommand<
  const Name extends string,
  Results extends ReadonlyArray<S.Top>,
  Eff extends Effect.Effect<S.Schema.Type<Results[number]>, any, any>,
>(
  name: Name,
  config: Readonly<{ messages: Results; execute: Eff }>,
): Command.CommandDefinitionNoArgs<Name, Eff>
export function defineCommand<
  const Name extends string,
  Fields extends S.Struct.Fields,
  Results extends ReadonlyArray<S.Top>,
  Eff extends Effect.Effect<S.Schema.Type<Results[number]>, any, any>,
>(
  name: Name,
  config: Readonly<{
    args: Fields
    messages: Results
    execute: (args: S.Schema.Type<S.Struct<Fields>>) => Eff
  }>,
): Command.CommandDefinitionWithArgs<Name, Fields, Eff>
export function defineCommand(
  name: string,
  config: Readonly<{
    args?: S.Struct.Fields
    messages: ReadonlyArray<S.Top>
    execute: unknown
  }>,
): unknown {
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  const define = Command.define as unknown as (
    ...rest: ReadonlyArray<unknown>
  ) => (execute: unknown) => unknown
  return config.args === undefined
    ? define(name, ...config.messages)(config.execute)
    : define(name, config.args, ...config.messages)(config.execute)
}
