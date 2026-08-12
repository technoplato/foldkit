import { Data, Effect } from 'effect'
import { init } from '@instantdb/core'

import schema, { type InstantCounterDatabase } from '../../../instant.schema.js'
import { makeMultipleCountersV3FileStoreClass } from './fileStore.js'

/** Required public Instant configuration is absent without retaining its value. */
export class MultipleCountersV3NodeConfigurationError extends Data.TaggedError(
  'MultipleCountersV3NodeConfigurationError',
)<Readonly<{ variable: 'INSTANT_APP_ID' }>> {}

/** Always-online Instant network listener for Node Clients. */
export class MultipleCountersV3NodeNetworkListener {
  static getIsOnline(): Promise<boolean> {
    return Promise.resolve(true)
  }

  static listen(onChange: (isOnline: boolean) => void): () => void {
    onChange(true)
    return () => undefined
  }
}

/** Reads the public Instant app id from the process environment. */
export const requireMultipleCountersV3InstantAppId = (
  environment: NodeJS.ProcessEnv = process.env,
): Effect.Effect<string, MultipleCountersV3NodeConfigurationError> => {
  const appId = environment['INSTANT_APP_ID']
  if (appId === undefined || appId.length === 0) {
    return Effect.fail(
      new MultipleCountersV3NodeConfigurationError({
        variable: 'INSTANT_APP_ID',
      }),
    )
  }
  return Effect.succeed(appId)
}

/** Initializes Instant core with a file-backed store for one Node Client. */
export const makeNodeMultipleCountersV3Database = (
  appId: string,
  stateDirectory: string,
): InstantCounterDatabase =>
  init(
    { appId, schema },
    makeMultipleCountersV3FileStoreClass(stateDirectory),
    MultipleCountersV3NodeNetworkListener,
  )
