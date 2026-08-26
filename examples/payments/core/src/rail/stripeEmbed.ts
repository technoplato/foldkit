import {
  CARD_MIN_CENTS,
  CardFloor,
  type RailModule,
  SetupLink,
  StripeElementKind,
} from './spec.js'

/** Stripe Payment Element inside the host. */
export const module: RailModule = {
  id: 'stripe-embed',
  title: 'Stripe Payment Element',
  blurb:
    'Card form inside the host. Apple Pay only if this domain is verified.',
  setup: [
    SetupLink.make({
      label: 'API keys',
      href: 'https://dashboard.stripe.com/apikeys',
    }),
    SetupLink.make({
      label: 'Payment method domains',
      href: 'https://dashboard.stripe.com/settings/payment_method_domains',
    }),
  ],
  fields: ['stripeSecret', 'stripePublishable'],
  quotePolicy: CardFloor.make({ minCents: CARD_MIN_CENTS }),
  sessionKind: StripeElementKind.make({}),
  isReady: presence => presence.stripeSecret && presence.stripePublishable,
}
