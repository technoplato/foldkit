import { BrandonProgram, type Message, MessageWire } from 'brandon-core-example'
import { Array, Option, Result, Schema as S } from 'effect'

import { programMessageFieldsOf } from '@foldkit/instant'

// FACTS

/** Who writes a fact, and when. */
export type FactStamp = Readonly<{
  ownerUserID: string
  from: string
  atMs: number
}>

/** The `programMessage` fields of one fact, as Foldkit's reader folds them. */
export const logFieldsOf = (message: Message, stamp: FactStamp) => ({
  ...programMessageFieldsOf(BrandonProgram.id, {
    id: '',
    from: stamp.from,
    createdAtMs: stamp.atMs,
    tag: S.encodeSync(MessageWire)(message).tag,
    programVersion: BrandonProgram.version,
  }),
  ownerUserID: stamp.ownerUserID,
})

/**
 * Where the log's totals and Scribe's score rows part ways, if they do.
 * The two are written in one transaction, so a difference means a row was
 * written around this tool.
 */
export const sameTotals = (
  fromLog: ReadonlyMap<string, number>,
  fromScribe: ReadonlyMap<string, number>,
): Option.Option<string> => {
  const names = Array.dedupe([...fromLog.keys(), ...fromScribe.keys()])
  const differences = Array.filterMap(names, name => {
    const logged = fromLog.get(name) ?? 0
    const scored = fromScribe.get(name) ?? 0
    return logged === scored
      ? Result.failVoid
      : Result.succeed(
          `${name}: the log has ${logged.toString()}, Scribe has ${scored.toString()}`,
        )
  })
  return Array.isReadonlyArrayEmpty(differences)
    ? Option.none()
    : Option.some(differences.join('; '))
}
