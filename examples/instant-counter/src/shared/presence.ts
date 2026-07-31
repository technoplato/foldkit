import { Array } from 'effect'
import * as Processor from 'foldkit/processor'

import {
  InstantProcessorPresence,
  type InstantProcessorPresence as InstantProcessorPresenceType,
  type SharedProgramConnection,
} from '@foldkit/instant'

/** Whether a requested executor advertisement is backed by authenticated transport. */
export const isEffectExecutorAvailable = (
  connection: SharedProgramConnection,
  isRequestedAvailable: boolean,
): boolean =>
  isRequestedAvailable &&
  connection._tag === 'Attached' &&
  connection.transportStatus === 'authenticated'

/** Encodes a Processor Descriptor for transient Instant room presence. */
export const makeProcessorPresence = (
  descriptor: Processor.Descriptor,
  isEffectExecutorAvailable: boolean,
  latestAcceptedSequence: number,
): InstantProcessorPresenceType =>
  InstantProcessorPresence.make({
    clientId: descriptor.clientId,
    descriptor,
    isEffectExecutorAvailable,
    lastSeenAtMs: Date.now(),
    latestAcceptedSequence,
    processorId: descriptor.processorId,
    protocolMaximumVersion: descriptor.protocol.maximumVersion,
    protocolMinimumVersion: descriptor.protocol.minimumVersion,
  })

/** Decodes transient room presence into placement-ready Descriptors. */
export const decodeProcessorPresence = (
  presence: ReadonlyArray<InstantProcessorPresenceType>,
): ReadonlyArray<Processor.Descriptor> =>
  Array.map(
    Array.filter(
      presence,
      participant => participant.isEffectExecutorAvailable,
    ),
    participant => participant.descriptor,
  )
