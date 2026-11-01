import { Array, Match as M, Option } from 'effect'
import type * as Command from 'foldkit/command'

import type {
  AwardedPoints as AwardedPointsMessage,
  Message,
  NotedPlayer as NotedPlayerMessage,
} from './message.js'
import {
  FailedToLoadPage,
  type Model,
  type Player,
  ReadyPage,
} from './model.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

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

/**
 * The log's facts fold the scoreboard and the revisions; everything the
 * origin sends only lands in the Model. Subscriptions do the reading, so a
 * replay of the log repeats no work.
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
      GotPage: ({ page }) => [{ ...model, page: ReadyPage({ page }) }, []],
      FailedPage: ({ reason }) => [
        { ...model, page: FailedToLoadPage({ reason }) },
        [],
      ],
      GotFootball: ({ games }) => [{ ...model, games }, []],
      FailedFootball: () => [model, []],
      GotWallets: ({ wallets }) => [{ ...model, wallets }, []],
      FailedWallets: () => [model, []],
      CompletedScrollToSection: ({ sectionKey }) => [
        { ...model, maybeHighlighted: Option.some(sectionKey) },
        [],
      ],
      IgnoredStalePointer: () => [model, []],
      IgnoredStaleReload: () => [model, []],
    }),
  )
