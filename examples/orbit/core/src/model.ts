import { Schema as S } from 'effect'

/** Play units. Not satoshis. Not money. */
export const PlayCredits = S.Number.pipe(S.brand('PlayCredits'))
/** Play units. Not satoshis. Not money. */
export type PlayCredits = typeof PlayCredits.Type

/** Sim roles in the Orbit index. */
export const Role = S.Literals(['tortoise', 'achilles'])
/** A sim role. */
export type Role = typeof Role.Type

/** No wallet has been opened. */
export const AbsentWallet = S.TaggedStruct('absent', {})
/** A simulated wallet holding play credits. Live is not a variant. */
export const SimWallet = S.TaggedStruct('sim', {
  role: Role,
  play: PlayCredits,
})
/**
 * Wallet ADT. There is no live variant. You cannot construct what is not
 * in the union.
 */
export const Wallet = S.Union([AbsentWallet, SimWallet])
/** A wallet value. */
export type Wallet = typeof Wallet.Type

/** Tags that exist on Wallet. `live` is intentionally absent. */
export const WALLET_TAGS: ReadonlyArray<Wallet['_tag']> = ['absent', 'sim']

/** Type-level proof that Wallet has no live member. */
export type LiveWalletIsRepresentable = Extract<Wallet, { _tag: 'live' }> extends never
  ? false
  : true

/** Runtime proof that Wallet has no live member. */
export const liveWalletIsRepresentable: LiveWalletIsRepresentable = false

/** Asking for a live wallet. Always refused. */
export const LiveWalletDanger = S.TaggedStruct('live-wallet', {})
/** Asking to broadcast a claim. Always refused. */
export const BroadcastDanger = S.TaggedStruct('broadcast', {})
/** Asking to send on a chain. Always refused. */
export const ChainSendDanger = S.TaggedStruct('chain-send', {})
/** Asking to load key material. Always refused. */
export const KeyExfilDanger = S.TaggedStruct('key-exfil', {})
/** Every danger the Program can name. None of them execute. */
export const Danger = S.Union([
  LiveWalletDanger,
  BroadcastDanger,
  ChainSendDanger,
  KeyExfilDanger,
])
/** A danger value. */
export type Danger = typeof Danger.Type

/** Successful ledger line. */
export const OkEffect = S.TaggedStruct('ok', {
  line: S.String,
})
/** Refusal. Danger is data. There is no chain-send effect. */
export const RefuseEffect = S.TaggedStruct('refuse', {
  danger: Danger,
  why: S.String,
})
/** Outcome of one update. */
export const Outcome = S.Union([OkEffect, RefuseEffect])
/** An outcome value. */
export type Outcome = typeof Outcome.Type

/** One ledger event. */
export const LedgerEvent = S.Struct({
  seq: S.Number,
  line: S.String,
})
/** A ledger event value. */
export type LedgerEvent = typeof LedgerEvent.Type

/** One agent-index step result. */
export const StepResult = S.Struct({
  id: S.String,
  title: S.String,
  ok: S.Boolean,
  detail: S.String,
})
/** A step result value. */
export type StepResult = typeof StepResult.Type

/** Both sim slots. */
export const Sims = S.Struct({
  tortoise: Wallet,
  achilles: Wallet,
})
/** Both sim slots. */
export type Sims = typeof Sims.Type

/** Instant is the live source. StaticFallback is used when Instant is missing. */
export const CatalogSource = S.Literals(['Instant', 'StaticFallback'])
/** Where the visible snap came from. */
export type CatalogSource = typeof CatalogSource.Type

/** The Orbit Program Model. */
export const Model = S.Struct({
  sims: Sims,
  log: S.Array(LedgerEvent),
  seq: S.Number,
  steps: S.Array(StepResult),
  lastOutcome: S.Option(Outcome),
  selectedToolId: S.Option(S.String),
  source: CatalogSource,
})
/** An Orbit Model value. */
export type Model = typeof Model.Type

/** Play balance of a wallet, 0 when absent. */
export const playOf = (wallet: Wallet): number =>
  wallet._tag === 'sim' ? wallet.play : 0
