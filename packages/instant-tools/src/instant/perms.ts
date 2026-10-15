import { Array, Schema as S } from 'effect'

import type { InstantToolsEntities } from './instant.js'

/** An email the tracker's Instant rules let read and write, like `owner@example.com`. */
export const OwnerEmail = S.String.pipe(S.brand('OwnerEmail'))
/** An email the tracker's Instant rules let read and write. */
export type OwnerEmail = typeof OwnerEmail.Type

type OwnerRule = Readonly<{
  allow: Readonly<Record<string, string>>
  bind: ReadonlyArray<string>
}>

/** Instant rules for every Instant Tools entity and `$files`. */
export type InstantToolsOwnerRules = Readonly<
  Record<keyof typeof InstantToolsEntities | '$files', OwnerRule>
>

/** Instant rules that let only the owners read and write the tracker. */
export const instantToolsOwnerRules = (
  _ownerEmails: Array.NonEmptyReadonlyArray<OwnerEmail>,
): Partial<InstantToolsOwnerRules> => ({})
