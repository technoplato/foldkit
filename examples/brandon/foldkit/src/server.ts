import {
  BrandonServer,
  Games,
  Page,
  type SectionKey,
  WalletAddresses,
} from 'brandon-core-example'
import { Effect, Layer, Schema as S } from 'effect'
import { WalletVaultError } from 'wallet-core-example'
import {
  type WalletVaultOwnerKey,
  makeWalletVaultOwnerPartitionKey,
} from 'wallet-local-vault-example'

// SERVER

const notAllowed = 'You are not signed in for this page.'
const unanswered = 'The page did not answer in time.'
const answerWithin = '5 seconds'

const readJson = <A>(
  path: string,
  decode: (value: unknown) => A,
): Effect.Effect<A, string> =>
  Effect.tryPromise({
    try: async signal => {
      const response = await fetch(path, { cache: 'no-store', signal })
      if (!response.ok) {
        throw new Error(notAllowed)
      }
      return decode(await response.json())
    },
    catch: cause => (cause instanceof Error ? cause.message : String(cause)),
  }).pipe(
    Effect.timeoutOrElse({
      duration: answerWithin,
      orElse: () => Effect.fail(unanswered),
    }),
  )

const OwnerAnswer = S.Struct({ ownerKey: S.String })

/**
 * Asks the origin whose wallet this page may open. It answers only a
 * signed-in person with the wallet flag, and only with their own owner
 * key, so the page opens no one else's partition.
 */
export const loadWalletOwnerKey: Effect.Effect<
  WalletVaultOwnerKey,
  WalletVaultError
> = readJson('/api/wallet/owner', S.decodeUnknownSync(OwnerAnswer)).pipe(
  Effect.flatMap(({ ownerKey }) =>
    Effect.try(() => makeWalletVaultOwnerPartitionKey(ownerKey)),
  ),
  Effect.mapError(() => new WalletVaultError({ code: 'Unavailable' })),
)

const scrollToSection = (sectionKey: SectionKey): Effect.Effect<void> =>
  Effect.sync(() => {
    document
      .getElementById(sectionKey)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

/** Brandon dot's origin, same-origin, through Cloudflare Access. */
export const liveBrandonServer: Layer.Layer<BrandonServer> = Layer.succeed(
  BrandonServer,
  {
    loadPage: readJson('/api/page', S.decodeUnknownSync(Page)),
    loadFootball: readJson('/api/football', S.decodeUnknownSync(Games)),
    loadWallets: readJson('/api/wallets', S.decodeUnknownSync(WalletAddresses)),
    scrollToSection,
    reloadPage: Effect.sync(() => {
      window.location.reload()
    }),
    nowMs: Effect.sync(() => Date.now()),
  },
)
