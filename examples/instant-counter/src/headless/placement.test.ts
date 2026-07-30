import { Option } from 'effect'
import { Processor } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { InstantProgramSessionRecord } from '@foldkit/instant'

import { effectIdForKind } from '../domain/effect.js'
import { RequestedEffect } from '../domain/message.js'
import { headlessProcessorDescriptor } from './capabilities.js'
import { planEffectPlacement } from './placement.js'

const session = InstantProgramSessionRecord.make({
  authorityProcessorId: 'processor-authority',
  createdAtMs: 1,
  id: 'session-1',
  isRevoked: false,
  processorRoomId: 'room-4ec724f1c3584d679b8a3b88f470e372',
  programId: 'instant-counter',
  programVersion: 1,
  sessionId: 'session-1',
  subjectId: 'subject-1',
})

const origin = {
  causalOccurrenceId: 'occurrence-1',
  ingressProcessorId: 'processor-authority',
  originClientId: 'client-browser',
  originatingProcessorId: 'processor-browser',
}

describe('effect placement planning', () => {
  it('selects the headless Processor for a background timer and emits an assignment fact', () => {
    const processor = headlessProcessorDescriptor(
      'client-headless',
      'processor-headless',
    )
    const plan = planEffectPlacement(
      session,
      RequestedEffect({
        durationMs: Option.some(250),
        kind: 'BackgroundTimer',
        requestId: 'timer-1',
      }),
      origin,
      [processor],
      10,
    )

    expect(plan.fact).toStrictEqual({
      _tag: 'AssignedEffect',
      kind: 'BackgroundTimer',
      processorId: 'processor-headless',
      requestId: 'timer-1',
    })
    expect(plan.request).toMatchObject({
      causalOccurrenceId: 'occurrence-1',
      idempotencyKey: 'session-1:timer-1',
      originatingProcessorId: 'processor-browser',
      requestId: 'timer-1',
    })
    expect(plan.placement).toMatchObject({
      assignedProcessorId: 'processor-headless',
      assignmentGeneration: 1,
      cancellationGeneration: 0,
      placementStatus: 'AssignedFallback',
      requestId: 'timer-1',
    })
  })

  it('prefers a capable Processor from the originating Client', () => {
    const headless = headlessProcessorDescriptor(
      'client-headless',
      'processor-headless',
    )
    const originProcessor = Processor.Descriptor.make({
      capabilities: [
        Processor.Capability.make({
          id: Processor.CapabilityId.make(['Device', 'Timer', 'Schedule']),
          version: 1,
        }),
      ],
      clientId: origin.originClientId,
      effectSupport: [
        Processor.EffectSupportRange.make({
          id: effectIdForKind('DeviceTimer'),
          maximumVersion: 1,
          minimumVersion: 1,
        }),
      ],
      processorId: 'processor-origin',
      protocol: Processor.ProtocolRange.make({
        maximumVersion: 1,
        minimumVersion: 1,
      }),
    })
    const plan = planEffectPlacement(
      session,
      RequestedEffect({
        durationMs: Option.some(250),
        kind: 'DeviceTimer',
        requestId: 'timer-2',
      }),
      origin,
      [headless, originProcessor],
      10,
    )

    expect(plan.placement).toMatchObject({
      assignedProcessorId: 'processor-origin',
      placementStatus: 'AssignedPreferred',
    })
  })

  it('keeps a camera request waiting when no live Processor supports it', () => {
    const plan = planEffectPlacement(
      session,
      RequestedEffect({
        durationMs: Option.none(),
        kind: 'CameraCapture',
        requestId: 'camera-1',
      }),
      origin,
      [headlessProcessorDescriptor('client-headless', 'processor-headless')],
      10,
    )

    expect(plan.fact).toStrictEqual({
      _tag: 'WaitedForEffectProcessor',
      kind: 'CameraCapture',
      requestId: 'camera-1',
    })
    expect(plan.placement).toMatchObject({
      assignedProcessorId: null,
      placementStatus: 'Waiting',
    })
  })
})
