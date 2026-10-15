import { Array, Record, Schema as S, String } from 'effect'

import { InstantToolsEntities } from './instant.js'

/**
 * An email the tracker's Instant rules let read and write, like
 * `owner@example.com`. Only letters, digits, and `._%+-` are accepted, so
 * an email can never close the quoted string in the rule it lands in.
 */
export const OwnerEmail = S.String.check(
  S.isPattern(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/u),
).pipe(S.brand('OwnerEmail'))
/** An email the tracker's Instant rules let read and write. */
export type OwnerEmail = typeof OwnerEmail.Type

/** One entity's rules: every action allowed only when `isOwner` holds. */
export type OwnerRule = Readonly<{
  allow: Readonly<Record<string, string>>
  bind: readonly [string, string]
}>

/** Instant rules for every Instant Tools entity and `$files`. */
export type InstantToolsOwnerRules = Readonly<
  Record<keyof typeof InstantToolsEntities | '$files', OwnerRule>
>

const ownerBinding = 'isOwner'

const entityActions = ['view', 'create', 'update', 'delete'] as const

const fileActions = ['view', 'create', 'delete'] as const

const ownerRule =
  (isOwner: string) =>
  (actions: ReadonlyArray<string>): OwnerRule => ({
    allow: Record.fromEntries(
      Array.map(actions, action => [action, ownerBinding]),
    ),
    bind: [ownerBinding, isOwner],
  })

/**
 * Instant rules that let only a signed-in user whose email is one of
 * `ownerEmails` view, create, update, or delete any Instant Tools entity,
 * and view, upload, or delete the Issue attachments in `$files`. A guest,
 * or anyone signed in with another email, reads nothing and writes
 * nothing. Admin tokens bypass rules, so the `issues` CLI keeps working.
 *
 * @example
 * ```typescript
 * instantToolsOwnerRules([OwnerEmail.make('owner@example.com')]).instantToolsIssues
 * // { allow: { view: 'isOwner', create: 'isOwner', update: 'isOwner', delete: 'isOwner' },
 * //   bind: ['isOwner', "auth.id != null && auth.email in ['owner@example.com']"] }
 * ```
 */
export const instantToolsOwnerRules = (
  ownerEmails: Array.NonEmptyReadonlyArray<OwnerEmail>,
): InstantToolsOwnerRules => {
  const quotedEmails = Array.map(
    ownerEmails,
    email => `'${String.toLowerCase(email)}'`,
  ).join(', ')
  const ruleFor = ownerRule(
    `auth.id != null && auth.email in [${quotedEmails}]`,
  )
  return {
    ...Record.map(InstantToolsEntities, () => ruleFor(entityActions)),
    $files: ruleFor(fileActions),
  }
}
