import {
  type CasinoResources,
  makeProofVerifier,
  makeStripeOrigin,
  secretPresent,
  stripeEnvNames,
} from 'casino-core-example'
import { Layer } from 'effect'
import {
  makeWebWalletResources,
  walletDataSourceFromEnvironment,
} from 'wallet-web-client-example'

/** Browser Layers: Live vault, fail-closed Stripe probe, fail-closed proofs. */
export const casinoBrowserResources = (): Layer.Layer<CasinoResources> =>
  Layer.mergeAll(
    makeWebWalletResources(
      walletDataSourceFromEnvironment(
        import.meta.env['VITE_WALLET_DATA_SOURCE'],
      ),
    ),
    makeStripeOrigin({
      envSecretPresent:
        secretPresent(name => import.meta.env[name], stripeEnvNames) ||
        import.meta.env['VITE_STRIPE_SECRET_PRESENT'] === 'true',
      configFilePresent:
        import.meta.env['VITE_STRIPE_CONFIG_FILE_PRESENT'] === 'true',
    }),
    makeProofVerifier(),
  )
