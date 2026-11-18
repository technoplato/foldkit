import { Array, Option, Order, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'
import * as Wallet from 'wallet-core-example'

import {
  Game,
  HeldAccount,
  HeldClaimRequest,
  Page,
  SectionKey,
  WalletActivityEntry,
  WalletAddress,
} from './page.js'

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

/** The origin has not sent this person the wallet section. */
export const ClosedWallet = ts('ClosedWallet')
/** The wallet section is on this page, with the wallet's own Model. */
export const OpenWallet = ts('OpenWallet', { model: Wallet.Model })
/** Whether this page holds the wallet. */
export const WalletState = S.Union([ClosedWallet, OpenWallet])
/** Whether this page holds the wallet. */
export type WalletState = typeof WalletState.Type

/** This person's wallet activity is on its way. */
export const LoadingWalletActivity = ts('LoadingWalletActivity')
/** This person's rows, as the origin last sent them. */
export const LoadedWalletActivity = ts('LoadedWalletActivity', {
  entries: S.Array(WalletActivityEntry),
})
/** The origin could not say; the last rows stay on screen. */
export const UnavailableWalletActivity = ts('UnavailableWalletActivity', {
  entries: S.Array(WalletActivityEntry),
})
/** Where this person's wallet activity stands. */
export const WalletActivityState = S.Union([
  LoadingWalletActivity,
  LoadedWalletActivity,
  UnavailableWalletActivity,
])
/** Where this person's wallet activity stands. */
export type WalletActivityState = typeof WalletActivityState.Type

/** This wallet's public addresses are on their way to the origin, or there are none. */
export const PendingWalletWatch = ts('PendingWalletWatch')
/** The origin follows this wallet's public addresses. */
export const ConfirmedWalletWatch = ts('ConfirmedWalletWatch')
/** The origin did not take them, so a new payment may not show here. */
export const FailedWalletWatch = ts('FailedWalletWatch')
/** Whether the origin follows this wallet on the chain. */
export const WalletWatchState = S.Union([
  PendingWalletWatch,
  ConfirmedWalletWatch,
  FailedWalletWatch,
])
/** Whether the origin follows this wallet on the chain. */
export type WalletWatchState = typeof WalletWatchState.Type

/** The accounts Scribe holds for this person are on their way. */
export const LoadingHeldAccounts = ts('LoadingHeldAccounts')
/** The accounts Scribe holds for this person, as the origin last sent them. */
export const LoadedHeldAccounts = ts('LoadedHeldAccounts', {
  accounts: S.Array(HeldAccount),
})
/** The origin could not say; the last accounts stay on screen. */
export const UnavailableHeldAccounts = ts('UnavailableHeldAccounts', {
  accounts: S.Array(HeldAccount),
})
/** Where the accounts Scribe holds for this person stand. */
export const HeldAccountsState = S.Union([
  LoadingHeldAccounts,
  LoadedHeldAccounts,
  UnavailableHeldAccounts,
])
/** Where the accounts Scribe holds for this person stand. */
export type HeldAccountsState = typeof HeldAccountsState.Type

/** No move of held money is on its way to the origin. */
export const IdleHeldMove = ts('IdleHeldMove')
/** A move of held money is on its way to the origin. */
export const FilingHeldMove = ts('FilingHeldMove', {
  request: HeldClaimRequest,
})
/** The origin did not take the last move, and why. */
export const FailedHeldMove = ts('FailedHeldMove', {
  request: HeldClaimRequest,
  reason: S.String,
})
/** Where the last move of held money this page asked for stands. */
export const HeldMoveState = S.Union([
  IdleHeldMove,
  FilingHeldMove,
  FailedHeldMove,
])
/** Where the last move of held money this page asked for stands. */
export type HeldMoveState = typeof HeldMoveState.Type

/** Every Brandon dot Model field. The log folds the first five. */
export const Model = S.Struct({
  players: S.Array(Player),
  pageRevision: S.Int,
  walletsRevision: S.Int,
  walletActivityRevision: S.Int,
  maybePointer: S.Option(Pointer),
  maybeReloadAtMs: S.Option(S.Number),
  page: PageState,
  games: S.Array(Game),
  wallets: S.Array(WalletAddress),
  maybeHighlighted: S.Option(SectionKey),
  wallet: WalletState,
  walletActivity: WalletActivityState,
  walletWatch: WalletWatchState,
  heldAccounts: HeldAccountsState,
  heldRevision: S.Int,
  heldMove: HeldMoveState,
})
/** Every Brandon dot Model field. */
export type Model = typeof Model.Type

/** Nobody has scored, and the page has not loaded. */
export const initialModel: Model = {
  players: [],
  pageRevision: 0,
  walletsRevision: 0,
  walletActivityRevision: 0,
  maybePointer: Option.none(),
  maybeReloadAtMs: Option.none(),
  page: LoadingPage(),
  games: [],
  wallets: [],
  maybeHighlighted: Option.none(),
  wallet: ClosedWallet(),
  walletActivity: LoadingWalletActivity(),
  walletWatch: PendingWalletWatch(),
  heldAccounts: LoadingHeldAccounts(),
  heldRevision: 0,
  heldMove: IdleHeldMove(),
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
