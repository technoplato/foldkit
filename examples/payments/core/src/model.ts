import { Option, Schema as S } from 'effect'

import { Receipt, SessionOffer } from './processor.js'
import {
  CARD_MIN_CENTS,
  CredentialPresence,
  RailId,
  WalletDisconnected,
  WalletLink,
  chargeCentsFor,
  emptyPresence,
} from './rail/index.js'

/** A priced resource the merchant is selling. */
export const Quote = S.Struct({
  slug: S.String,
  title: S.String,
  amountAtomic: S.String,
  origin: S.String,
})
/** A priced resource the merchant is selling. */
export type Quote = typeof Quote.Type

/** No checkout is in flight. */
export const IdleCheckout = S.TaggedStruct('idle', {})
/** The processor is creating a provider session. */
export const CreatingSession = S.TaggedStruct('creating-session', {
  rail: RailId,
})
/** The host is presenting a provider session. */
export const AwaitingCheckout = S.TaggedStruct('awaiting-checkout', {
  rail: RailId,
  offer: SessionOffer,
})
/** The processor is verifying a provider session. */
export const VerifyingCheckout = S.TaggedStruct('verifying', {
  rail: RailId,
  offer: SessionOffer,
})
/** Checkout settled. */
export const SettledCheckout = S.TaggedStruct('settled', {
  receipt: Receipt,
})
/** Checkout failed. */
export const FailedCheckout = S.TaggedStruct('failed', {
  why: S.String,
})
/** Finite checkout lifecycle. */
export const CheckoutPhase = S.Union([
  IdleCheckout,
  CreatingSession,
  AwaitingCheckout,
  VerifyingCheckout,
  SettledCheckout,
  FailedCheckout,
])
/** A checkout phase value. */
export type CheckoutPhase = typeof CheckoutPhase.Type

/** Successful update. */
export const OkEffect = S.TaggedStruct('ok', { line: S.String })
/** Refusal. Danger is data. */
export const RefuseEffect = S.TaggedStruct('refuse', { why: S.String })
/** Outcome of one update. */
export const Outcome = S.Union([OkEffect, RefuseEffect])
/** An outcome value. */
export type Outcome = typeof Outcome.Type

/** The Payments Program Model. */
export const Model = S.Struct({
  selectedRail: RailId,
  quote: Quote,
  presence: CredentialPresence,
  wallet: WalletLink,
  phase: CheckoutPhase,
  lastOutcome: S.Option(Outcome),
})
/** A Payments Model value. */
export type Model = typeof Model.Type

/** Default demo resource: one USDC cent exact, fifty cents on cards. */
export const defaultQuote: Quote = Quote.make({
  slug: 'brief',
  title: '402 Live brief',
  amountAtomic: '10000',
  origin: 'https://payments.knophy.com',
})

/** Fresh Payments Model. */
export const initialModel: Model = Model.make({
  selectedRail: 'x402',
  quote: defaultQuote,
  presence: emptyPresence,
  wallet: WalletDisconnected.make({}),
  phase: IdleCheckout.make({}),
  lastOutcome: Option.none(),
})

/** Quoted cents for the selected rail. */
export const quotedCents = (model: Model): number =>
  chargeCentsFor(model.selectedRail, BigInt(model.quote.amountAtomic))

/** Card floor constant re-exported for clients. */
export { CARD_MIN_CENTS }
