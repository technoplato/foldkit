import { type OrbitInstantDatabase, schema } from 'orbit-core-example'

import { init } from '@instantdb/core'

const appId = import.meta.env.VITE_INSTANT_APP_ID

/** Public Instant app id, absent when the host is running from seed data. */
export const orbitInstantAppId =
  typeof appId === 'string' && appId.length > 0 ? appId : undefined

let cached: OrbitInstantDatabase | undefined

/** Instant client for Orbit hosts, or undefined when no app id is configured. */
export const orbitDatabase = (): OrbitInstantDatabase | undefined => {
  if (orbitInstantAppId === undefined) {
    return undefined
  }
  if (cached === undefined) {
    cached = init({ appId: orbitInstantAppId, schema })
  }
  return cached
}
