import {
  CARD_MIN_CENTS,
  CardFloor,
  type RailModule,
  RedirectKind,
  SetupLink,
} from './spec.js'

/** Hosted Stripe Checkout. */
export const module: RailModule = {
  id: 'stripe-checkout',
  title: 'Stripe Checkout',
  blurb: 'Hosted page. Cards, Link, Apple Pay, Google Pay on Stripe domain.',
  setup: [
    SetupLink.make({
      label: 'API keys',
      href: 'https://dashboard.stripe.com/apikeys',
    }),
    SetupLink.make({
      label: 'Test keys',
      href: 'https://dashboard.stripe.com/test/apikeys',
    }),
  ],
  fields: ['stripeSecret', 'stripePaymentLink'],
  quotePolicy: CardFloor.make({ minCents: CARD_MIN_CENTS }),
  sessionKind: RedirectKind.make({}),
  isReady: presence => presence.stripeSecret || presence.stripePaymentLink,
}
