import { init } from '@instantdb/core'

import schema, { type BooksInstantDatabase } from '../instant.schema.js'

const appId = import.meta.env.VITE_INSTANT_APP_ID

/** Public Instant app id, absent when the host is running from seed data. */
export const booksInstantAppId =
  typeof appId === 'string' && appId.length > 0 ? appId : undefined

let cached: BooksInstantDatabase | undefined

/** Instant client for the books host, or undefined when no app id is configured. */
export const booksDatabase = (): BooksInstantDatabase | undefined => {
  if (booksInstantAppId === undefined) {
    return undefined
  }
  if (cached === undefined) {
    cached = init({ appId: booksInstantAppId, schema })
  }
  return cached
}
