import { type TranscribeInstantDatabase, schema } from 'transcribe-core-example'

import { init } from '@instantdb/core'

const appId = import.meta.env.VITE_INSTANT_APP_ID

/** Public Instant app id, absent when the host is running from seed data. */
export const transcribeInstantAppId =
  typeof appId === 'string' && appId.length > 0 ? appId : undefined

let cached: TranscribeInstantDatabase | undefined

/** Instant client for Transcribe hosts, or undefined when no app id is configured. */
export const transcribeDatabase = (): TranscribeInstantDatabase | undefined => {
  if (transcribeInstantAppId === undefined) {
    return undefined
  }
  if (cached === undefined) {
    cached = init({ appId: transcribeInstantAppId, schema })
  }
  return cached
}
