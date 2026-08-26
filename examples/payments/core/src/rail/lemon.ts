import {
  CARD_MIN_CENTS,
  CardFloor,
  type RailModule,
  RedirectKind,
  SetupLink,
} from './spec.js'

/** Lemon Squeezy merchant of record. */
export const module: RailModule = {
  id: 'lemon',
  title: 'Lemon Squeezy',
  blurb: 'Merchant of record for digital products. Hosted checkout.',
  setup: [
    SetupLink.make({
      label: 'API keys',
      href: 'https://app.lemonsqueezy.com/settings/api',
    }),
    SetupLink.make({
      label: 'Products',
      href: 'https://app.lemonsqueezy.com/products',
    }),
  ],
  fields: ['lemonApiKey', 'lemonStoreId', 'lemonVariantId', 'lemonCheckoutUrl'],
  quotePolicy: CardFloor.make({ minCents: CARD_MIN_CENTS }),
  sessionKind: RedirectKind.make({}),
  isReady: presence =>
    presence.lemonCheckoutUrl ||
    (presence.lemonApiKey && presence.lemonStoreId && presence.lemonVariantId),
}
