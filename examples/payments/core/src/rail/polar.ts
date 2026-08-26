import {
  CARD_MIN_CENTS,
  CardFloor,
  type RailModule,
  RedirectKind,
  SetupLink,
} from './spec.js'

/** Polar merchant of record. */
export const module: RailModule = {
  id: 'polar',
  title: 'Polar',
  blurb: 'Merchant of record. Polar hosts checkout and remits tax.',
  setup: [
    SetupLink.make({
      label: 'Dashboard',
      href: 'https://polar.sh/dashboard',
    }),
    SetupLink.make({
      label: 'Create token',
      href: 'https://polar.sh/docs/api-reference/introduction',
    }),
  ],
  fields: ['polarToken', 'polarProductId', 'polarCheckoutUrl'],
  quotePolicy: CardFloor.make({ minCents: CARD_MIN_CENTS }),
  sessionKind: RedirectKind.make({}),
  isReady: presence =>
    presence.polarCheckoutUrl ||
    (presence.polarToken && presence.polarProductId),
}
