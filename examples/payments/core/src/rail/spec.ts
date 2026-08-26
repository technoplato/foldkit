import { Schema as S } from 'effect'

/** Merchant rail identifiers. */
export const RailId = S.Literals([
  'x402',
  'stripe-checkout',
  'polar',
  'lemon',
  'paypal',
  'coinbase-onramp',
  'stripe-x402',
  'stripe-embed',
  'apple-pay',
])
/** A merchant rail identifier. */
export type RailId = typeof RailId.Type

/** Tags that exist on RailId. */
export const RAIL_IDS: ReadonlyArray<RailId> = [
  'x402',
  'stripe-checkout',
  'polar',
  'lemon',
  'paypal',
  'coinbase-onramp',
  'stripe-x402',
  'stripe-embed',
  'apple-pay',
]

/** Named credential slots. Values never enter the Model. */
export const CredentialFieldId = S.Literals([
  'stripeSecret',
  'stripePublishable',
  'stripePaymentLink',
  'polarToken',
  'polarProductId',
  'polarCheckoutUrl',
  'lemonApiKey',
  'lemonStoreId',
  'lemonVariantId',
  'lemonCheckoutUrl',
  'paypalClientId',
  'paypalSecret',
  'paypalSandbox',
  'coinbaseProjectId',
])
/** A named credential slot. */
export type CredentialFieldId = typeof CredentialFieldId.Type

/** Which credential slots the host has recorded. */
export const CredentialPresence = S.Struct({
  stripeSecret: S.Boolean,
  stripePublishable: S.Boolean,
  stripePaymentLink: S.Boolean,
  polarToken: S.Boolean,
  polarProductId: S.Boolean,
  polarCheckoutUrl: S.Boolean,
  lemonApiKey: S.Boolean,
  lemonStoreId: S.Boolean,
  lemonVariantId: S.Boolean,
  lemonCheckoutUrl: S.Boolean,
  paypalClientId: S.Boolean,
  paypalSecret: S.Boolean,
  paypalSandbox: S.Boolean,
  coinbaseProjectId: S.Boolean,
})
/** Credential presence flags. */
export type CredentialPresence = typeof CredentialPresence.Type

/** Empty presence. Sandbox PayPal is on by default as a preference flag. */
export const emptyPresence: CredentialPresence = CredentialPresence.make({
  stripeSecret: false,
  stripePublishable: false,
  stripePaymentLink: false,
  polarToken: false,
  polarProductId: false,
  polarCheckoutUrl: false,
  lemonApiKey: false,
  lemonStoreId: false,
  lemonVariantId: false,
  lemonCheckoutUrl: false,
  paypalClientId: false,
  paypalSecret: false,
  paypalSandbox: true,
  coinbaseProjectId: false,
})

/** A dashboard URL the host can open. */
export const SetupLink = S.Struct({
  label: S.String,
  href: S.String,
})
/** A dashboard URL the host can open. */
export type SetupLink = typeof SetupLink.Type

/** Exact on-chain 402 quote. */
export const Exact402 = S.TaggedStruct('Exact402', {})
/** Card rails refuse below this floor. */
export const CardFloor = S.TaggedStruct('CardFloor', { minCents: S.Number })
/** Onramp then settle 402. */
export const OnrampFloor = S.TaggedStruct('OnrampFloor', { minCents: S.Number })
/** How a rail prices a resource. */
export const QuotePolicy = S.Union([Exact402, CardFloor, OnrampFloor])
/** How a rail prices a resource. */
export type QuotePolicy = typeof QuotePolicy.Type

/** Card micropayment floor in USD cents. */
export const CARD_MIN_CENTS = 50

/** Coinbase guest onramp practical floor in USD cents. */
export const ONRAMP_MIN_CENTS = 500

/** Hosted redirect checkout. */
export const RedirectKind = S.TaggedStruct('Redirect', {})
/** PayPal Smart Buttons. */
export const PaypalKind = S.TaggedStruct('Paypal', {})
/** Stripe Payment Element. */
export const StripeElementKind = S.TaggedStruct('StripeElement', {})
/** Apple Pay Payment Request. */
export const ApplePayKind = S.TaggedStruct('ApplePay', {})
/** Coinbase Onramp buy flow. */
export const OnrampKind = S.TaggedStruct('Onramp', {})
/** Stripe crypto deposit address, then x402. */
export const X402DepositKind = S.TaggedStruct('X402Deposit', {})
/** Wallet ERC-20 transfer. */
export const OnchainExactKind = S.TaggedStruct('OnchainExact', {})
/** Session shape a rail asks the host to present. */
export const SessionKind = S.Union([
  RedirectKind,
  PaypalKind,
  StripeElementKind,
  ApplePayKind,
  OnrampKind,
  X402DepositKind,
  OnchainExactKind,
])
/** Session shape a rail asks the host to present. */
export type SessionKind = typeof SessionKind.Type

/** Wallet is not connected. */
export const WalletDisconnected = S.TaggedStruct('Disconnected', {})
/** Wallet is connected. */
export const WalletConnected = S.TaggedStruct('Connected', {})
/** Wallet link for the x402 rail. */
export const WalletLink = S.Union([WalletDisconnected, WalletConnected])
/** Wallet link for the x402 rail. */
export type WalletLink = typeof WalletLink.Type

/** One renderer-free rail module. */
export type RailModule = Readonly<{
  id: RailId
  title: string
  blurb: string
  setup: ReadonlyArray<SetupLink>
  fields: ReadonlyArray<CredentialFieldId>
  quotePolicy: QuotePolicy
  sessionKind: SessionKind
  isReady: (presence: CredentialPresence, wallet: WalletLink) => boolean
}>

/** Records that one credential slot is present without storing the secret. */
export const recordPresence = (
  presence: CredentialPresence,
  field: CredentialFieldId,
  isPresent: boolean,
): CredentialPresence => {
  if (field === 'stripeSecret') {
    return CredentialPresence.make({ ...presence, stripeSecret: isPresent })
  }
  if (field === 'stripePublishable') {
    return CredentialPresence.make({
      ...presence,
      stripePublishable: isPresent,
    })
  }
  if (field === 'stripePaymentLink') {
    return CredentialPresence.make({
      ...presence,
      stripePaymentLink: isPresent,
    })
  }
  if (field === 'polarToken') {
    return CredentialPresence.make({ ...presence, polarToken: isPresent })
  }
  if (field === 'polarProductId') {
    return CredentialPresence.make({ ...presence, polarProductId: isPresent })
  }
  if (field === 'polarCheckoutUrl') {
    return CredentialPresence.make({ ...presence, polarCheckoutUrl: isPresent })
  }
  if (field === 'lemonApiKey') {
    return CredentialPresence.make({ ...presence, lemonApiKey: isPresent })
  }
  if (field === 'lemonStoreId') {
    return CredentialPresence.make({ ...presence, lemonStoreId: isPresent })
  }
  if (field === 'lemonVariantId') {
    return CredentialPresence.make({ ...presence, lemonVariantId: isPresent })
  }
  if (field === 'lemonCheckoutUrl') {
    return CredentialPresence.make({ ...presence, lemonCheckoutUrl: isPresent })
  }
  if (field === 'paypalClientId') {
    return CredentialPresence.make({ ...presence, paypalClientId: isPresent })
  }
  if (field === 'paypalSecret') {
    return CredentialPresence.make({ ...presence, paypalSecret: isPresent })
  }
  if (field === 'paypalSandbox') {
    return CredentialPresence.make({ ...presence, paypalSandbox: isPresent })
  }
  return CredentialPresence.make({ ...presence, coinbaseProjectId: isPresent })
}

/** Reads one credential presence flag without indexing. */
export const readPresence = (
  presence: CredentialPresence,
  field: CredentialFieldId,
): boolean => {
  if (field === 'stripeSecret') {
    return presence.stripeSecret
  }
  if (field === 'stripePublishable') {
    return presence.stripePublishable
  }
  if (field === 'stripePaymentLink') {
    return presence.stripePaymentLink
  }
  if (field === 'polarToken') {
    return presence.polarToken
  }
  if (field === 'polarProductId') {
    return presence.polarProductId
  }
  if (field === 'polarCheckoutUrl') {
    return presence.polarCheckoutUrl
  }
  if (field === 'lemonApiKey') {
    return presence.lemonApiKey
  }
  if (field === 'lemonStoreId') {
    return presence.lemonStoreId
  }
  if (field === 'lemonVariantId') {
    return presence.lemonVariantId
  }
  if (field === 'lemonCheckoutUrl') {
    return presence.lemonCheckoutUrl
  }
  if (field === 'paypalClientId') {
    return presence.paypalClientId
  }
  if (field === 'paypalSecret') {
    return presence.paypalSecret
  }
  if (field === 'paypalSandbox') {
    return presence.paypalSandbox
  }
  return presence.coinbaseProjectId
}
