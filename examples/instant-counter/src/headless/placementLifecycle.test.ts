import { Option } from 'effect'
import { Processor } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { commandForEffect } from '../domain/effect.js'
import { RequestedEffect } from '../domain/message.js'
import { replanEffectPlacement } from './placementLifecycle.js'

const cameraDescriptor = (
  clientId: string,
  processorId: string,
): Processor.Descriptor =>
  Processor.Descriptor.make({
    capabilities: [
      Processor.Capability.make({
        id: Processor.CapabilityId.make(['Device', 'Camera', 'Capture']),
        version: 1,
      }),
    ],
    clientId,
    effectSupport: [
      Processor.EffectSupportRange.make({
        id: 'Foldkit.Example.InstantCounter.CameraCapture',
        maximumVersion: 1,
        minimumVersion: 1,
      }),
    ],
    processorId,
    protocol: Processor.ProtocolRange.make({
      maximumVersion: 1,
      minimumVersion: 1,
    }),
  })

const cameraManifest = () => {
  const command = commandForEffect(
    RequestedEffect({
      durationMs: Option.none(),
      kind: 'CameraCapture',
      requestId: 'camera-1',
    }),
  )
  const maybeManifest = Option.fromNullishOr(command.effectManifest)
  if (Option.isNone(maybeManifest)) {
    throw new Error('Expected a portable camera effect manifest.')
  }
  return maybeManifest.value
}

describe('effect placement lifecycle', () => {
  it('moves Waiting to one sticky assignment when a capable Processor joins', () => {
    const manifest = cameraManifest()
    const phone = cameraDescriptor('client-phone', 'processor-phone')
    const initial = replanEffectPlacement({
      ingressProcessorId: 'processor-authority',
      manifest,
      maybeCurrent: Option.none(),
      originClientId: 'client-browser',
      previousAssignments: new Map(),
      processors: [],
    })
    expect(initial).toStrictEqual(
      Option.some({
        assignmentGeneration: 1,
        cancellationGeneration: 0,
        decision: {
          _tag: 'Waiting',
          reason: 'NoCapableProcessor',
        },
      }),
    )
    if (Option.isNone(initial)) {
      throw new Error('Expected an initial placement.')
    }

    const afterJoin = replanEffectPlacement({
      ingressProcessorId: 'processor-authority',
      manifest,
      maybeCurrent: Option.some(initial.value),
      originClientId: 'client-browser',
      previousAssignments: new Map(),
      processors: [phone],
    })
    expect(afterJoin).toStrictEqual(
      Option.some({
        assignmentGeneration: 2,
        cancellationGeneration: 0,
        decision: {
          _tag: 'AssignedFallback',
          processorId: 'processor-phone',
        },
      }),
    )
    if (Option.isNone(afterJoin)) {
      throw new Error('Expected a placement after join.')
    }

    const afterLeave = replanEffectPlacement({
      ingressProcessorId: 'processor-authority',
      manifest,
      maybeCurrent: Option.some(afterJoin.value),
      originClientId: 'client-browser',
      previousAssignments: new Map([['camera-1', 'processor-phone']]),
      processors: [],
    })
    expect(afterLeave).toStrictEqual(Option.none())
  })

  it('does not reassign after the selected Processor disappears', () => {
    const phone = cameraDescriptor('client-phone', 'processor-phone')
    const alternate = cameraDescriptor(
      'client-alternate',
      'processor-alternate',
    )

    expect(
      replanEffectPlacement({
        ingressProcessorId: 'processor-authority',
        manifest: cameraManifest(),
        maybeCurrent: Option.some({
          assignmentGeneration: 2,
          cancellationGeneration: 0,
          decision: Processor.AssignedFallback.make({
            processorId: 'processor-phone',
          }),
        }),
        originClientId: 'client-browser',
        previousAssignments: new Map([['camera-1', 'processor-phone']]),
        processors: [alternate],
      }),
    ).toStrictEqual(Option.none())
    expect(phone.processorId).not.toBe(alternate.processorId)
  })
})
