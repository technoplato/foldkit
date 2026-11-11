import {
  ClickedMoveHeldMoney,
  ConfirmedWalletWatch,
  FailedHeldMove,
  FailedWalletWatch,
  FootballSection,
  type HeldAccount,
  LoadedHeldAccounts,
  LoadedWalletActivity,
  MarkdownSection,
  OpenWallet,
  type Page,
  PersonalWalletSection,
  QrLinksSection,
  ScoreboardSection,
  SectionKey,
  SyncedBrandon,
  type SyncedBrandonModel,
  UnavailableWalletActivity,
  type WalletActivityEntry,
  WalletsSection,
  initialModel,
} from 'brandon-core-example'
import { Option } from 'effect'
import { Scene } from 'foldkit'
import { describe, expect, test } from 'vitest'
import * as Wallet from 'wallet-core-example'

import { parseMarkdown } from '@foldkit/markdown/vite'

import { view } from './view.js'

const update = (
  model: SyncedBrandonModel,
): readonly [SyncedBrandonModel, ReadonlyArray<never>] => [model, []]

const ready = (fields: Partial<typeof initialModel> = {}): SyncedBrandonModel =>
  SyncedBrandon.update(SyncedBrandon.init()[0], {
    _tag: 'SnapshotReceived',
    model: { ...initialModel, ...fields },
  })[0]

const key = (value: string) => SectionKey.make(value)

const page: Page = {
  displayName: 'Brandon',
  sections: [
    QrLinksSection({
      key: key('sign-up'),
      title: 'Brandon, sign up here',
      column: 'Top',
      document: parseMarkdown('Scan with your iPhone camera.'),
      links: [
        {
          label: 'brandon.pisspoursoftware.xyz',
          url: 'https://brandon.pisspoursoftware.xyz',
          qrPath: 'M4 4h1v1h-1z',
          qrSize: 21,
        },
      ],
    }),
    ScoreboardSection({
      key: key('scoreboard'),
      title: 'Scoreboard',
      column: 'Side',
    }),
    FootballSection({
      key: key('football'),
      title: 'College football',
      column: 'Side',
    }),
    WalletsSection({ key: key('wallets'), title: 'Wallets', column: 'Side' }),
    MarkdownSection({
      key: key('the-riddle'),
      title: 'The riddle',
      column: 'Main',
      document: parseMarkdown('Who bought the **eggplant**?'),
    }),
  ],
}

const everything = ready({
  page: { _tag: 'ReadyPage', page },
  players: [
    {
      name: 'Claude',
      points: 1,
      maybeNote: Option.some('Claude lost a point.'),
      isDunce: false,
      countedEventIds: ['1'],
    },
    {
      name: 'Tyler',
      points: 0,
      maybeNote: Option.none(),
      isDunce: true,
      countedEventIds: [],
    },
  ],
  games: [
    {
      id: '1',
      state: 'Live',
      detail: 'Q2 3:14',
      teams: [
        { name: 'Clemson', score: '14', maybeRank: Option.some(9) },
        { name: 'Florida St', score: '7', maybeRank: Option.none() },
      ],
    },
  ],
  wallets: [
    {
      label: 'Devnet',
      chain: 'Solana',
      network: 'Devnet',
      address: 'So11111111111111111111111111111111111111112',
      balanceAtomic: '1500000000',
      mirroredAtMs: 1_793_490_000_000,
      transactions: [
        {
          signature: '5hSig',
          slot: 7,
          maybeBlockTimeMs: Option.none(),
          didSucceed: true,
          maybeChangeAtomic: Option.some('-500'),
        },
      ],
    },
  ],
})

describe('the Brandon dot view', () => {
  test('waits with words until the log is read', () => {
    Scene.scene(
      { update, view },
      Scene.with(SyncedBrandon.init()[0]),
      Scene.expect(Scene.text('Loading')).toExist(),
    )
  })

  test('says so when the origin refuses, and shows no section', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        ready({ page: { _tag: 'FailedToLoadPage', reason: 'Refused.' } }),
      ),
      Scene.expect(Scene.text('Refused.')).toExist(),
      Scene.expect(Scene.text('Scoreboard')).toBeAbsent(),
    )
  })

  test('paints every kind of section the origin sent', () => {
    Scene.scene(
      { update, view },
      Scene.with(everything),
      Scene.expect(Scene.text('Scan with your iPhone camera.')).toExist(),
      Scene.expect(Scene.text('Scoreboard')).toExist(),
      Scene.expect(Scene.text('Claude lost a point.')).toExist(),
      Scene.expect(Scene.text('Clemson')).toExist(),
      Scene.expect(Scene.text('1.5 SOL')).toExist(),
      Scene.expect(Scene.text('The riddle')).toExist(),
      Scene.expect(Scene.text('eggplant')).toExist(),
    )
  })

  test('paints nothing the origin left out', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        ready({
          page: {
            _tag: 'ReadyPage',
            page: { ...page, sections: [] },
          },
          wallets: [],
        }),
      ),
      Scene.expect(Scene.text('Scoreboard')).toBeAbsent(),
      Scene.expect(Scene.text('Wallets')).toBeAbsent(),
    )
  })
})

describe('the wallet section', () => {
  const walletPage: Page = {
    displayName: 'Brandon',
    sections: [
      PersonalWalletSection({
        key: key('wallet'),
        title: 'Your wallet',
        column: 'Main',
      }),
    ],
  }

  const withWallet = (networkMode: Wallet.WalletNetworkMode) =>
    ready({
      page: { _tag: 'ReadyPage', page: walletPage },
      wallet: OpenWallet({
        model: { ...Wallet.init()[0], walletNetworkMode: networkMode },
      }),
    })

  test('says the wallet is opening until it opens', () => {
    Scene.scene(
      { update, view },
      Scene.with(ready({ page: { _tag: 'ReadyPage', page: walletPage } })),
      Scene.expect(Scene.text('Your wallet')).toExist(),
      Scene.expect(Scene.text('Opening your wallet')).toExist(),
    )
  })

  test('names a test network as test money', () => {
    Scene.scene(
      { update, view },
      Scene.with(withWallet('Devnet')),
      Scene.expect(Scene.text('Devnet: test money')).toExist(),
      Scene.expect(Scene.text('Mainnet: real money')).toBeAbsent(),
    )
  })

  test('names Mainnet as real money', () => {
    Scene.scene(
      { update, view },
      Scene.with(withWallet('Live')),
      Scene.expect(Scene.text('Mainnet: real money')).toExist(),
      Scene.expect(Scene.text('Devnet: test money')).toBeAbsent(),
    )
  })

  test('paints no wallet for a page without the section', () => {
    Scene.scene(
      { update, view },
      Scene.with(everything),
      Scene.expect(Scene.text('Opening your wallet')).toBeAbsent(),
      Scene.expect(Scene.text('Devnet: test money')).toBeAbsent(),
    )
  })

  describe('its activity', () => {
    const entry = (
      fields: Partial<WalletActivityEntry> = {},
    ): WalletActivityEntry => ({
      transactionId: '5hSignature',
      networkId: 'solana:devnet',
      direction: 'Incoming',
      status: 'Confirmed',
      maybeFinality: Option.some('Included'),
      assetId: 'solana:devnet:sol',
      amountAtomic: '500000000',
      maybeCounterpartyAddress: Option.some(
        'Sender1111111111111111111111111111111111111',
      ),
      observedAtMs: 1_793_490_000_000,
      maybeFailure: Option.none(),
      ...fields,
    })

    const withActivity = (
      networkMode: Wallet.WalletNetworkMode,
      entries: ReadonlyArray<WalletActivityEntry>,
    ) =>
      ready({
        page: { _tag: 'ReadyPage', page: walletPage },
        wallet: OpenWallet({
          model: { ...Wallet.init()[0], walletNetworkMode: networkMode },
        }),
        walletActivity: LoadedWalletActivity({ entries }),
      })

    test('shows a payment with its amount, network and status', () => {
      Scene.scene(
        { update, view },
        Scene.with(withActivity('Devnet', [entry()])),
        Scene.expect(Scene.text('All your wallets')).toExist(),
        Scene.expect(Scene.text('Received 0.5 SOL')).toExist(),
        Scene.expect(Scene.text('Confirmed')).toExist(),
        Scene.expect(Scene.text('Solana Devnet')).toExist(),
        Scene.expect(Scene.text('from Sender1111…111111')).toExist(),
      )
    })

    test('names every state of a transaction', () => {
      Scene.scene(
        { update, view },
        Scene.with(
          withActivity('Devnet', [
            entry({
              transactionId: 'sent',
              direction: 'Outgoing',
              status: 'Pending',
              maybeFinality: Option.none(),
              amountAtomic: '250000000',
            }),
            entry({
              transactionId: 'failed',
              direction: 'Outgoing',
              status: 'Failed',
              amountAtomic: '750000000',
            }),
            entry({
              transactionId: 'final',
              maybeFinality: Option.some('Final'),
              amountAtomic: '100000000',
            }),
          ]),
        ),
        Scene.expect(Scene.text('Sending 0.25 SOL')).toExist(),
        Scene.expect(Scene.text('Pending')).toExist(),
        Scene.expect(Scene.text('Did not send 0.75 SOL')).toExist(),
        Scene.expect(Scene.text('Failed')).toExist(),
        Scene.expect(Scene.text('Received 0.1 SOL')).toExist(),
        Scene.expect(Scene.text('Final')).toExist(),
      )
    })

    test('says why a transaction failed', () => {
      Scene.scene(
        { update, view },
        Scene.with(
          withActivity('Devnet', [
            entry({
              direction: 'Outgoing',
              status: 'Failed',
              maybeFailure: Option.some(
                'It never landed, so nothing was sent.',
              ),
            }),
          ]),
        ),
        Scene.expect(
          Scene.text('It never landed, so nothing was sent.'),
        ).toExist(),
      )
    })

    test("never shows another mode's rows, so test money never reads as real", () => {
      const mainnetEntry = entry({
        transactionId: 'real',
        networkId: 'solana:mainnet-beta',
        assetId: 'solana:mainnet-beta:sol',
        amountAtomic: '9000000000',
      })
      Scene.scene(
        { update, view },
        Scene.with(withActivity('Devnet', [entry(), mainnetEntry])),
        Scene.expect(Scene.text('Received 0.5 SOL')).toExist(),
        Scene.expect(Scene.text('Received 9 SOL')).toBeAbsent(),
      )
      Scene.scene(
        { update, view },
        Scene.with(withActivity('Live', [entry(), mainnetEntry])),
        Scene.expect(Scene.text('Received 9 SOL')).toExist(),
        Scene.expect(Scene.text('Received 0.5 SOL')).toBeAbsent(),
      )
    })

    test('says a payment will show up by itself when there is none yet', () => {
      Scene.scene(
        { update, view },
        Scene.with(withActivity('Live', [])),
        Scene.expect(
          Scene.text(
            'No Mainnet activity yet. A payment to your wallet shows up here by itself.',
          ),
        ).toExist(),
      )
    })

    test('keeps the last rows and says they may be old when a read fails', () => {
      Scene.scene(
        { update, view },
        Scene.with({
          ...withActivity('Devnet', []),
          walletActivity: UnavailableWalletActivity({ entries: [entry()] }),
        }),
        Scene.expect(Scene.text('Received 0.5 SOL')).toExist(),
        Scene.expect(
          Scene.text(
            'Your activity could not be read just now. These are the last rows this page got.',
          ),
        ).toExist(),
      )
    })

    test('says so when this site could not follow the wallet', () => {
      Scene.scene(
        { update, view },
        Scene.with({
          ...withActivity('Devnet', []),
          walletWatch: FailedWalletWatch(),
        }),
        Scene.expect(
          Scene.text(
            'This site could not start following this wallet, so a new payment may not show here until you reload. Your balance above still reads the chain.',
          ),
        ).toExist(),
      )
    })
  })
})

describe('money Scribe holds for them', () => {
  const heldPage: Page = {
    displayName: 'Someone',
    sections: [
      PersonalWalletSection({
        key: key('wallet'),
        title: 'Your wallet',
        column: 'Main',
      }),
    ],
  }
  const mainnet = 'solana:mainnet-beta'
  const heldAddress = 'So11111111111111111111111111111111111111112'
  const ownMainnetAddress = 'MainnetAddress1111111111111111111111111111111'
  const signature = '5hSentSignature1111111111111111111111111111'

  const ownProfile = Wallet.WalletProfile.make({
    walletId: 'wallet-1',
    displayName: 'wallet-1',
    createdAt: 1,
    accounts: [
      {
        accountId: 'wallet-1:solana:mainnet-beta',
        chainId: 'solana',
        networkId: mainnet,
        address: ownMainnetAddress,
        displayName: mainnet,
      },
    ],
  })

  const heldAccount = (fields: Partial<HeldAccount> = {}): HeldAccount => ({
    networkId: mainnet,
    address: heldAddress,
    maybeBalanceAtomic: Option.some('181071945'),
    maybeClaim: Option.none(),
    ...fields,
  })

  const claimOf = (
    fields: Partial<
      Extract<HeldAccount['maybeClaim'], { _tag: 'Some' }>['value']
    > = {},
  ): HeldAccount['maybeClaim'] =>
    Option.some({
      toAddress: ownMainnetAddress,
      requestedAtMs: 2,
      status: 'Requested' as const,
      maybeAmountAtomic: Option.none(),
      maybeTransactionId: Option.none(),
      maybeFailure: Option.none(),
      ...fields,
    })

  const withHeld = (
    accounts: ReadonlyArray<HeldAccount>,
    fields: Partial<typeof initialModel> = {},
    networkMode: Wallet.WalletNetworkMode = 'Devnet',
    wallets: ReadonlyArray<typeof ownProfile> = [ownProfile],
  ) =>
    ready({
      page: { _tag: 'ReadyPage', page: heldPage },
      wallet: OpenWallet({
        model: {
          ...Wallet.init()[0],
          walletNetworkMode: networkMode,
          wallets,
        },
      }),
      walletWatch: ConfirmedWalletWatch(),
      heldAccounts: LoadedHeldAccounts({ accounts }),
      ...fields,
    })

  const moveButton = Scene.role('button', { name: 'Move it to my wallet' })

  test('shows it in Devnet mode too, named as real money, with where its key is', () => {
    Scene.scene(
      { update, view },
      Scene.with(withHeld([heldAccount()])),
      Scene.expect(Scene.text('Held for you')).toExist(),
      Scene.expect(
        Scene.text(
          'Scribe holds 0.181071945 SOL for you on Solana Mainnet Beta. This is real money.',
        ),
      ).toExist(),
      Scene.expect(
        Scene.text(
          "Its key is on Michael's Mac, not in this browser. Move it to your own wallet here whenever you like.",
        ),
      ).toExist(),
      Scene.expect(Scene.text('Devnet: test money')).toExist(),
    )
  })

  test('says so when the chain did not answer for its balance', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        withHeld([heldAccount({ maybeBalanceAtomic: Option.none() })]),
      ),
      Scene.expect(
        Scene.text(
          'Scribe holds money for you on Solana Mainnet Beta, but its balance could not be read just now. This is real money.',
        ),
      ).toExist(),
    )
  })

  test('shows no card when Scribe holds nothing for them', () => {
    Scene.scene(
      { update, view },
      Scene.with(withHeld([])),
      Scene.expect(Scene.text('Held for you')).toBeAbsent(),
    )
  })

  test('asks them to make their wallet first', () => {
    Scene.scene(
      { update, view },
      Scene.with(withHeld([heldAccount()], {}, 'Devnet', [])),
      Scene.expect(
        Scene.text('Make your wallet below first, then move it there.'),
      ).toExist(),
      Scene.expect(moveButton).toBeAbsent(),
    )
  })

  test('waits until this site follows their wallet', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        withHeld([heldAccount()], { walletWatch: FailedWalletWatch() }),
      ),
      Scene.expect(moveButton).toBeAbsent(),
      Scene.expect(
        Scene.text('Make your wallet below first, then move it there.'),
      ).toExist(),
    )
  })

  test('moves it to their own address on a click', () => {
    const dispatched: Array<unknown> = []
    const recording = (
      model: SyncedBrandonModel,
      message: unknown,
    ): readonly [SyncedBrandonModel, ReadonlyArray<never>] => {
      dispatched.push(message)
      return [model, []]
    }
    Scene.scene(
      { update: recording, view },
      Scene.with(withHeld([heldAccount()])),
      Scene.expect(moveButton).toExist(),
      Scene.click(moveButton),
    )
    expect(dispatched).toEqual([
      ClickedMoveHeldMoney({
        request: {
          networkId: mainnet,
          heldAddress,
          toAddress: ownMainnetAddress,
        },
      }),
    ])
  })

  test('names in full the address it will move to, before they tap', () => {
    Scene.scene(
      { update, view },
      Scene.with(withHeld([heldAccount()])),
      Scene.expect(moveButton).toExist(),
      Scene.expect(
        Scene.text('It goes to this address of your own wallet:'),
      ).toExist(),
      Scene.expect(Scene.text(ownMainnetAddress)).toExist(),
    )
  })

  test('names no address while there is no wallet to move it to', () => {
    Scene.scene(
      { update, view },
      Scene.with(withHeld([heldAccount()], {}, 'Devnet', [])),
      Scene.expect(
        Scene.text('It goes to this address of your own wallet:'),
      ).toBeAbsent(),
    )
  })

  test('says a move is on its way, to which address, and offers no second one', () => {
    Scene.scene(
      { update, view },
      Scene.with(withHeld([heldAccount({ maybeClaim: claimOf() })])),
      Scene.expect(
        Scene.text(
          "Moving it to your wallet. Michael's Mac sends it, and it shows below once the chain has it.",
        ),
      ).toExist(),
      Scene.expect(Scene.text(ownMainnetAddress)).toExist(),
      Scene.expect(moveButton).toBeAbsent(),
    )
  })

  test('says it moved, with its transaction', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        withHeld([
          heldAccount({
            maybeBalanceAtomic: Option.some('0'),
            maybeClaim: claimOf({
              status: 'Sent',
              maybeAmountAtomic: Option.some('181066945'),
              maybeTransactionId: Option.some(signature),
            }),
          }),
        ]),
      ),
      Scene.expect(Scene.text('Moved 0.181066945 SOL to your wallet.')).toExist(),
      Scene.expect(Scene.text('5hSentSi…')).toExist(),
      Scene.expect(moveButton).toBeAbsent(),
    )
  })

  test('says why a move failed, that nothing was sent, and offers it again', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        withHeld([
          heldAccount({
            maybeClaim: claimOf({
              status: 'Failed',
              maybeFailure: Option.some(
                'Failed: the send expired before it landed; nothing was sent.',
              ),
            }),
          }),
        ]),
      ),
      Scene.expect(
        Scene.text(
          'Failed: the send expired before it landed; nothing was sent. Nothing was sent.',
        ),
      ).toExist(),
      Scene.expect(moveButton).toExist(),
    )
  })

  test('says when the move could not be asked for', () => {
    Scene.scene(
      { update, view },
      Scene.with(
        withHeld([heldAccount()], {
          heldMove: FailedHeldMove({
            request: {
              networkId: mainnet,
              heldAddress,
              toAddress: ownMainnetAddress,
            },
            reason: 'The page did not answer in time.',
          }),
        }),
      ),
      Scene.expect(
        Scene.text(
          'The move could not be asked for just now: The page did not answer in time. Nothing was sent.',
        ),
      ).toExist(),
      Scene.expect(moveButton).toExist(),
    )
  })
})
