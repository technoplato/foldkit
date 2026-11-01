import { Array, Option, Order, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { Game, Page, SectionKey, WalletAddress } from './page.js'

// MODEL

/** One player, folded from the log. */
export const Player = S.Struct({
  name: S.String,
  points: S.Int,
  maybeNote: S.Option(S.String),
  isDunce: S.Boolean,
  countedEventIds: S.Array(S.String),
})
/** One player, folded from the log. */
export type Player = typeof Player.Type

/** The section the listener last pointed at, and when. */
export const Pointer = S.Struct({ sectionKey: SectionKey, atMs: S.Number })
/** The section the listener last pointed at, and when. */
export type Pointer = typeof Pointer.Type

/** The page is on its way. */
export const LoadingPage = ts('LoadingPage')
/** This person's sections. */
export const ReadyPage = ts('ReadyPage', { page: Page })
/** The origin would not say. */
export const FailedToLoadPage = ts('FailedToLoadPage', { reason: S.String })
/** Where this person's page stands. */
export const PageState = S.Union([LoadingPage, ReadyPage, FailedToLoadPage])
/** Where this person's page stands. */
export type PageState = typeof PageState.Type

/** Every Brandon dot Model field. The log folds the first four. */
export const Model = S.Struct({
  players: S.Array(Player),
  pageRevision: S.Int,
  walletsRevision: S.Int,
  maybePointer: S.Option(Pointer),
  maybeReloadAtMs: S.Option(S.Number),
  page: PageState,
  games: S.Array(Game),
  wallets: S.Array(WalletAddress),
  maybeHighlighted: S.Option(SectionKey),
})
/** Every Brandon dot Model field. */
export type Model = typeof Model.Type

/** Nobody has scored, and the page has not loaded. */
export const initialModel: Model = {
  players: [],
  pageRevision: 0,
  walletsRevision: 0,
  maybePointer: Option.none(),
  maybeReloadAtMs: Option.none(),
  page: LoadingPage(),
  games: [],
  wallets: [],
  maybeHighlighted: Option.none(),
}

const byPointsDescending = Order.mapInput(
  Order.flip(Order.Number),
  (player: Player) => player.points,
)

/** The players, most points first; a tie keeps the order they joined. */
export const rankedPlayers = (model: Model): ReadonlyArray<Player> =>
  Array.sort(model.players, byPointsDescending)

/** True when the origin sent this person a section of that tag. */
export const hasSection = (
  model: Model,
  tag: Page['sections'][number]['_tag'],
): boolean =>
  model.page._tag === 'ReadyPage' &&
  Array.some(model.page.page.sections, section => section._tag === tag)
