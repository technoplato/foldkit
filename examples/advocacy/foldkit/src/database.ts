import { type AdvocacyInstantDatabase, schema } from 'advocacy-core-example'

import { init } from '@instantdb/core'

const appId = import.meta.env.VITE_INSTANT_APP_ID

/** Public Instant app id, absent when the host is running from seed data. */
export const advocacyInstantAppId =
  typeof appId === 'string' && appId.length > 0 ? appId : undefined

let cached: AdvocacyInstantDatabase | undefined

/** Instant client for Advocacy hosts, or undefined when no app id is configured. */
export const advocacyDatabase = (): AdvocacyInstantDatabase | undefined => {
  if (advocacyInstantAppId === undefined) {
    return undefined
  }
  if (cached === undefined) {
    cached = init({ appId: advocacyInstantAppId, schema })
  }
  return cached
}
