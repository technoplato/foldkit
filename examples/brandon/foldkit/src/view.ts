import {
  ClickedMoveHeldMoney,
  type Game,
  type GameTeam,
  GotWalletMessage,
  type HeldAccount,
  type Model,
  type PageInput,
  type Player,
  type Section,
  type SyncedBrandonModel,
  type WalletActivityEntry,
  type WalletAddress,
  type WalletTransaction,
  activityInMode,
  heldAmountLabel,
  heldMoveRequestOf,
  heldNetworkLabel,
  isHeldAccountEmpty,
  isHeldMoveOnItsWay,
  isRealMoneyNetwork,
  knownHeldAccounts,
  rankedPlayers,
  solOfLamports,
  walletActivityAmountLabel,
  walletActivityNetworkLabel,
} from 'brandon-core-example'
import { Array, Match as M, Option, String as Str } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'
import {
  type Model as WalletModel,
  shortenedAddress,
  walletNetworkModeLabel,
} from 'wallet-core-example'
import { makeWalletView } from 'wallet-foldkit-example/view'
import { freshWalletHostOrigin } from 'wallet-qr-example'

import { view as markdownView } from '@foldkit/markdown'

// VIEW

const h = html<PageInput>()

const pageTitle = 'Hot Phonez'
const heading = '🔥📱 Hot Phonez'
const domains = ['pisspoursoftware.xyz', 'pisspoorsoftware.xyz'] as const
const shownSignatureCharacters = 8

const svgNamespace = 'http://www.w3.org/2000/svg'

const qrCode = (path: string, size: number): Html =>
  h.svg(
    [
      h.Attribute('xmlns', svgNamespace),
      h.Attribute('viewBox', `0 0 ${size.toString()} ${size.toString()}`),
      h.Class('qr'),
      h.Attribute('role', 'img'),
      h.Attribute('aria-label', 'QR code'),
    ],
    [h.path([h.Attribute('d', path), h.Attribute('fill', '#000')], [])],
  )

const qrLink = (
  link: Extract<Section, { _tag: 'QrLinksSection' }>['links'][number],
): Html =>
  h.div(
    [h.Class('qr-link')],
    [qrCode(link.qrPath, link.qrSize), h.a([h.Href(link.url)], [link.label])],
  )

const duncePolygon = '15,1 27,30 3,30'

const dunceHat = (): Html =>
  h.svg(
    [
      h.Attribute('xmlns', svgNamespace),
      h.Attribute('viewBox', '0 0 30 34'),
      h.Class('dunce-hat'),
      h.Attribute('role', 'img'),
      h.Attribute('aria-label', 'dunce hat'),
    ],
    [
      h.polygon(
        [h.Attribute('points', duncePolygon), h.Attribute('fill', '#f4f1ea')],
        [],
      ),
      h.rect(
        [
          h.Attribute('x', '1'),
          h.Attribute('y', '29'),
          h.Attribute('width', '28'),
          h.Attribute('height', '4'),
          h.Attribute('rx', '2'),
          h.Attribute('fill', '#f5a524'),
        ],
        [],
      ),
    ],
  )

const playerRow = (player: Player): Html =>
  h.keyed('div')(
    player.name,
    [h.Class('player')],
    [
      h.div(
        [h.Class('player-line')],
        [
          h.span(
            [h.Class('player-name')],
            [player.name, ...(player.isDunce ? [dunceHat()] : [])],
          ),
          h.b([], [player.points.toString()]),
        ],
      ),
      ...Option.match(player.maybeNote, {
        onNone: () => [],
        onSome: note => [h.p([h.Class('note')], [note])],
      }),
    ],
  )

const teamRow = (team: GameTeam): Html =>
  h.div(
    [h.Class('game-team')],
    [
      h.span(
        [],
        [
          ...Option.match(team.maybeRank, {
            onNone: () => [],
            onSome: rank => [h.span([h.Class('game-rank')], [rank.toString()])],
          }),
          team.name,
        ],
      ),
      h.b([], [team.score]),
    ],
  )

const gameRow = (game: Game): Html =>
  h.keyed('div')(
    game.id,
    [h.Class(game.state === 'Live' ? 'game is-live' : 'game')],
    [
      ...Array.map(game.teams, teamRow),
      h.div([h.Class('game-detail')], [game.detail]),
    ],
  )

const shortSignature = (signature: string): string =>
  `${Str.slice(0, shownSignatureCharacters)(signature)}…`

const transactionRow = (transaction: WalletTransaction): Html =>
  h.keyed('li')(
    transaction.signature,
    [h.Class(transaction.didSucceed ? 'transaction' : 'transaction is-failed')],
    [
      h.code([], [shortSignature(transaction.signature)]),
      h.span(
        [],
        [
          Option.match(transaction.maybeChangeAtomic, {
            onNone: () => (transaction.didSucceed ? 'Confirmed' : 'Failed'),
            onSome: change => `${solOfLamports(change)} SOL`,
          }),
        ],
      ),
    ],
  )

const walletRow = (wallet: WalletAddress): Html =>
  h.keyed('div')(
    wallet.address,
    [h.Class('wallet')],
    [
      h.div(
        [h.Class('player-line')],
        [
          h.span([], [`${wallet.label} (${wallet.network})`]),
          h.b([], [`${solOfLamports(wallet.balanceAtomic)} SOL`]),
        ],
      ),
      h.code([h.Class('wallet-address')], [wallet.address]),
      h.ul(
        [h.Class('transactions')],
        Array.map(wallet.transactions, transactionRow),
      ),
    ],
  )

const walletView = makeWalletView({
  hostOrigin: freshWalletHostOrigin,
  isAdvancedShown: false,
})

const activityTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const activityVerb = ({ direction, status }: WalletActivityEntry): string =>
  M.value({ direction, status }).pipe(
    M.withReturnType<string>(),
    M.when({ direction: 'Incoming', status: 'Pending' }, () => 'Receiving'),
    M.when({ direction: 'Incoming', status: 'Confirmed' }, () => 'Received'),
    M.when(
      { direction: 'Incoming', status: 'Failed' },
      () => 'Did not receive',
    ),
    M.when({ direction: 'Outgoing', status: 'Pending' }, () => 'Sending'),
    M.when({ direction: 'Outgoing', status: 'Confirmed' }, () => 'Sent'),
    M.when({ direction: 'Outgoing', status: 'Failed' }, () => 'Did not send'),
    M.exhaustive,
  )

const activityHeadline = (entry: WalletActivityEntry): string =>
  `${activityVerb(entry)} ${walletActivityAmountLabel(entry)}`

const activityStatus = (entry: WalletActivityEntry): string =>
  M.value(entry.status).pipe(
    M.withReturnType<string>(),
    M.when('Pending', () => 'Pending'),
    M.when('Failed', () => 'Failed'),
    M.when('Confirmed', () =>
      Option.contains(entry.maybeFinality, 'Final') ? 'Final' : 'Confirmed',
    ),
    M.exhaustive,
  )

const activityCounterparty = (
  entry: WalletActivityEntry,
): ReadonlyArray<Html> =>
  Option.match(entry.maybeCounterpartyAddress, {
    onNone: () => [],
    onSome: address => [
      h.code(
        [],
        [
          `${entry.direction === 'Incoming' ? 'from' : 'to'} ${shortenedAddress(address)}`,
        ],
      ),
    ],
  })

const activityRow = (entry: WalletActivityEntry): Html =>
  h.keyed('li')(
    `${entry.networkId}|${entry.transactionId}`,
    [h.Class(`person-activity-row is-${entry.status.toLowerCase()}`)],
    [
      h.div(
        [h.Class('person-activity-headline')],
        [
          h.strong([], [activityHeadline(entry)]),
          h.span([h.Class('person-activity-status')], [activityStatus(entry)]),
        ],
      ),
      h.div(
        [h.Class('person-activity-detail')],
        [
          h.span([], [walletActivityNetworkLabel(entry)]),
          h.span([], [activityTimeFormat.format(entry.observedAtMs)]),
          ...activityCounterparty(entry),
        ],
      ),
      ...Option.match(entry.maybeFailure, {
        onNone: () => [],
        onSome: failure => [h.p([h.Class('note')], [failure])],
      }),
    ],
  )

const activityRows = (
  entries: ReadonlyArray<WalletActivityEntry>,
  walletModel: WalletModel,
): Html => {
  const shown = activityInMode(entries, walletModel.walletNetworkMode)
  return Array.isReadonlyArrayEmpty(shown)
    ? h.p(
        [h.Class('note')],
        [
          `No ${walletNetworkModeLabel(walletModel.walletNetworkMode)} activity yet. A payment to your wallet shows up here by itself.`,
        ],
      )
    : h.ul([h.Class('person-activity-rows')], Array.map(shown, activityRow))
}

const walletWatchNote = (model: Model): ReadonlyArray<Html> =>
  M.value(model.walletWatch).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tagsExhaustive({
      PendingWalletWatch: () => [],
      ConfirmedWalletWatch: () => [],
      FailedWalletWatch: () => [
        h.p(
          [h.Class('note')],
          [
            'This site could not start following this wallet, so a new payment may not show here until you reload. Your balance above still reads the chain.',
          ],
        ),
      ],
    }),
  )

const walletActivity = (model: Model, walletModel: WalletModel): Html =>
  h.div(
    [
      h.Class(
        walletModel.walletNetworkMode === 'Live'
          ? 'person-activity is-mainnet'
          : 'person-activity',
      ),
    ],
    [
      h.h3([], ['All your wallets']),
      h.p(
        [h.Class('note')],
        ['Every wallet you made here, on any device, as the chain reports it.'],
      ),
      ...walletWatchNote(model),
      ...M.value(model.walletActivity).pipe(
        M.withReturnType<ReadonlyArray<Html>>(),
        M.tagsExhaustive({
          LoadingWalletActivity: () => [
            h.p([h.Class('note')], ['Reading your activity']),
          ],
          LoadedWalletActivity: ({ entries }) => [
            activityRows(entries, walletModel),
          ],
          UnavailableWalletActivity: ({ entries }) => [
            h.p(
              [h.Class('note')],
              [
                'Your activity could not be read just now. These are the last rows this page got.',
              ],
            ),
            activityRows(entries, walletModel),
          ],
        }),
      ),
    ],
  )

const heldKeyWords =
  "Its key is on Michael's Mac, not in this browser. Move it to your own wallet here whenever you like."

const heldBalanceWords = (held: HeldAccount): string => {
  const network = heldNetworkLabel(held.networkId)
  const money = isRealMoneyNetwork(held.networkId)
    ? 'This is real money.'
    : 'This is test money.'
  return Option.match(held.maybeBalanceAtomic, {
    onNone: () =>
      `Scribe holds money for you on ${network}, but its balance could not be read just now. ${money}`,
    onSome: balance =>
      `Scribe holds ${heldAmountLabel(held.networkId, balance)} for you on ${network}. ${money}`,
  })
}

const heldClaimLines = (held: HeldAccount): ReadonlyArray<Html> =>
  Option.match(held.maybeClaim, {
    onNone: () => [],
    onSome: claim =>
      M.value(claim.status).pipe(
        M.withReturnType<ReadonlyArray<Html>>(),
        M.when('Requested', () => [
          h.p(
            [h.Class('note held-moving')],
            [
              "Moving it to your wallet. Michael's Mac sends it, and it shows below once the chain has it.",
            ],
          ),
          h.code([h.Class('held-address')], [claim.toAddress]),
        ]),
        M.when('Sent', () => [
          h.p(
            [h.Class('note')],
            [
              Option.match(claim.maybeAmountAtomic, {
                onNone: () => 'Moved it to your wallet.',
                onSome: amount =>
                  `Moved ${heldAmountLabel(held.networkId, amount)} to your wallet.`,
              }),
            ],
          ),
          ...Option.match(claim.maybeTransactionId, {
            onNone: () => [],
            onSome: transactionId => [
              h.code(
                [h.Class('held-transaction')],
                [shortSignature(transactionId)],
              ),
            ],
          }),
        ]),
        M.when('Failed', () => [
          h.p(
            [h.Class('note held-failed')],
            [
              `${Option.getOrElse(claim.maybeFailure, () => 'The move did not go through.')} Nothing was sent.`,
            ],
          ),
        ]),
        M.exhaustive,
      ),
  })

const heldMoveFailureLines = (
  model: Model,
  held: HeldAccount,
): ReadonlyArray<Html> =>
  M.value(model.heldMove).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tag('FailedHeldMove', ({ request, reason }) =>
      request.networkId === held.networkId &&
      request.heldAddress === held.address
        ? [
            h.p(
              [h.Class('note held-failed')],
              [
                `The move could not be asked for just now: ${reason} Nothing was sent.`,
              ],
            ),
          ]
        : [],
    ),
    M.orElse(() => []),
  )

const heldMoveLines = (model: Model, held: HeldAccount): ReadonlyArray<Html> =>
  isHeldMoveOnItsWay(held) || isHeldAccountEmpty(held)
    ? []
    : Option.match(heldMoveRequestOf(model, held), {
        onNone: () => [
          h.p(
            [h.Class('note')],
            ['Make your wallet below first, then move it there.'],
          ),
        ],
        onSome: request => [
          h.p(
            [h.Class('note')],
            ['It goes to this address of your own wallet:'],
          ),
          h.code([h.Class('held-address')], [request.toAddress]),
          h.button(
            [
              h.Type('button'),
              h.Class('held-move'),
              h.Disabled(model.heldMove._tag === 'FilingHeldMove'),
              h.OnClick(ClickedMoveHeldMoney({ request })),
            ],
            ['Move it to my wallet'],
          ),
        ],
      })

const heldCard = (model: Model, held: HeldAccount): Html =>
  h.keyed('div')(
    `${held.networkId}|${held.address}`,
    [
      h.Class(
        isRealMoneyNetwork(held.networkId)
          ? 'held-card is-mainnet'
          : 'held-card',
      ),
    ],
    [
      h.h3([], ['Held for you']),
      h.p([h.Class('held-balance')], [heldBalanceWords(held)]),
      h.p([h.Class('note')], [heldKeyWords]),
      ...heldClaimLines(held),
      ...heldMoveFailureLines(model, held),
      ...heldMoveLines(model, held),
    ],
  )

const heldCards = (model: Model): ReadonlyArray<Html> => {
  const accounts = knownHeldAccounts(model.heldAccounts)
  const staleNote =
    model.heldAccounts._tag === 'UnavailableHeldAccounts' &&
    Array.isReadonlyArrayNonEmpty(accounts)
      ? [
          h.p(
            [h.Class('note')],
            [
              'The money Scribe holds for you could not be read just now. This is what this page last heard.',
            ],
          ),
        ]
      : []
  return [...staleNote, ...Array.map(accounts, held => heldCard(model, held))]
}

const personalWallet = (model: Model): Html =>
  M.value(model.wallet).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      ClosedWallet: () => h.p([h.Class('note')], ['Opening your wallet']),
      OpenWallet: ({ model: walletModel }) =>
        h.div(
          [],
          [
            ...heldCards(model),
            h.submodel({
              slotId: 'wallet',
              model: walletModel,
              view: walletView,
              toParentMessage: message => GotWalletMessage({ message }),
            }),
            walletActivity(model, walletModel),
          ],
        ),
    }),
  )

const sectionBody = (model: Model, section: Section): ReadonlyArray<Html> =>
  M.value(section).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tagsExhaustive({
      MarkdownSection: ({ document }) => [markdownView(document)],
      QrLinksSection: ({ document, links }) => [
        markdownView(document),
        h.div([h.Class('qr-links')], Array.map(links, qrLink)),
      ],
      ScoreboardSection: () => [
        h.div([h.Class('players')], Array.map(rankedPlayers(model), playerRow)),
      ],
      FootballSection: () => [
        h.div(
          [h.Class('games')],
          Array.isReadonlyArrayEmpty(model.games)
            ? ['Loading scores']
            : Array.map(model.games, gameRow),
        ),
      ],
      WalletsSection: () => [
        h.div(
          [h.Class('wallets')],
          Array.isReadonlyArrayEmpty(model.wallets)
            ? [h.p([h.Class('note')], ['No addresses mirrored yet.'])]
            : Array.map(model.wallets, walletRow),
        ),
      ],
      PersonalWalletSection: () => [personalWallet(model)],
    }),
  )

const isPointedAt = (model: Model, section: Section): boolean =>
  Option.contains(model.maybeHighlighted, section.key)

const sectionView = (model: Model, section: Section): Html =>
  h.keyed('section')(
    section.key,
    [
      h.Id(section.key),
      h.Class(
        isPointedAt(model, section)
          ? `section is-${section.column.toLowerCase()} is-pointed`
          : `section is-${section.column.toLowerCase()}`,
      ),
    ],
    [h.h2([], [section.title]), ...sectionBody(model, section)],
  )

const inColumn = (
  model: Model,
  sections: ReadonlyArray<Section>,
  column: Section['column'],
): ReadonlyArray<Html> =>
  Array.map(
    Array.filter(sections, section => section.column === column),
    section => sectionView(model, section),
  )

const notice = (words: string): Html => h.p([h.Class('notice')], [words])

const pageView = (model: Model): Html =>
  M.value(model.page).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      LoadingPage: () => notice('Loading'),
      FailedToLoadPage: ({ reason }) => notice(reason),
      ReadyPage: ({ page }) =>
        h.div(
          [h.Class('page')],
          [
            h.div([h.Class('top')], inColumn(model, page.sections, 'Top')),
            h.main(
              [],
              [
                h.div(
                  [h.Class('main-column')],
                  [
                    h.h1([], [heading]),
                    ...inColumn(model, page.sections, 'Main'),
                  ],
                ),
                h.aside([], inColumn(model, page.sections, 'Side')),
              ],
            ),
          ],
        ),
    }),
  )

const header = (): Html =>
  h.header(
    [h.Class('domains')],
    Array.intersperse(
      Array.map(domains, domain => h.span([], [domain])),
      h.span([h.Class('muted')], ['·']),
    ),
  )

/**
 * The page paints what the origin sent and what the log folded. It has no
 * idea what a flag is: a section this person may not see is simply not in
 * the Model.
 */
export const view = (model: SyncedBrandonModel): Document => ({
  title: pageTitle,
  body: h.div(
    [h.Class('shell')],
    [
      header(),
      M.value(model).pipe(
        M.withReturnType<Html>(),
        M.tags({
          Starting: () => notice('Loading'),
          Ready: ready => pageView(ready),
        }),
        M.orElse(() => notice('The scoreboard cannot be read right now.')),
      ),
    ],
  ),
})
