import { Array, Match as M, Option } from 'effect'
import * as Command from 'foldkit/command'
import * as Wallet from 'wallet-core-example'

import {
  type AwardedPoints as AwardedPointsMessage,
  GotWalletMessage,
  type Message,
  type NotedPlayer as NotedPlayerMessage,
} from './message.js'
import {
  ClosedWallet,
  FailedToLoadPage,
  type Model,
  OpenWallet,
  type Player,
  ReadyPage,
  type WalletState,
} from './model.js'
import type { Page } from './page.js'

// UPDATE

type BrandonCommand = Command.Command<Message, never, Wallet.WalletResources>

type UpdateReturn = readonly [Model, ReadonlyArray<BrandonCommand>]

type WalletReturn = readonly [WalletState, ReadonlyArray<BrandonCommand>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const withWalletReturn = M.withReturnType<WalletReturn>()

const newPlayer = (name: string): Player => ({
  name,
  points: 0,
  maybeNote: Option.none(),
  isDunce: false,
  countedEventIds: [],
})

const withPlayer = (
  players: ReadonlyArray<Player>,
  name: string,
  change: (player: Player) => Player,
): ReadonlyArray<Player> =>
  Array.some(players, player => player.name === name)
    ? Array.map(players, player =>
        player.name === name ? change(player) : player,
      )
    : Array.append(players, change(newPlayer(name)))

const awarded = (
  players: ReadonlyArray<Player>,
  { eventId, name, points }: typeof AwardedPointsMessage.Type,
): ReadonlyArray<Player> =>
  withPlayer(players, name, player =>
    Array.contains(player.countedEventIds, eventId)
      ? player
      : {
          ...player,
          points: player.points + points,
          countedEventIds: Array.append(player.countedEventIds, eventId),
        },
  )

const annotated = (
  players: ReadonlyArray<Player>,
  { name, maybeNote, isDunce }: typeof NotedPlayerMessage.Type,
): ReadonlyArray<Player> =>
  withPlayer(players, name, player => ({ ...player, maybeNote, isDunce }))

const toBrandonCommands = (
  commands: ReadonlyArray<
    Command.Command<Wallet.Message, never, Wallet.WalletResources>
  >,
): ReadonlyArray<BrandonCommand> =>
  Command.mapMessages(commands, message => GotWalletMessage({ message }))

const hasWalletSection = (page: Page): boolean =>
  Array.some(page.sections, section => section._tag === 'PersonalWalletSection')

const openedWallet = (): WalletReturn => {
  const [walletModel, commands] = Wallet.init()
  return [OpenWallet({ model: walletModel }), toBrandonCommands(commands)]
}

const walletForPage = (wallet: WalletState, page: Page): WalletReturn =>
  M.value(wallet).pipe(
    withWalletReturn,
    M.tagsExhaustive({
      ClosedWallet: () =>
        hasWalletSection(page) ? openedWallet() : [wallet, []],
      OpenWallet: () =>
        hasWalletSection(page) ? [wallet, []] : [ClosedWallet(), []],
    }),
  )

/**
 * The log's facts fold the scoreboard and the revisions; everything the
 * origin sends only lands in the Model. Subscriptions do the reading, so a
 * replay of the log repeats no work. The wallet opens when the origin
 * sends its section and shuts when the origin stops; a failed read leaves
 * it as it is, so a send in flight keeps its result.
 */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      AwardedPoints: award => [
        { ...model, players: awarded(model.players, award) },
        [],
      ],
      NotedPlayer: note => [
        { ...model, players: annotated(model.players, note) },
        [],
      ],
      PointedAtSection: ({ sectionKey, atMs }) => [
        { ...model, maybePointer: Option.some({ sectionKey, atMs }) },
        [],
      ],
      ChangedSections: () => [
        { ...model, pageRevision: model.pageRevision + 1 },
        [],
      ],
      MirroredWallets: () => [
        { ...model, walletsRevision: model.walletsRevision + 1 },
        [],
      ],
      RequestedReload: ({ atMs }) => [
        { ...model, maybeReloadAtMs: Option.some(atMs) },
        [],
      ],
      ReceivedPage: ({ page }) => {
        const [wallet, walletCommands] = walletForPage(model.wallet, page)
        return [{ ...model, page: ReadyPage({ page }), wallet }, walletCommands]
      },
      FailedPage: ({ reason }) => [
        { ...model, page: FailedToLoadPage({ reason }) },
        [],
      ],
      ReceivedFootball: ({ games }) => [{ ...model, games }, []],
      FailedFootball: () => [model, []],
      ReceivedWallets: ({ wallets }) => [{ ...model, wallets }, []],
      FailedWallets: () => [model, []],
      CompletedScrollToSection: ({ sectionKey }) => [
        { ...model, maybeHighlighted: Option.some(sectionKey) },
        [],
      ],
      IgnoredStalePointer: () => [model, []],
      IgnoredStaleReload: () => [model, []],
      GotWalletMessage: ({ message }) =>
        M.value(model.wallet).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            ClosedWallet: () => [model, []],
            OpenWallet: ({ model: walletModel }) => {
              const [nextWalletModel, commands] = Wallet.update(
                walletModel,
                message,
              )
              return [
                {
                  ...model,
                  wallet: OpenWallet({ model: nextWalletModel }),
                },
                toBrandonCommands(commands),
              ]
            },
          }),
        ),
    }),
  )
