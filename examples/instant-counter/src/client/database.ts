import { init } from '@instantdb/core'

import schema, { type InstantCounterDatabase } from '../../instant.schema.js'

/** Initializes the browser Instant client with its complete typed schema. */
export const makeBrowserDatabase = (): InstantCounterDatabase => {
  const appId = import.meta.env['VITE_INSTANT_APP_ID']
  if (appId === undefined || appId.length === 0) {
    throw new Error(
      'VITE_INSTANT_APP_ID is required. Run through the foldkit-instant-demo credential wrapper.',
    )
  }
  return init({ appId, schema })
}
