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
  EffectSupportRange,
  Failed,
  Ignored,
  MessageEnvelope,
  OriginClient,
  Placement,
  ProtocolRange,
  SystemActor,
  Waiting,
  selectProcessor,
  supportsEffectVersion,
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

describe('Processor protocol contracts', () => {
  it('advertises effect versions separately from capability versions', () => {
    const processor = Descriptor.make({
      ...phone,
      effectSupport: [
        EffectSupportRange.make({
          id: 'Audio.Speech.Transcribe',
          minimumVersion: 1,
          maximumVersion: 2,
        }),
      ],
    })

    expect(supportsEffectVersion(processor, 'Audio.Speech.Transcribe', 1)).toBe(
      true,
    )
    expect(supportsEffectVersion(processor, 'Audio.Speech.Transcribe', 3)).toBe(
      false,
    )
    expect(supportsEffectVersion(phone, 'Audio.Speech.Transcribe', 1)).toBe(
      false,
    )
  })

  it('accepts historical version-zero Programs and events in Message envelopes', () => {
    const envelope = MessageEnvelope.make({
      formatVersion: 1,
      occurrenceId: 'occurrence-0',
      programId: 'historical-program',
      programVersion: 0,
      eventId: 'HistoricalEvent',
      eventVersion: 0,
      actor: SystemActor.make({ processorId: 'processor-authority' }),
      originClientId: 'client-browser',
      originDeviceId: 'device-browser',
      ingressProcessorId: 'processor-browser',
      sessionId: 'session-1',
      originSequence: 1,
      acceptedSequence: Option.some(1),
      causationOccurrenceId: Option.none(),
      correlationId: Option.none(),
      createdAtMs: 1,
      acceptedAtMs: Option.some(1),
    })

    expect(
      Schema.decodeUnknownSync(MessageEnvelope)(
        Schema.encodeSync(MessageEnvelope)(envelope),
      ),
    ).toStrictEqual(envelope)
  })

  it('rejects inverted effect support ranges', () => {
    expect(() =>
      Schema.decodeUnknownSync(EffectSupportRange)({
        id: 'Audio.Speech.Transcribe',
        minimumVersion: 2,
        maximumVersion: 1,
      }),
    ).toThrow()
  })

  it('rejects inverted protocol ranges', () => {
    expect(() =>
      Schema.decodeUnknownSync(ProtocolRange)({
        minimumVersion: 2,
        maximumVersion: 1,
      }),
    ).toThrow()
  })

  it('rejects noncanonical or unbounded transport identities', () => {
    expect(
      Schema.decodeUnknownSync(Descriptor)({
        ...phone,
        processorId: `authority:instant-counter:v1:${'a'.repeat(64)}`,
      }).processorId,
    ).toBe(`authority:instant-counter:v1:${'a'.repeat(64)}`)
    expect(() =>
      Schema.decodeUnknownSync(Descriptor)({
        ...phone,
        processorId: 'processor.with.dots',
      }),
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Descriptor)({
        ...phone,
        processorId: 'processor::browser',
      }),
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(Descriptor)({
        ...phone,
        clientId: 'c'.repeat(129),
      }),
    ).toThrow()
  })
})
