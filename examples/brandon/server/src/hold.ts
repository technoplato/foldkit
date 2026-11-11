import { WatchedNetworkId } from 'brandon-core-example'
import { Array, Effect, Option, Schema as S } from 'effect'
import { isPublicAddressOn } from 'wallet-live-client-example'

import { walletFlag, walletHolderOfKey } from './account.js'
import { chainIdOfNetwork } from './activity.js'
import { heldListingLineOf, heldListingsOf } from './heldClaims.js'
import type { HeldListFile } from './heldList.js'
import type { PersonAccount } from './store.js'

// HOLD

/** One `brandonAccounts` row by name: its key, display name and flags. It holds no address. */
export type NamedAccount = Readonly<{
  accountKey: string
  displayName: string
  flags: ReadonlyArray<string>
}>

/** What holding an account reads and writes in Instant. */
export type HoldStore = Readonly<{
  namedAccounts: Effect.Effect<ReadonlyArray<NamedAccount>, Error>
  personAccounts: (
    holder: string,
  ) => Effect.Effect<ReadonlyArray<PersonAccount>, Error>
  addHeldAccount: (
    account: Readonly<{
      holder: string
      networkId: WatchedNetworkId
      address: string
    }>,
  ) => Effect.Effect<void, Error>
}>

/** An account to hold: whose, by display name, and where. */
export type HoldRequest = Readonly<{
  displayName: string
  networkId: string
  address: string
}>

/** What holding did: whether the row and the held list line were new. */
export type HoldResult = Readonly<{
  displayName: string
  networkId: WatchedNetworkId
  address: string
  isRowNew: boolean
  isListingNew: boolean
}>

const refusal = (reason: string): Effect.Effect<never, Error> =>
  Effect.fail(new Error(reason))

const onlyNamed = (
  accounts: ReadonlyArray<NamedAccount>,
  displayName: string,
): Effect.Effect<NamedAccount, Error> =>
  Array.match(
    Array.filter(accounts, account => account.displayName === displayName),
    {
      onEmpty: () => refusal(`No account is named ${displayName}.`),
      onNonEmpty: ([only, ...others]) =>
        Array.isArrayNonEmpty(others)
          ? refusal(
              `${(others.length + 1).toString()} accounts are named ${displayName}; hold an account for a name only one person has.`,
            )
          : Effect.succeed(only),
    },
  )

/**
 * Holds an account for one person: Scribe made its key on this Mac, and
 * the money in it is theirs to move to their own wallet from their page.
 * It writes the `walletAccounts` row with custody Scribe under their page
 * holder, so their page shows it, and lists it in this Mac's held list,
 * the only accounts the claims worker pays from. Run again, it writes
 * nothing twice.
 *
 * @example
 * ```typescript
 * holdAccount({ displayName: 'Brandon', networkId: 'solana:mainnet-beta', address }, store, list)
 * ```
 */
export const holdAccount = (
  request: HoldRequest,
  store: HoldStore,
  list: HeldListFile,
): Effect.Effect<HoldResult, Error> =>
  Effect.gen(function* () {
    if (!S.is(WatchedNetworkId)(request.networkId)) {
      return yield* refusal(
        `${request.networkId} is not one of the page's networks: ${WatchedNetworkId.literals.join(', ')}.`,
      )
    }
    const networkId = request.networkId
    if (!isPublicAddressOn(chainIdOfNetwork(networkId), request.address)) {
      return yield* refusal(
        `${request.address} is not a public address on ${networkId}.`,
      )
    }
    const account = yield* onlyNamed(
      yield* store.namedAccounts,
      request.displayName,
    )
    if (!Array.contains(account.flags, walletFlag)) {
      return yield* refusal(
        `${request.displayName} does not have the wallet flag, so their page shows no wallet: brandon account flags ${request.displayName} --add wallet`,
      )
    }
    const holder = walletHolderOfKey(account.accountKey)
    const maybeExisting = Array.findFirst(
      yield* store.personAccounts(holder),
      existing =>
        existing.networkId === networkId && existing.address === request.address,
    )
    if (Option.exists(maybeExisting, existing => !existing.isHeldByScribe)) {
      return yield* refusal(
        `${request.address} is an address ${request.displayName}'s own wallet follows; Scribe holds only accounts whose key is on this Mac.`,
      )
    }
    const isRowNew = Option.isNone(maybeExisting)
    if (isRowNew) {
      yield* store.addHeldAccount({
        holder,
        networkId,
        address: request.address,
      })
    }
    const listing = { networkId, address: request.address, holder }
    const isListingNew = !Array.some(
      heldListingsOf(yield* list.read),
      listed =>
        listed.networkId === listing.networkId &&
        listed.address === listing.address &&
        listed.holder === listing.holder,
    )
    if (isListingNew) {
      yield* list.append(heldListingLineOf(listing))
    }
    return {
      displayName: request.displayName,
      networkId,
      address: request.address,
      isRowNew,
      isListingNew,
    }
  })

/**
 * What `brandon wallet hold` prints: the name, the network and the
 * address, never the holder or an email.
 */
export const holdLineOf = (result: HoldResult): string =>
  result.isRowNew || result.isListingNew
    ? `Held for ${result.displayName} on ${result.networkId}: ${result.address}`
    : `Held for ${result.displayName} on ${result.networkId} already: ${result.address}`
