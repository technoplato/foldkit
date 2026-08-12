import { Effect } from 'effect'

import type { InstantCounterDatabase } from '../../../instant.schema.js'
import {
  appendMultipleCountersV3PolicyRequest,
  makeMultipleCountersV3ProcessorConfig,
  MultipleCountersV3PolicyResolutionError,
  resolveMultipleCountersV3PolicyRequest,
  resolveMultipleCountersV3PolicyRequestSubscription,
} from '../client/instantTransport.js'
import type { MultipleCountersV3ProcessorConfig } from '../client/processor.js'
import type { MultipleCountersV3PolicyRequestRecord } from '../shared/policyRequest.js'
import {
  browserMultipleCountersV3LocalIdentityEnvironment,
  makeBrowserMultipleCountersV3LocalIdentityStore,
} from './localIdentity.js'

/** An authenticated policy-resolution observation failed or decoded invalid data. */
export const MultipleCountersV3BrowserPolicyResolutionError =
  MultipleCountersV3PolicyResolutionError

/** Waits on one scoped subscription for an exact policy-request outcome. */
export const resolveBrowserMultipleCountersV3PolicyRequestSubscription =
  resolveMultipleCountersV3PolicyRequestSubscription

/** Waits for the unique terminal authority outcome of one policy request. */
export const resolveBrowserMultipleCountersV3PolicyRequest =
  resolveMultipleCountersV3PolicyRequest

/** Creates one browser Processor config from IndexedDB-held keys and sequences. */
export const makeBrowserMultipleCountersV3ProcessorConfig = (
  input: Readonly<{
    database: InstantCounterDatabase
    identityDatabaseName?: string
    instantAppId: string
    sessionEpochSeed: string
    subjectId: string
  }>,
): Effect.Effect<MultipleCountersV3ProcessorConfig, unknown> =>
  makeMultipleCountersV3ProcessorConfig({
    database: input.database,
    environment: browserMultipleCountersV3LocalIdentityEnvironment(),
    instantAppId: input.instantAppId,
    sessionEpochSeed: input.sessionEpochSeed,
    store: makeBrowserMultipleCountersV3LocalIdentityStore(
      input.identityDatabaseName,
    ),
    subjectId: input.subjectId,
  })

/** Persists one immutable policy request through the authenticated browser DB. */
export const appendBrowserMultipleCountersV3PolicyRequest = (
  database: InstantCounterDatabase,
  request: MultipleCountersV3PolicyRequestRecord,
): Effect.Effect<void, unknown> =>
  appendMultipleCountersV3PolicyRequest(database, request)
