import {
  CARD_MIN_CENTS,
  CardFloor,
  PaypalKind,
  type RailModule,
  SetupLink,
} from './spec.js'

/** PayPal Smart Buttons. */
export const module: RailModule = {
  id: 'paypal',
  title: 'PayPal Checkout',
  blurb: 'Smart Buttons in the pay sheet. Sandbox by default.',
  setup: [
    SetupLink.make({
      label: 'Sandbox apps',
      href: 'https://developer.paypal.com/dashboard/applications/sandbox',
    }),
    SetupLink.make({
      label: 'Live apps',
      href: 'https://developer.paypal.com/dashboard/applications/live',
    }),
  ],
  fields: ['paypalClientId', 'paypalSecret', 'paypalSandbox'],
  quotePolicy: CardFloor.make({ minCents: CARD_MIN_CENTS }),
  sessionKind: PaypalKind.make({}),
  isReady: presence => presence.paypalClientId && presence.paypalSecret,
}
