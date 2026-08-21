import { type IdeasInstantDatabase, schema } from 'ideas-core-example'

import { init } from '@instantdb/core'

const appId = import.meta.env.VITE_INSTANT_APP_ID

/** Public Instant app id, absent when the host is running from seed data. */
export const ideasInstantAppId =
  typeof appId === 'string' && appId.length > 0 ? appId : undefined

let cached: IdeasInstantDatabase | undefined

/** Instant client for Ideas hosts, or undefined when no app id is configured. */
export const ideasDatabase = (): IdeasInstantDatabase | undefined => {
  if (ideasInstantAppId === undefined) {
    return undefined
  }
  if (cached === undefined) {
    cached = init({ appId: ideasInstantAppId, schema })
  }
  return cached
}
