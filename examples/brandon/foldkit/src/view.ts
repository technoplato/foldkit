import {
  type Game,
  type GameTeam,
  type Model,
  type Player,
  type Section,
  type SyncedBrandonModel,
  type WalletAddress,
  type WalletTransaction,
  rankedPlayers,
  solOfLamports,
} from 'brandon-core-example'
import { Array, Match as M, Option, String as Str } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'

import { view as markdownView } from '@foldkit/markdown'

// VIEW

const h = html<never>()

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
        h.div([h.Class('wallets')], Array.map(model.wallets, walletRow)),
      ],
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
