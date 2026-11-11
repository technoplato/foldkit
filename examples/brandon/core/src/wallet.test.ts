import { Array, Duration, Effect, Layer, Option, Schema as S } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { afterEach, describe, expect, it } from 'vitest'
import {
  RequestedWalletCreation,
  SelectedWalletNetworkMode,
} from 'wallet-core-example'
import { makeMemoryWalletVaultStorage } from 'wallet-local-vault-example'

import { snapshotLogMessageWire } from '@foldkit/instant/snapshot-log'

import { startBrandonOn } from './live.js'
import { GotWalletMessage, Message, ReceivedPage } from './message.js'
import { type WalletState, initialModel } from './model.js'
import {
  Page,
  PersonalWalletSection,
  SectionKey,
  type WalletPublicAccount,
  WatchedNetworkId,
} from './page.js'
import { BrandonProgram } from './program.js'
import { BrandonServer } from './server.js'
import type { SyncedBrandonModel } from './synced.js'
import { makeTestWalletResources, testWalletOwnerKey } from './testWallet.js'
import { update } from './update.js'
import { MessageWire } from './wire.js'

const walletSection = PersonalWalletSection({
  key: SectionKey.make('wallet'),
  title: 'Your wallet',
  column: 'Main',
})

const pageWith = (
  sections: ReadonlyArray<typeof walletSection>,
): typeof Page.Type => Page.make({ displayName: 'Brandon', sections })

const commandNames = (
  commands: ReturnType<typeof update>[1],
): ReadonlyArray<string> => Array.map(commands, command => command.name)

describe('the wallet section', () => {
  it('opens the wallet only when the origin sends its section', () => {
    const [withoutSection, withoutCommands] = update(
      initialModel,
      ReceivedPage({ page: pageWith([]) }),
    )
    expect(withoutSection.wallet._tag).toBe('ClosedWallet')
    expect(commandNames(withoutCommands)).toEqual([])

    const [opened, openCommands] = update(
      withoutSection,
      ReceivedPage({ page: pageWith([walletSection]) }),
    )
    expect(opened.wallet._tag).toBe('OpenWallet')
    expect(commandNames(openCommands)).toEqual(['LoadWalletProfiles'])

    const [stillOpen, againCommands] = update(
      opened,
      ReceivedPage({ page: pageWith([walletSection]) }),
    )
    expect(stillOpen.wallet).toEqual(opened.wallet)
    expect(commandNames(againCommands)).toEqual([])

    const [closed] = update(stillOpen, ReceivedPage({ page: pageWith([]) }))
    expect(closed.wallet._tag).toBe('ClosedWallet')
  })

  it('hands a wallet Message to the wallet only while it is open', () => {
    const switchToMainnet = GotWalletMessage({
      message: SelectedWalletNetworkMode.make({ networkMode: 'Live' }),
    })
    const [closedAfter] = update(initialModel, switchToMainnet)
    expect(closedAfter).toEqual(initialModel)

    const [opened] = update(
      initialModel,
      ReceivedPage({ page: pageWith([walletSection]) }),
    )
    const [switched] = update(opened, switchToMainnet)
    expect(
      switched.wallet._tag === 'OpenWallet' &&
        switched.wallet.model.walletNetworkMode,
    ).toBe('Live')
  })
})

describe('the wallet and the log', () => {
  const overJson = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value))

  it('never writes a wallet Message to the log', () => {
    const isLocalOnly = BrandonProgram.synchronization?.isLocalOnly
    expect(
      isLocalOnly?.(
        GotWalletMessage({ message: RequestedWalletCreation.make({}) }),
      ),
    ).toBe(true)
  })

  it('refuses a wallet Message someone wrote to the log', () => {
    const forged = S.encodeSync(snapshotLogMessageWire(Message))(
      GotWalletMessage({ message: RequestedWalletCreation.make({}) }),
    )
    const row = overJson({
      id: 'r',
      from: 'intruder',
      createdAtMs: 1,
      tag: forged.tag,
    })
    expect(Option.isNone(S.decodeUnknownOption(MessageWire)(row))).toBe(true)
  })

  it('keeps the wallet when the log refolds', () => {
    const keepOnRefold = BrandonProgram.synchronization?.keepOnRefold
    const [opened] = update(
      initialModel,
      ReceivedPage({ page: pageWith([walletSection]) }),
    )
    expect(keepOnRefold?.(opened, initialModel).wallet).toEqual(opened.wallet)
  })
})

const settleAttempts = 1000

const eventually = async <A>(
  read: () => A,
  isDone: (value: A) => boolean,
): Promise<A> => {
  for (
    let attempt = 0;
    attempt < settleAttempts && !isDone(read());
    attempt += 1
  ) {
    await Effect.runPromise(Effect.sleep(Duration.millis(2)))
  }
  return read()
}

const walletOf = (model: SyncedBrandonModel): Option.Option<WalletState> =>
  model._tag === 'Ready' ? Option.some(model.wallet) : Option.none()

const walletCount = (model: SyncedBrandonModel): number =>
  Option.match(walletOf(model), {
    onNone: () => 0,
    onSome: wallet =>
      wallet._tag === 'OpenWallet' ? wallet.model.wallets.length : 0,
  })

const isReadyToCreate = (model: SyncedBrandonModel): boolean =>
  Option.match(walletOf(model), {
    onNone: () => false,
    onSome: wallet =>
      wallet._tag === 'OpenWallet' &&
      wallet.model.walletProfileLoading._tag === 'LoadedWalletProfiles' &&
      wallet.model.portfolio._tag === 'LoadedPortfolio',
  })

const realFetch = globalThis.fetch
const stopped: Array<() => Promise<void>> = []

afterEach(async () => {
  globalThis.fetch = realFetch
  await Promise.all(stopped.splice(0).map(stop => stop()))
})

const base58Alphabet =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const base58Of = (hex: string): string => {
  let value = BigInt(`0x${hex}`)
  let encoded = ''
  while (value > 0n) {
    encoded = `${base58Alphabet.charAt(Number(value % 58n))}${encoded}`
    value /= 58n
  }
  return encoded
}

describe('a wallet made on this page', () => {
  it('keeps its keys out of the log and off the network', async () => {
    const sent: Array<string> = []
    const watched: Array<typeof WalletPublicAccount.Type> = []
    globalThis.fetch = async (input, init) => {
      sent.push(`${String(input)} ${String(init?.body ?? '')}`)
      throw new TypeError('offline in this test')
    }
    const everyKeyHex = Array.map(['01', '02', '03', '04'], byte =>
      byte.repeat(32),
    )
    const server = Layer.succeed(BrandonServer, {
      loadPage: Effect.succeed(pageWith([walletSection])),
      loadFootball: Effect.succeed([]),
      loadWallets: Effect.succeed([]),
      loadWalletActivity: Effect.succeed([]),
      loadHeldAccounts: Effect.succeed([]),
      fileHeldClaim: () => Effect.void,
      watchWalletAccounts: accounts =>
        Effect.sync(() => {
          watched.push(...accounts)
        }),
      reportSentTransaction: () => Effect.void,
      scrollToSection: () => Effect.void,
      reloadPage: Effect.void,
      nowMs: Effect.succeed(0),
    })
    const vaultStorage = makeMemoryWalletVaultStorage(testWalletOwnerKey)
    const store = Runtime.makeMemoryStore()
    const handle = startBrandonOn(
      Runtime.Memory({ processor: 'foldkit-wallet', store }),
      Layer.merge(server, makeTestWalletResources(vaultStorage)),
      Processor.Host.Foldkit(),
    )
    stopped.push(handle.stop)

    await eventually(handle.readModel, isReadyToCreate)
    handle.send(GotWalletMessage({ message: RequestedWalletCreation.make({}) }))
    const created = await eventually(
      handle.readModel,
      model => walletCount(model) === 1,
    )
    expect(walletCount(created)).toBe(1)
    await eventually(
      () => watched.length,
      count => count > 0,
    )

    const vaultText = JSON.stringify(
      await Effect.runPromise(vaultStorage.loadRecords),
    )
    const logText = JSON.stringify(store.messages)
    const networkText = sent.join('\n')
    const watchedText = JSON.stringify(watched)
    for (const secret of everyKeyHex) {
      expect(vaultText).toContain(secret)
      expect(logText).not.toContain(secret)
      expect(networkText).not.toContain(secret)
      expect(watchedText).not.toContain(secret)
      expect(watchedText).not.toContain(base58Of(secret))
    }
    expect(logText).not.toContain('GotWalletMessage')
    expect(Array.map(watched, ({ networkId }) => networkId)).toEqual(
      expect.arrayContaining([...WatchedNetworkId.literals]),
    )
    for (const account of watched) {
      expect(Object.keys(account).sort()).toEqual(['address', 'networkId'])
    }
  })
})
