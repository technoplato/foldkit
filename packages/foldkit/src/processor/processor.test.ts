import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  AnyProcessor,
  AssignedFallback,
  AssignedPreferred,
  Capability,
  CapabilityId,
  CapabilityRequirement,
  Descriptor,
  Failed,
  Ignored,
  OriginClient,
  Placement,
  Waiting,
  selectProcessor,
} from './processor.js'

const CameraCapture = CapabilityId.make(['Camera', 'Capture'])

const makeProcessor = (
  processorId: string,
  clientId: string,
  capabilityVersion: number,
) =>
  Descriptor.make({
    processorId,
    clientId,
    protocol: {
      minimumVersion: 1,
      maximumVersion: 1,
    },
    capabilities: [
      Capability.make({
        id: CameraCapture,
        version: capabilityVersion,
      }),
    ],
  })

const phone = makeProcessor('processor-phone', 'client-phone', 2)
const browser = makeProcessor('processor-browser', 'client-browser', 1)

const placement = (
  affinity: typeof OriginClient.Type | typeof AnyProcessor.Type,
  unavailable: 'Wait' | 'UseAnyCapable' | 'Fail' | 'Ignore',
) =>
  Placement.make({
    version: 1,
    cardinality: 'One',
    capability: CapabilityRequirement.make({
      id: CameraCapture,
      minimumVersion: 2,
    }),
    affinity,
    unavailable,
  })

const baseContext = {
  processors: [phone, browser],
  maybeOriginClientId: Option.some('client-phone'),
  maybeIngressProcessorId: Option.none<string>(),
  previousAssignments: new Map<string, string>(),
}

describe('selectProcessor', () => {
  it('selects the preferred Processor only when its capability version is sufficient', () => {
    expect(
      selectProcessor(placement(OriginClient.make({}), 'Wait'), baseContext),
    ).toStrictEqual(AssignedPreferred.make({ processorId: 'processor-phone' }))
  })

  it('uses a deterministic capable fallback independent of presence order', () => {
    const capableAlpha = makeProcessor('processor-alpha', 'client-alpha', 2)
    const capableZulu = makeProcessor('processor-zulu', 'client-zulu', 2)
    const context = {
      ...baseContext,
      processors: [capableZulu, capableAlpha],
      maybeOriginClientId: Option.some('missing-client'),
    }

    expect(
      selectProcessor(
        placement(OriginClient.make({}), 'UseAnyCapable'),
        context,
      ),
    ).toStrictEqual(AssignedFallback.make({ processorId: 'processor-alpha' }))
  })

  it('models wait, failure, and ignore as distinct unavailable states', () => {
    const context = {
      ...baseContext,
      processors: [browser],
      maybeOriginClientId: Option.some('client-browser'),
    }
    const affinity = OriginClient.make({})

    expect(selectProcessor(placement(affinity, 'Wait'), context)).toStrictEqual(
      Waiting.make({ reason: 'NoCapableProcessor' }),
    )
    expect(selectProcessor(placement(affinity, 'Fail'), context)).toStrictEqual(
      Failed.make({ reason: 'NoCapableProcessor' }),
    )
    expect(
      selectProcessor(placement(affinity, 'Ignore'), context),
    ).toStrictEqual(Ignored.make({ reason: 'NoCapableProcessor' }))
  })

  it('rejects unsupported placement and capability versions at the Schema boundary', () => {
    expect(() =>
      Schema.decodeUnknownSync(Placement)({
        version: 1,
        cardinality: 'One',
        capability: {
          id: ['Camera', 'Capture'],
          minimumVersion: 0,
        },
        affinity: { _tag: 'Any' },
        unavailable: 'Wait',
      }),
    ).toThrow()
  })
})
