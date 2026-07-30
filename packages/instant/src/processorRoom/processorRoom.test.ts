import { Processor } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { InstantProcessorPresence } from '../schema/index.js'
import { decodeProcessorRoomParticipants } from './processorRoom.js'

const validPresence = InstantProcessorPresence.make({
  clientId: 'client-phone',
  descriptor: Processor.Descriptor.make({
    capabilities: [],
    clientId: 'client-phone',
    effectSupport: [],
    processorId: 'processor-phone',
    protocol: Processor.ProtocolRange.make({
      maximumVersion: 1,
      minimumVersion: 1,
    }),
  }),
  isEffectExecutorAvailable: true,
  lastSeenAtMs: 1_753_825_500_000,
  latestAcceptedSequence: 12,
  processorId: 'processor-phone',
  protocolMaximumVersion: 1,
  protocolMinimumVersion: 1,
})

describe('Processor room presence', () => {
  it('keeps valid peers when another peer is malformed', () => {
    expect(
      decodeProcessorRoomParticipants([
        validPresence,
        {
          clientId: 'malformed-client',
          descriptor: 'not-a-Descriptor',
        },
      ]),
    ).toStrictEqual([validPresence])
  })
})
