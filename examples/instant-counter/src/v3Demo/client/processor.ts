import {
  type Model,
  MultipleCountersMessageAdmission,
} from 'counters-core-example'
import { Effect, Scope } from 'effect'

import {
  type InstantV3ProgramDatabase,
  type V3ProgramStoreScope,
  type V3SharedProgramIdentitySources,
  type V3SharedProgramProcessor,
  makeV3InstantProgramStore,
  makeV3SharedProgramProcessor,
} from '@foldkit/instant'

import { makeMultipleCountersV3ProgramScope } from '../headless/enrollmentMaterializer.js'
import { MultipleCountersV3MessageProtocol } from '../headless/messageProtocol.js'
import {
  type MultipleCountersV3OriginSecrets,
  type MultipleCountersV3ProcessorSecret,
  prepareMultipleCountersV3Origin,
} from './originLifecycle.js'

/** Inputs required to allocate one authenticated optimistic Multiple Counters Processor. */
export type MultipleCountersV3ProcessorConfig = Readonly<{
  claimedAtMs: number
  database: InstantV3ProgramDatabase
  identities: V3SharedProgramIdentitySources
  instantAppId: string
  processor: MultipleCountersV3ProcessorSecret
  secrets: MultipleCountersV3OriginSecrets
  sessionEpochSeed: string
  subjectId: string
}>

/** One scoped optimistic Processor plus the non-secret scope it consumes. */
export type MultipleCountersV3Processor = Readonly<{
  identity: Readonly<{
    clientId: string
    originDeviceId: string
    processorId: string
  }>
  processor: V3SharedProgramProcessor<
    Model,
    import('counters-core-example').MultipleCountersAdmissionClaim
  >
  scope: V3ProgramStoreScope
}>

/** Allocates the v3 store, enrolls this Device, and starts from canonical Program init. */
export const makeMultipleCountersV3Processor = (
  config: MultipleCountersV3ProcessorConfig,
): Effect.Effect<MultipleCountersV3Processor, unknown, Scope.Scope> =>
  Effect.gen(function* () {
    const store = yield* makeV3InstantProgramStore(config.database)
    const origin = yield* prepareMultipleCountersV3Origin({
      claimedAtMs: config.claimedAtMs,
      instantAppId: config.instantAppId,
      processor: config.processor,
      secrets: config.secrets,
      sessionEpochSeed: config.sessionEpochSeed,
      subjectId: config.subjectId,
    })
    yield* store.appendOriginEnrollmentClaim(origin.enrollmentClaim)
    const scope = makeMultipleCountersV3ProgramScope({
      instantAppId: config.instantAppId,
      sessionEpochSeed: config.sessionEpochSeed,
      subjectId: config.subjectId,
    })
    const processor = yield* makeV3SharedProgramProcessor({
      admission: MultipleCountersMessageAdmission,
      identities: config.identities,
      messageProtocol: MultipleCountersV3MessageProtocol,
      origin: origin.origin,
      scope,
      store,
    })
    return {
      identity: {
        clientId: origin.identity.clientId,
        originDeviceId: origin.identity.originDeviceId,
        processorId: origin.origin.originatingProcessorId,
      },
      processor,
      scope,
    }
  })
