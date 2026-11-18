import type { WatchedNetworkId } from 'brandon-core-example'
import { Effect, Option } from 'effect'
import type { AtomicUnits } from 'wallet-core-example'
import {
  type LiveNetworkAdapter,
  liveWalletNetworkForId,
  makeLiveNetworkAdapter,
} from 'wallet-live-client-example'

import { chainIdOfNetwork } from './activity.js'

// HELD BALANCE

/** How long the origin waits for a chain to say a held account's balance. */
export const heldBalanceWithin = '5 seconds'

/** One held account by where it is. */
export type HeldBalancePlace = Readonly<{
  networkId: WatchedNetworkId
  address: string
}>

/** Reads one held account's balance from its chain, or none. */
export type HeldBalanceReader = (
  place: HeldBalancePlace,
) => Effect.Effect<Option.Option<AtomicUnits>>

/**
 * The balance of a held account as its chain reports it now, through the
 * wallet's own adapter for that network: the same reads the page's wallet
 * makes for its own accounts. A chain that fails or takes longer than
 * five seconds gives none, so the page says it could not read it.
 */
export const makeHeldBalanceReader = (): HeldBalanceReader => {
  const adapters = new Map<WatchedNetworkId, LiveNetworkAdapter>()
  const adapterFor = (networkId: WatchedNetworkId): LiveNetworkAdapter =>
    Option.getOrElse(Option.fromNullishOr(adapters.get(networkId)), () => {
      const adapter = makeLiveNetworkAdapter(
        Option.getOrThrow(liveWalletNetworkForId(networkId)),
      )
      adapters.set(networkId, adapter)
      return adapter
    })
  return ({ networkId, address }) => {
    const adapter = adapterFor(networkId)
    const account = {
      accountId: `${networkId}|${address}`,
      chainId: chainIdOfNetwork(networkId),
      networkId,
      address,
      displayName: address,
    }
    return adapter
      .loadBalance({
        profile: account,
        account,
        configuration: adapter.configuration,
      })
      .pipe(
        Effect.map(balance => Option.some(balance.amount.atomicUnits)),
        Effect.catch(() => Effect.succeed(Option.none<AtomicUnits>())),
        Effect.timeoutOrElse({
          duration: heldBalanceWithin,
          orElse: () => Effect.succeed(Option.none<AtomicUnits>()),
        }),
      )
  }
}
