import {
  BrandonServer,
  Games,
  Page,
  type SectionKey,
  WalletAddresses,
} from 'brandon-core-example'
import { Effect, Layer, Schema as S } from 'effect'

// SERVER

const notAllowed = 'You are not signed in for this page.'

const readJson = <A>(
  path: string,
  decode: (value: unknown) => A,
): Effect.Effect<A, string> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(path, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(notAllowed)
      }
      return decode(await response.json())
    },
    catch: cause => (cause instanceof Error ? cause.message : String(cause)),
  })

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
