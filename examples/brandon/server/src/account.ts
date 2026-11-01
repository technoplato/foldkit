import { Array, Option } from 'effect'
import { createHash } from 'node:crypto'

// ACCOUNT

/** The row for anyone without one of their own. */
export const defaultAccountKey = 'default'

/** The flag that sends football scores. */
export const footballFlag = 'football'

/** The flag that sends the wallet mirror. */
export const walletsFlag = 'wallets'

/** The flag that sends this person their own wallet, and its owner key. */
export const walletFlag = 'wallet'

const walletOwnerLabel = 'brandon-dot wallet owner\n'

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

/**
 * The name of this person's wallet partition in their own browser: the
 * SHA-256 of the lowercased address under a fixed label, as base64url. It
 * holds no secret and opens nothing by itself; it only keeps two people
 * on one browser apart. It must never change, or a saved wallet goes
 * missing.
 *
 * @example
 * ```typescript
 * walletOwnerKeyOf('brandon@example.com') // 'FV0RdRT4MDm1X3ijUItny8ib4StGguUcUwIzhLjkSM8'
 * ```
 */
export const walletOwnerKeyOf = (email: string): string =>
  createHash('sha256')
    .update(`${walletOwnerLabel}${email.trim().toLowerCase()}`)
    .digest('base64url')

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
