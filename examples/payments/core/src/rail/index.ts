import { Array, Option } from 'effect'

import * as ApplePay from './applePay.js'
import * as CoinbaseOnramp from './coinbaseOnramp.js'
import * as Lemon from './lemon.js'
import * as Paypal from './paypal.js'
import * as Polar from './polar.js'
import {
  CARD_MIN_CENTS,
  type CredentialPresence,
  ONRAMP_MIN_CENTS,
  type RailId,
  type RailModule,
  type WalletLink,
} from './spec.js'
import * as StripeCheckout from './stripeCheckout.js'
import * as StripeEmbed from './stripeEmbed.js'
import * as StripeX402 from './stripeX402.js'
import * as X402 from './x402.js'

export * from './spec.js'

/** Every merchant rail module. */
export const RAILS: ReadonlyArray<RailModule> = [
  X402.module,
  StripeCheckout.module,
  Polar.module,
  Lemon.module,
  Paypal.module,
  CoinbaseOnramp.module,
  StripeX402.module,
  StripeEmbed.module,
  ApplePay.module,
]

/** Looks up one rail module by id. */
export const railById = (id: RailId): Option.Option<RailModule> =>
  Array.findFirst(RAILS, rail => rail.id === id)

/** Looks up one rail module or throws if the catalog is incomplete. */
export const requireRail = (id: RailId): RailModule => {
  const maybeRail = railById(id)
  if (Option.isSome(maybeRail)) {
    return maybeRail.value
  }
  throw new Error(`Unknown rail ${id}`)
}

/** Whether the selected rail can start a session. */
export const isRailReady = (
  id: RailId,
  presence: CredentialPresence,
  wallet: WalletLink,
): boolean => requireRail(id).isReady(presence, wallet)

/** Converts an x402 atomic USDC amount into USD cents. */
export const centsFromAtomic = (amountAtomic: bigint): number => {
  const cents = Number(amountAtomic / 10_000n)
  if (cents < 1) {
    return 1
  }
  return cents
}

/** Applies the rail quote policy to an exact 402 atomic amount. */
export const chargeCentsFor = (id: RailId, amountAtomic: bigint): number => {
  const rail = requireRail(id)
  const exact = centsFromAtomic(amountAtomic)
  if (rail.quotePolicy._tag === 'Exact402') {
    return exact
  }
  if (rail.quotePolicy._tag === 'OnrampFloor') {
    return Math.max(ONRAMP_MIN_CENTS, exact)
  }
  return Math.max(CARD_MIN_CENTS, exact)
}
