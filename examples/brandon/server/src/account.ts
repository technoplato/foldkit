import { Array, Option } from 'effect'
import { createHash } from 'node:crypto'

// ACCOUNT

/** The row for anyone without one of their own. */
export const defaultAccountKey = 'default'

/** The flag that sends football scores. */
export const footballFlag = 'football'

/** The flag that sends the wallet mirror. */
export const walletsFlag = 'wallets'

/** One person's name and the flags turned on for them. */
export type Account = Readonly<{
  displayName: string
  flags: ReadonlyArray<string>
}>

/**
 * An account's key: the SHA-256 of the lowercased address, so no row holds
 * an email.
 *
 * @example
 * ```typescript
 * accountKeyOf('Brandon@Example.com') === accountKeyOf('brandon@example.com') // true
 * ```
 */
export const accountKeyOf = (email: string): string =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex')

/** The account with no flags at all, for a store with no default row. */
export const noAccess: Account = { displayName: 'Guest', flags: [] }

/** True when this account has the flag on. */
export const hasFlag = (account: Account, flag: string): boolean =>
  Array.contains(account.flags, flag)

/** The first account that exists: theirs, then the default. */
export const firstAccount = (
  maybeOwn: Option.Option<Account>,
  maybeDefault: Option.Option<Account>,
): Account =>
  Option.getOrElse(
    Option.orElse(maybeOwn, () => maybeDefault),
    () => noAccess,
  )
