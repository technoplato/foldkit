import {
  ApplePayKind,
  CARD_MIN_CENTS,
  CardFloor,
  type RailModule,
  SetupLink,
} from './spec.js'

/** Apple Pay via Stripe Payment Request. */
export const module: RailModule = {
  id: 'apple-pay',
  title: 'Apple Pay',
  blurb:
    'Payment Request via Stripe. Register this domain, or use hosted Checkout.',
  setup: [
    SetupLink.make({
      label: 'Stripe domains',
      href: 'https://dashboard.stripe.com/settings/payment_method_domains',
    }),
    SetupLink.make({
      label: 'Apple Merchant IDs',
      href: 'https://developer.apple.com/account/resources/identifiers/list/merchantId',
    }),
  ],
  fields: ['stripeSecret', 'stripePublishable'],
  quotePolicy: CardFloor.make({ minCents: CARD_MIN_CENTS }),
  sessionKind: ApplePayKind.make({}),
  isReady: presence => presence.stripeSecret && presence.stripePublishable,
}
