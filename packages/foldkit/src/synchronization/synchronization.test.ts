import { Effect, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  Follow,
  Follower,
  Mirror,
  MissingProgramSynchronization,
  ProcessorAudience,
  ReadOnlyFollowerRejected,
  SessionAudience,
  SessionPolicy,
  SharedDomain,
  defaultSessionPolicy,
  includesProcessor,
  processorsInFollowMode,
  resolveAudience,
  validateProgramSynchronization,
} from './synchronization.js'

const policy = (mode: SessionPolicy['mode']): SessionPolicy =>
  SessionPolicy.make({ generation: 3, mode })

const followMode = () =>
  Follow.make({
    followers: [
      Follower.make({ control: 'Observe', processorId: 'processor-ipad' }),
      Follower.make({
        control: 'RemoteControl',
        processorId: 'processor-iphone',
      }),
    ],
    leaderProcessorId: 'processor-mac',
  })

describe('Program synchronization policy', () => {
  it('shares every domain Message regardless of navigation mode', () => {
    expect(
      resolveAudience(
        policy(SharedDomain.make({})),
        'Domain',
        'processor-iphone',
      ),
    ).toStrictEqual(SessionAudience.make({}))
    expect(
      resolveAudience(policy(followMode()), 'Domain', 'processor-ipad'),
    ).toStrictEqual(SessionAudience.make({}))
  })

  it('mirrors semantic navigation to the whole session', () => {
    expect(
      resolveAudience(
        policy(Mirror.make({})),
        'Navigation',
        'processor-iphone',
      ),
    ).toStrictEqual(SessionAudience.make({}))
  })

  it('keeps navigation on its originating Processor in SharedDomain mode', () => {
    const audience = resolveAudience(
      policy(SharedDomain.make({})),
      'Navigation',
      'processor-iphone',
    )

    expect(audience).toStrictEqual(
      ProcessorAudience.make({ processorIds: ['processor-iphone'] }),
    )
    if (audience._tag === 'SessionAudience') {
      throw new Error('Expected a Processor audience.')
    }
    if (audience._tag === 'ReadOnlyFollowerRejected') {
      throw new Error('Expected a delivered navigation occurrence.')
    }
    expect(includesProcessor(audience, 'processor-iphone')).toBe(true)
    expect(includesProcessor(audience, 'processor-mac')).toBe(false)
  })

  it('routes leader navigation to all followers and leaves other Processors independent', () => {
    expect(
      resolveAudience(policy(followMode()), 'Navigation', 'processor-mac'),
    ).toStrictEqual(
      ProcessorAudience.make({
        processorIds: ['processor-ipad', 'processor-iphone', 'processor-mac'],
      }),
    )
    expect(
      resolveAudience(policy(followMode()), 'Navigation', 'processor-browser'),
    ).toStrictEqual(
      ProcessorAudience.make({ processorIds: ['processor-browser'] }),
    )
  })

  it('rejects observer navigation but lets an authorized follower remote-control the group', () => {
    expect(
      resolveAudience(policy(followMode()), 'Navigation', 'processor-ipad'),
    ).toStrictEqual(
      ReadOnlyFollowerRejected.make({
        leaderProcessorId: 'processor-mac',
        processorId: 'processor-ipad',
      }),
    )
    expect(
      resolveAudience(policy(followMode()), 'Navigation', 'processor-iphone'),
    ).toStrictEqual(
      ProcessorAudience.make({
        processorIds: ['processor-ipad', 'processor-iphone', 'processor-mac'],
      }),
    )
  })

  it('rejects duplicate followers and a leader following itself', () => {
    const duplicate = {
      _tag: 'Follow',
      followers: [
        { control: 'Observe', processorId: 'processor-ipad' },
        { control: 'RemoteControl', processorId: 'processor-ipad' },
      ],
      leaderProcessorId: 'processor-mac',
    }
    const selfFollow = {
      _tag: 'Follow',
      followers: [{ control: 'Observe', processorId: 'processor-mac' }],
      leaderProcessorId: 'processor-mac',
    }

    expect(S.decodeUnknownOption(Follow)(duplicate)._tag).toBe('None')
    expect(S.decodeUnknownOption(Follow)(selfFollow)._tag).toBe('None')
  })

  it('defaults new sessions to SharedDomain while preserving legacy Mirror semantics', () => {
    expect(defaultSessionPolicy()).toStrictEqual(
      SessionPolicy.make({ generation: 0, mode: SharedDomain.make({}) }),
    )
    expect(processorsInFollowMode(followMode())).toStrictEqual([
      'processor-ipad',
      'processor-iphone',
      'processor-mac',
    ])
  })

  it('requires Program synchronization metadata outside Mirror', async () => {
    await expect(
      Effect.runPromise(
        validateProgramSynchronization(defaultSessionPolicy(), {
          id: 'plain-counter',
        }),
      ),
    ).rejects.toStrictEqual(
      new MissingProgramSynchronization({
        mode: 'SharedDomain',
        programId: 'plain-counter',
      }),
    )
  })
})
