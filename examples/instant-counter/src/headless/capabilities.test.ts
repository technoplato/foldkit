import { Array, Option } from 'effect'
import { Processor } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { AdmissionSequencerCapability } from '@foldkit/instant'

import { commandForEffect } from '../domain/effect.js'
import {
  RequestedEffect,
  type RequestedEffect as RequestedEffectType,
} from '../domain/message.js'
import { headlessProcessorDescriptor } from './capabilities.js'

const placementFor = (request: RequestedEffectType): Processor.Placement => {
  const maybeManifest = Option.fromNullishOr(
    commandForEffect(request).effectManifest,
  )
  if (Option.isNone(maybeManifest)) {
    throw new Error('Expected the portable effect manifest.')
  }
  return maybeManifest.value.placement
}

describe('headless Processor capabilities', () => {
  it('advertises admission sequencing and timers without claiming device, camera, or audio capabilities', () => {
    const descriptor = headlessProcessorDescriptor(
      'headless-client',
      'headless-processor',
    )
    const timer = RequestedEffect({
      durationMs: Option.some(100),
      kind: 'BackgroundTimer',
      requestId: 'timer-1',
    })
    const camera = RequestedEffect({
      durationMs: Option.none(),
      kind: 'CameraCapture',
      requestId: 'camera-1',
    })

    const timerDecision = Processor.selectProcessor(placementFor(timer), {
      maybeIngressProcessorId: Option.none(),
      maybeOriginClientId: Option.none(),
      previousAssignments: new Map(),
      processors: [descriptor],
    })
    expect(timerDecision).toStrictEqual({
      _tag: 'AssignedFallback',
      processorId: descriptor.processorId,
    })
    expect(
      Processor.selectProcessor(placementFor(camera), {
        maybeIngressProcessorId: Option.none(),
        maybeOriginClientId: Option.none(),
        previousAssignments: new Map(),
        processors: [descriptor],
      }),
    ).toStrictEqual({
      _tag: 'Waiting',
      reason: 'NoCapableProcessor',
    })
    expect(
      Array.some(descriptor.capabilities, capability =>
        Array.contains(capability.id, 'Audio'),
      ),
    ).toBe(false)
    expect(
      Array.contains(descriptor.capabilities, AdmissionSequencerCapability),
    ).toBe(true)
    expect(
      Array.some(descriptor.capabilities, capability =>
        Array.contains(capability.id, 'Device'),
      ),
    ).toBe(false)
  })
})
