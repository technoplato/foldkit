import { Processor } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  decodeProcessorPresence,
  isEffectExecutorAvailable,
  makeProcessorPresence,
} from './presence.js'

const descriptor = (processorId: string): Processor.Descriptor =>
  Processor.Descriptor.make({
    capabilities: [],
    clientId: `client-${processorId}`,
    effectSupport: [],
    processorId,
    protocol: Processor.ProtocolRange.make({
      maximumVersion: 1,
      minimumVersion: 1,
    }),
  })

describe('Processor presence', () => {
  it('advertises execution only over authenticated attached transport', () => {
    expect(
      isEffectExecutorAvailable(
        {
          _tag: 'Attached',
          transportStatus: 'authenticated',
        },
        true,
      ),
    ).toBe(true)
    expect(
      isEffectExecutorAvailable(
        {
          _tag: 'Attached',
          transportStatus: 'connecting',
        },
        true,
      ),
    ).toBe(false)
    expect(isEffectExecutorAvailable({ _tag: 'Detached' }, true)).toBe(false)
    expect(
      isEffectExecutorAvailable(
        {
          _tag: 'Attached',
          transportStatus: 'authenticated',
        },
        false,
      ),
    ).toBe(false)
  })

  it('excludes logically disconnected effect executors from placement', () => {
    const available = descriptor('available')
    const detached = descriptor('detached')

    expect(
      decodeProcessorPresence([
        makeProcessorPresence(available, true, 4),
        makeProcessorPresence(detached, false, 4),
      ]),
    ).toStrictEqual([available])
  })
})
