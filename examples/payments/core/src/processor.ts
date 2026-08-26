import { Context, Data, Effect, Layer, Match as M, Schema as S } from 'effect'

import { RailId, requireRail } from './rail/index.js'

/** Hosted redirect the client should open. */
export const RedirectOffer = S.TaggedStruct('redirect', { url: S.String })
/** PayPal order the host buttons capture. */
export const PaypalOffer = S.TaggedStruct('paypal', {
  orderId: S.String,
  clientId: S.String,
  sandbox: S.Boolean,
})
/** Stripe Payment Element client secret. */
export const StripeElementOffer = S.TaggedStruct('stripe-element', {
  clientSecret: S.String,
  publishableKey: S.String,
})
/** Apple Pay Payment Request client secret. */
export const ApplePayOffer = S.TaggedStruct('apple-pay', {
  clientSecret: S.String,
  publishableKey: S.String,
})
/** Coinbase Onramp URL. */
export const OnrampOffer = S.TaggedStruct('onramp', { url: S.String })
/** Stripe Base deposit address for a follow-up x402 transfer. */
export const X402DepositOffer = S.TaggedStruct('x402-deposit', {
  depositAddress: S.String,
})
/** Wallet should send the exact USDC transfer. */
export const OnchainExactOffer = S.TaggedStruct('onchain-exact', {})
/** A session the host can present. Secrets are not included beyond Stripe client secrets. */
export const SessionOffer = S.Union([
  RedirectOffer,
  PaypalOffer,
  StripeElementOffer,
  ApplePayOffer,
  OnrampOffer,
  X402DepositOffer,
  OnchainExactOffer,
])
/** A session the host can present. */
export type SessionOffer = typeof SessionOffer.Type

/** A settled payment receipt. */
export const Receipt = S.Struct({
  rail: RailId,
  reference: S.String,
  resource: S.String,
  amountCents: S.Number,
  payer: S.String,
})
/** A settled payment receipt. */
export type Receipt = typeof Receipt.Type

/** Input for creating one provider session. */
export const SessionRequest = S.Struct({
  rail: RailId,
  slug: S.String,
  title: S.String,
  origin: S.String,
  amountCents: S.Number,
})
/** Input for creating one provider session. */
export type SessionRequest = typeof SessionRequest.Type

/** Input for verifying one provider session. */
export const VerifyRequest = S.Struct({
  rail: RailId,
  slug: S.String,
  origin: S.String,
  sessionId: S.optionalKey(S.String),
  orderId: S.optionalKey(S.String),
  paymentIntentId: S.optionalKey(S.String),
  checkoutId: S.optionalKey(S.String),
})
/** Input for verifying one provider session. */
export type VerifyRequest = typeof VerifyRequest.Type

/** A sanitized processor failure. */
export class ProcessorError extends Data.TaggedError('ProcessorError')<{
  readonly why: string
}> {}

/** Provider session and verify capabilities implemented by host Layers. */
export type PaymentProcessorService = Readonly<{
  createSession: (
    request: SessionRequest,
  ) => Effect.Effect<SessionOffer, ProcessorError>
  verify: (request: VerifyRequest) => Effect.Effect<Receipt, ProcessorError>
}>

/** An injected payment processor selected by the host. */
export class PaymentProcessor extends Context.Service<
  PaymentProcessor,
  PaymentProcessorService
>()('Payments/PaymentProcessor') {}

/** Resources required by the Payments Program. */
export type PaymentResources = PaymentProcessor

const cannedOffer = (request: SessionRequest): SessionOffer => {
  const kind = requireRail(request.rail).sessionKind
  return M.value(kind).pipe(
    M.withReturnType<SessionOffer>(),
    M.tagsExhaustive({
      Redirect: () =>
        RedirectOffer.make({
          url: `${request.origin}/pay/inert/${request.rail}/${request.slug}`,
        }),
      Paypal: () =>
        PaypalOffer.make({
          orderId: `inert-order-${request.slug}`,
          clientId: 'inert-paypal-client',
          sandbox: true,
        }),
      StripeElement: () =>
        StripeElementOffer.make({
          clientSecret: 'inert_secret_element',
          publishableKey: 'pk_test_inert',
        }),
      ApplePay: () =>
        ApplePayOffer.make({
          clientSecret: 'inert_secret_apple',
          publishableKey: 'pk_test_inert',
        }),
      Onramp: () =>
        OnrampOffer.make({
          url: `${request.origin}/pay/inert/onramp/${request.slug}`,
        }),
      X402Deposit: () =>
        X402DepositOffer.make({
          depositAddress: '0x0000000000000000000000000000000000000402',
        }),
      OnchainExact: () => OnchainExactOffer.make({}),
    }),
  )
}

const cannedReceipt = (request: VerifyRequest): Receipt =>
  Receipt.make({
    rail: request.rail,
    reference: `inert-${request.rail}-${request.slug}`,
    resource: request.slug,
    amountCents: 50,
    payer: 'inert',
  })

/** Inert processor for tests, CLI, and hosts without live keys. */
export const InertPaymentProcessorLive: Layer.Layer<PaymentProcessor> =
  Layer.succeed(PaymentProcessor, {
    createSession: request => Effect.succeed(cannedOffer(request)),
    verify: request => Effect.succeed(cannedReceipt(request)),
  })
