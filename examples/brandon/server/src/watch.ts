import { Array, Effect, Fiber, Option } from 'effect'
import {
  type LiveNetworkAdapter,
  liveWalletNetworkForId,
  makeLiveNetworkAdapter,
} from 'wallet-live-client-example'

import { type WatchedAccount, WatchedNetworkId } from './activity.js'
import { makeActivityAdmin } from './activityStore.js'
import { brandonEnv } from './env.js'
import { watchAccount } from './watcher.js'

// WATCH

const shownAddressCharacters = 6

const adapters = new Map<string, LiveNetworkAdapter>(
  Array.map(WatchedNetworkId.literals, networkId => [
    networkId,
    makeLiveNetworkAdapter(Option.getOrThrow(liveWalletNetworkForId(networkId))),
  ]),
)

const store = makeActivityAdmin(brandonEnv())
const running = new Map<string, Fiber.Fiber<never>>()

const named = (account: WatchedAccount): string =>
  `${account.networkId} ${account.address.slice(0, shownAddressCharacters)}…`

const follow = (accounts: ReadonlyArray<WatchedAccount>): void => {
  const wanted = new Set(Array.map(accounts, account => account.accountKey))
  for (const [accountKey, fiber] of running) {
    if (!wanted.has(accountKey)) {
      running.delete(accountKey)
      Effect.runFork(Fiber.interrupt(fiber))
      console.log(`watcher: stopped ${accountKey.split('|').slice(1).join(' ')}`)
    }
  }
  for (const account of accounts) {
    const maybeAdapter = Option.fromNullishOr(adapters.get(account.networkId))
    if (!running.has(account.accountKey) && Option.isSome(maybeAdapter)) {
      running.set(
        account.accountKey,
        Effect.runFork(watchAccount(maybeAdapter.value, account, store)),
      )
      console.log(`watcher: listening to ${named(account)}`)
    }
  }
}

store.followAccounts(follow, error => {
  console.error(`watcher: the account list failed: ${error.message}`)
})

console.log(
  `wallet watcher: following walletAccounts on ${Array.join(WatchedNetworkId.literals, ', ')}`,
)
