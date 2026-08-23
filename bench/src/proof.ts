import { Effect } from 'effect'

import { BenchError } from './error.js'

/** Public Counter proof host. Painted page is the pass. Not GitHub. */
export const PROOF_HOST = 'https://counter.knophy.com'

/** Mirror host for sameScreenMirrored. Not a second proof. */
export const MIRROR_HOST = 'https://counter-mobile.knophy.com'

/** Loopback diagnostic only. Never the proof. */
export const LOOPBACK_HOST = 'http://127.0.0.1:5210/'

const accessMarkers: ReadonlyArray<string> = [
  'Cloudflare Access',
  'cloudflareaccess.com',
  'cf-access-authenticated-user-email',
]

export type OriginProbe = Readonly<{
  ok: boolean
  status: number
  detail: string
}>

const includesAccessMarker = (text: string): boolean => {
  for (const marker of accessMarkers) {
    if (text.includes(marker)) {
      return true
    }
  }
  return false
}

/** GET one origin. Proof must be HTTP 200 with no Access interstitial. */
export const probeOrigin = (
  url: string,
): Effect.Effect<OriginProbe, BenchError> =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { redirect: 'manual' })
      const status = response.status
      const location = response.headers.get('location') ?? ''
      const wwwAuthenticate = response.headers.get('www-authenticate') ?? ''
      const cfAccess = response.headers.get(
        'cf-access-authenticated-user-email',
      )
      if (status !== 200) {
        return {
          ok: false,
          status,
          detail: `HTTP ${status} from ${url}`,
        }
      }
      const accessHeader = `${location} ${wwwAuthenticate}`
      if (cfAccess !== null || includesAccessMarker(accessHeader)) {
        return {
          ok: false,
          status,
          detail: `Access marker on ${url}`,
        }
      }
      const body = await response.text()
      if (includesAccessMarker(body)) {
        return {
          ok: false,
          status,
          detail: `Access interstitial on ${url}`,
        }
      }
      return {
        ok: true,
        status,
        detail: `HTTP ${status} ${url}`,
      }
    },
    catch: cause =>
      new BenchError({
        detail: `probe ${url} failed: ${String(cause)}`,
      }),
  })
