import { Context, Effect, Layer, Schema as S, String as Str } from 'effect'
import { ts } from 'foldkit/schema'
import type { WalletResources } from 'wallet-core-example'

/** Stripe probe found no charge secret. */
export const StripeProbeUnconfigured = ts('Unconfigured')
/** Stripe probe found a secret. This is not a live charge. */
export const StripeProbeConfigured = ts('Configured')
/** Result of probing for a Stripe charge secret without reading its value. */
export const StripeProbe = S.Union([
  StripeProbeUnconfigured,
  StripeProbeConfigured,
])
/** Result of probing for a Stripe charge secret. */
export type StripeProbe = typeof StripeProbe.Type

/** Presence flags only. Never carry the secret itself. */
export type StripePresence = Readonly<{
  envSecretPresent: boolean
  configFilePresent: boolean
}>

/** Env names that would hold a Stripe secret. Values are never logged. */
export const stripeEnvNames: ReadonlyArray<string> = [
  'STRIPE_SECRET_KEY',
  'STRIPE_API_KEY',
  'STRIPE_KEY',
  'STRIPE_SECRET',
  'STRIPE_RESTRICTED_KEY',
  'STRIPE_TEST_SECRET_KEY',
  'STRIPE_LIVE_SECRET_KEY',
  'VITE_STRIPE_SECRET_KEY',
  'VITE_STRIPE_API_KEY',
]

/** Well-known Stripe config paths under a home directory. Never read. */
export const stripeConfigRelpaths: ReadonlyArray<string> = [
  '.config/stripe',
  '.config/stripe/config.toml',
  '.config/stripe/secret',
  '.stripe',
  '.stripe/config.toml',
]

/** Env names that would hold a proof-verifier secret. Values are never logged. */
export const proofEnvNames: ReadonlyArray<string> = [
  'WORLDCOIN_API_KEY',
  'WORLD_ID_API_KEY',
  'WORLDCOIN_APP_SECRET',
  'WLD_API_KEY',
  'ZK_PASSPORT_API_KEY',
  'ZKPASSPORT_API_KEY',
  'HUMANITY_API_KEY',
  'PRIVY_APP_SECRET',
  'RECLAIM_API_KEY',
  'SISMO_API_KEY',
]

const readHasNonEmpty = (
  read: (name: string) => unknown,
  names: ReadonlyArray<string>,
): boolean => {
  for (const name of names) {
    const value = read(name)
    if (typeof value === 'string' && !Str.isEmpty(Str.trim(value))) {
      return true
    }
  }
  return false
}

/** Reports whether any named secret env var is non-empty. Never returns the value. */
export const secretPresent = (
  read: (name: string) => unknown,
  names: ReadonlyArray<string>,
): boolean => readHasNonEmpty(read, names)

/** Reports whether any named Stripe secret env var is non-empty. Never returns the value. */
export const stripeSecretPresentInEnv = (env: {
  readonly [key: string]: unknown
}): boolean => secretPresent(name => env[name], stripeEnvNames)

/** Reports whether any named proof-verifier secret env var is non-empty. Never returns the value. */
export const proofSecretPresentInEnv = (env: {
  readonly [key: string]: unknown
}): boolean => secretPresent(name => env[name], proofEnvNames)

/** True when any well-known Stripe config path exists. Never reads the path. */
export const stripeConfigFilePresent = (
  absolutePaths: ReadonlyArray<string>,
  pathExists: (absolutePath: string) => boolean,
): boolean => {
  for (const absolutePath of absolutePaths) {
    if (pathExists(absolutePath)) {
      return true
    }
  }
  return false
}

/** Maps presence flags onto a Stripe probe result. Never inspects secret bytes. */
export const stripeProbeFromPresence = (
  presence: StripePresence,
): StripeProbe => {
  if (presence.envSecretPresent || presence.configFilePresent) {
    return StripeProbeConfigured()
  }
  return StripeProbeUnconfigured()
}

/** Injected Stripe origin check. Hosts must not put the secret in Model. */
export type StripeOriginCheckService = Readonly<{
  probe: Effect.Effect<StripeProbe>
}>

/** Injected Stripe origin check. */
export class StripeOriginCheck extends Context.Service<
  StripeOriginCheck,
  StripeOriginCheckService
>()('Casino/StripeOriginCheck') {}

/** Host Layer that probes presence flags only. */
export const makeStripeOrigin = (
  presence: StripePresence,
): Layer.Layer<StripeOriginCheck> =>
  Layer.succeed(StripeOriginCheck, {
    probe: Effect.sync(() => stripeProbeFromPresence(presence)),
  })

/** Proof kinds the table can offer. */
export const ProofKind = S.Literals([
  'ZkIdentity',
  'Humanity',
  'FundCyclingAgent',
])
/** Proof kinds the table can offer. */
export type ProofKind = typeof ProofKind.Type

/** No live verifier completed. */
export const ProofNotConnected = ts('NotConnected')
/** A live verifier succeeded. Do not construct from a stub. */
export const ProofVerified = ts('Verified')
/** Result of probing one proof origin. */
export const ProofProbe = S.Union([ProofNotConnected, ProofVerified])
/** Result of probing one proof origin. */
export type ProofProbe = typeof ProofProbe.Type

/** Injected proof verifiers. Success is only a live verifier completion. */
export type ProofVerifierService = Readonly<{
  probe: (kind: ProofKind) => Effect.Effect<ProofProbe>
}>

/** Injected proof verifiers. */
export class ProofVerifier extends Context.Service<
  ProofVerifier,
  ProofVerifierService
>()('Casino/ProofVerifier') {}

/**
 * Fail-closed proof Layer. Returns NotConnected for every kind.
 * Do not replace this with a stub that returns Verified.
 */
export const makeProofVerifier = (): Layer.Layer<ProofVerifier> =>
  Layer.succeed(ProofVerifier, {
    probe: (_kind: ProofKind) => Effect.succeed(ProofNotConnected()),
  })

/** Every Effect service required by the Casino Program. */
export type CasinoResources =
  | WalletResources
  | StripeOriginCheck
  | ProofVerifier
