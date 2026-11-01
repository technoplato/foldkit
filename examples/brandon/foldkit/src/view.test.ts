import {
  FailedWalletWatch,
  FootballSection,
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
import { describe, test } from 'vitest'
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
        Scene.expect(Scene.text('Sent 0.25 SOL')).toExist(),
        Scene.expect(Scene.text('Pending')).toExist(),
        Scene.expect(Scene.text('Sent 0.75 SOL')).toExist(),
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
