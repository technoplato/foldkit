import { Array, Duration, Effect, Layer, Option, Schema as S } from 'effect'
import { Processor, Runtime } from 'foldkit'
import { afterEach, describe, expect, it } from 'vitest'
import * as Wallet from 'wallet-core-example'

import { snapshotLogMessageWire } from '@foldkit/instant/snapshot-log'

import { heldAmountLabel, heldClaimPathOf, heldMoveRequestOf } from './held.js'
import { startBrandonOn } from './live.js'
import {
  ChangedWalletActivity,
  ClickedMoveHeldMoney,
  FailedFileHeldClaim,
  FailedHeldAccounts,
  Message,
  ReceivedHeldAccounts,
  SucceededFileHeldClaim,
} from './message.js'
import {
  ConfirmedWalletWatch,
  FailedHeldMove,
  FilingHeldMove,
  IdleHeldMove,
  LoadedHeldAccounts,
  LoadingHeldAccounts,
  type Model,
  OpenWallet,
  PendingWalletWatch,
  UnavailableHeldAccounts,
  initialModel,
} from './model.js'
import {
  type HeldAccount,
  HeldAccounts,
  type HeldClaimRequest,
  Page,
  PersonalWalletSection,
  SectionKey,
} from './page.js'
import { BrandonProgram } from './program.js'
import { BrandonServer } from './server.js'
import { makeTestWalletResources } from './testWallet.js'
import { update } from './update.js'
import { MessageWire } from './wire.js'

const mainnet = 'solana:mainnet-beta'
const heldAddress = 'So11111111111111111111111111111111111111112'
const ownMainnetAddress = 'MainnetAddress'

const held = (fields: Partial<HeldAccount> = {}): HeldAccount => ({
  networkId: mainnet,
  address: heldAddress,
  maybeBalanceAtomic: Option.some('181071945'),
  maybeClaim: Option.none(),
  ...fields,
})

const request: HeldClaimRequest = {
  networkId: mainnet,
  heldAddress,
  toAddress: ownMainnetAddress,
}

const profile = Wallet.WalletProfile.make({
  walletId: 'wallet-1',
  displayName: 'wallet-1',
  createdAt: 1,
  accounts: [
    {
      accountId: 'wallet-1:solana:devnet',
      chainId: 'solana',
      networkId: 'solana:devnet',
      address: 'DevnetAddress',
      displayName: 'solana:devnet',
    },
    {
      accountId: 'wallet-1:solana:mainnet-beta',
      chainId: 'solana',
      networkId: mainnet,
      address: ownMainnetAddress,
      displayName: mainnet,
    },
  ],
})

const withOwnWallet = (fields: Partial<Model> = {}): Model => ({
  ...initialModel,
  wallet: OpenWallet({ model: { ...Wallet.initialModel, wallets: [profile] } }),
  walletWatch: ConfirmedWalletWatch(),
  heldAccounts: LoadedHeldAccounts({ accounts: [held()] }),
  ...fields,
})

const commandNames = (result: ReturnType<typeof update>) =>
  Array.map(result[1], command => command.name)

describe('the money Scribe holds for this person, on the page', () => {
  it('is on its way until the origin says', () => {
    expect(initialModel.heldAccounts).toEqual(LoadingHeldAccounts())
    expect(initialModel.heldMove).toEqual(IdleHeldMove())
  })

  it('shows what the origin sent', () => {
    const [model, commands] = update(
      initialModel,
      ReceivedHeldAccounts({ accounts: [held()] }),
    )
    expect(model.heldAccounts).toEqual(LoadedHeldAccounts({ accounts: [held()] }))
    expect(commands).toEqual([])
  })

  it('keeps the last accounts on screen when a read fails', () => {
    const [model] = update(
      { ...initialModel, heldAccounts: LoadedHeldAccounts({ accounts: [held()] }) },
      FailedHeldAccounts(),
    )
    expect(model.heldAccounts).toEqual(
      UnavailableHeldAccounts({ accounts: [held()] }),
    )
  })

  it('names its amount in its asset', () => {
    expect(heldAmountLabel(mainnet, '181071945')).toBe('0.181071945 SOL')
    expect(heldAmountLabel('ethereum:mainnet', '1500000000000000000')).toBe(
      '1.5 ETH',
    )
  })

  it('reaches the origin as a path, so nothing goes in a body', () => {
    expect(heldClaimPathOf(request)).toBe(
      `/api/wallet/claim/solana%3Amainnet-beta/${heldAddress}/${ownMainnetAddress}`,
    )
  })

  it('reads back from JSON as the origin sent it', () => {
    const accounts = [
      held({
        maybeClaim: Option.some({
          toAddress: ownMainnetAddress,
          requestedAtMs: 2,
          status: 'Sent',
          maybeAmountAtomic: Option.some('181066945'),
          maybeTransactionId: Option.some('5hSent'),
          maybeFailure: Option.none(),
        }),
      }),
      held({ maybeBalanceAtomic: Option.none() }),
    ]
    expect(
      S.decodeUnknownSync(HeldAccounts)(
        JSON.parse(JSON.stringify(S.encodeSync(HeldAccounts)(accounts))),
      ),
    ).toEqual(accounts)
  })
})

describe('a move to their own wallet', () => {
  it('can be asked for once their wallet has its own account on that network and this site follows it', () => {
    expect(heldMoveRequestOf(withOwnWallet(), held())).toEqual(
      Option.some(request),
    )
  })

  it('cannot be asked for before their wallet exists, has that network, or is followed', () => {
    expect(
      heldMoveRequestOf({ ...withOwnWallet(), wallet: initialModel.wallet }, held()),
    ).toEqual(Option.none())
    expect(
      heldMoveRequestOf(
        withOwnWallet({
          wallet: OpenWallet({ model: Wallet.initialModel }),
        }),
        held(),
      ),
    ).toEqual(Option.none())
    expect(
      heldMoveRequestOf(withOwnWallet(), held({ networkId: 'ethereum:mainnet' })),
    ).toEqual(Option.none())
    expect(
      heldMoveRequestOf(withOwnWallet({ walletWatch: PendingWalletWatch() }), held()),
    ).toEqual(Option.none())
  })

  it('cannot be asked for again while one is on its way', () => {
    expect(
      heldMoveRequestOf(
        withOwnWallet(),
        held({
          maybeClaim: Option.some({
            toAddress: ownMainnetAddress,
            requestedAtMs: 2,
            status: 'Requested',
            maybeAmountAtomic: Option.none(),
            maybeTransactionId: Option.none(),
            maybeFailure: Option.none(),
          }),
        }),
      ),
    ).toEqual(Option.none())
  })

  it('cannot be asked for when the chain says nothing is left', () => {
    expect(
      heldMoveRequestOf(withOwnWallet(), held({ maybeBalanceAtomic: Option.some('0') })),
    ).toEqual(Option.none())
  })

  it('is filed once, on a click', () => {
    const clicked = update(withOwnWallet(), ClickedMoveHeldMoney({ request }))
    expect(clicked[0].heldMove).toEqual(FilingHeldMove({ request }))
    expect(commandNames(clicked)).toEqual(['FileHeldClaim'])
    const again = update(clicked[0], ClickedMoveHeldMoney({ request }))
    expect(commandNames(again)).toEqual([])
    expect(again[0]).toEqual(clicked[0])
  })

  it('reads the held accounts again once the origin took it', () => {
    const [filing] = update(withOwnWallet(), ClickedMoveHeldMoney({ request }))
    const [model, commands] = update(filing, SucceededFileHeldClaim())
    expect(model.heldMove).toEqual(IdleHeldMove())
    expect(model.heldRevision).toBe(filing.heldRevision + 1)
    expect(commands).toEqual([])
  })

  it('says why when the origin did not take it, and reads again in case it did', () => {
    const [filing] = update(withOwnWallet(), ClickedMoveHeldMoney({ request }))
    const [model] = update(
      filing,
      FailedFileHeldClaim({ reason: 'The page did not answer in time.' }),
    )
    expect(model.heldMove).toEqual(
      FailedHeldMove({ request, reason: 'The page did not answer in time.' }),
    )
    expect(model.heldRevision).toBe(filing.heldRevision + 1)
  })
})

describe('the held money and the log', () => {
  const overJson = (value: unknown): unknown =>
    JSON.parse(JSON.stringify(value))

  it('never goes on the log', () => {
    const isLocalOnly = BrandonProgram.synchronization?.isLocalOnly
    for (const message of [
      ReceivedHeldAccounts({ accounts: [held()] }),
      FailedHeldAccounts(),
      ClickedMoveHeldMoney({ request }),
      SucceededFileHeldClaim(),
      FailedFileHeldClaim({ reason: 'no' }),
    ]) {
      expect(isLocalOnly?.(message)).toBe(true)
      const forged = S.encodeSync(snapshotLogMessageWire(Message))(message)
      const row = overJson({
        id: 'r',
        from: 'intruder',
        createdAtMs: 1,
        tag: forged.tag,
      })
      expect(Option.isNone(S.decodeUnknownOption(MessageWire)(row))).toBe(true)
    }
  })

  it('stays on screen when the log refolds', () => {
    const keepOnRefold = BrandonProgram.synchronization?.keepOnRefold
    const current = withOwnWallet({
      heldMove: FilingHeldMove({ request }),
      heldRevision: 3,
    })
    const kept = keepOnRefold?.(current, initialModel)
    expect(kept?.heldAccounts).toEqual(current.heldAccounts)
    expect(kept?.heldMove).toEqual(current.heldMove)
    expect(kept?.heldRevision).toBe(3)
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

const stopped: Array<() => Promise<void>> = []
const realFetch = globalThis.fetch

afterEach(async () => {
  globalThis.fetch = realFetch
  await Promise.all(stopped.splice(0).map(stop => stop()))
})

describe('the page reading the money Scribe holds', () => {
  it('reads it when the wallet section shows, again on new activity, and again after a move', async () => {
    globalThis.fetch = async () => {
      throw new TypeError('offline in this test')
    }
    const reads = { count: 0 }
    const filed: Array<HeldClaimRequest> = []
    const walletPage = Page.make({
      displayName: 'Someone',
      sections: [
        PersonalWalletSection({
          key: SectionKey.make('wallet'),
          title: 'Your wallet',
          column: 'Main',
        }),
      ],
    })
    const server = Layer.succeed(BrandonServer, {
      loadPage: Effect.succeed(walletPage),
      loadFootball: Effect.succeed([]),
      loadWallets: Effect.succeed([]),
      loadWalletActivity: Effect.succeed([]),
      loadHeldAccounts: Effect.sync(() => {
        reads.count += 1
        return [held()]
      }),
      fileHeldClaim: claim =>
        Effect.sync(() => {
          filed.push(claim)
        }),
      watchWalletAccounts: () => Effect.void,
      reportSentTransaction: () => Effect.void,
      scrollToSection: () => Effect.void,
      reloadPage: Effect.void,
      nowMs: Effect.succeed(0),
    })
    const handle = startBrandonOn(
      Runtime.Memory({ processor: 'foldkit-held', store: Runtime.makeMemoryStore() }),
      Layer.merge(server, makeTestWalletResources()),
      Processor.Host.Foldkit(),
    )
    stopped.push(handle.stop)

    const shown = await eventually(
      handle.readModel,
      model =>
        model._tag === 'Ready' && model.heldAccounts._tag === 'LoadedHeldAccounts',
    )
    expect(shown._tag === 'Ready' && shown.heldAccounts).toEqual(
      LoadedHeldAccounts({ accounts: [held()] }),
    )
    const firstReads = reads.count

    handle.send(ChangedWalletActivity({ atMs: 1 }))
    expect(
      await eventually(
        () => reads.count,
        count => count > firstReads,
      ),
    ).toBeGreaterThan(firstReads)

    const secondReads = reads.count
    handle.send(ClickedMoveHeldMoney({ request }))
    expect(
      await eventually(
        () => filed.length,
        count => count === 1,
      ),
    ).toBe(1)
    expect(filed).toEqual([request])
    expect(
      await eventually(
        () => reads.count,
        count => count > secondReads,
      ),
    ).toBeGreaterThan(secondReads)
  })
})
