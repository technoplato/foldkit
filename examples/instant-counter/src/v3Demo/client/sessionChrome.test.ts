import { MultipleCountersProgram } from 'counters-core-example'
import { Option, Result } from 'effect'
import * as Synchronization from 'foldkit/synchronization'
import { describe, expect, it } from 'vitest'

import { ActiveSubjectScopedProgram } from '@foldkit/instant'

import type { MultipleCountersV3ClientSnapshot } from './controller.js'
import {
  formatMultipleCountersV3SessionChrome,
  isMultipleCountersV3ObserveFollower,
  multipleCountersV3FollowMode,
  multipleCountersV3ModeLabel,
  multipleCountersV3ModeRequestLabel,
  multipleCountersV3SessionChrome,
  parseMultipleCountersV3ModeCommand,
} from './sessionChrome.js'

const [initialModel] = MultipleCountersProgram.init()

const clientSnapshot = (
  mode: Synchronization.Mode,
  processorId = 'processor-browser',
): MultipleCountersV3ClientSnapshot => ({
  lifecycle: ActiveSubjectScopedProgram.make({
    generation: 2,
    subjectId: 'subject-a',
  }),
  maybeActiveProgram: Option.some({
    generation: 2,
    processorId,
    processorSnapshot: {
      acceptedModel: initialModel,
      activeProgramSession: Option.none(),
      activeSessionPolicy: Option.some(
        Synchronization.SessionPolicy.make({
          generation: 2,
          mode,
        }),
      ),
      connection: { _tag: 'Attached', transportStatus: 'Authenticated' },
      lastError: Option.none(),
      optimisticModel: initialModel,
      pendingClaims: [],
      recentTerminalClaims: [],
      throughAcceptedSequence: 0,
      waitingForAcceptedSequence: Option.some(1),
    },
    subjectId: 'subject-a',
  }),
  model: initialModel,
})

describe('Multiple Counters v3 session chrome', () => {
  it('constructs Follow only for distinct Processor identities', () => {
    expect(
      multipleCountersV3FollowMode(
        'processor-mac',
        'processor-phone',
        'Observe',
      ),
    ).toEqual(
      Option.some(
        Synchronization.Follow.make({
          followers: [
            Synchronization.Follower.make({
              control: 'Observe',
              processorId: 'processor-phone',
            }),
          ],
          leaderProcessorId: 'processor-mac',
        }),
      ),
    )
    expect(
      multipleCountersV3FollowMode(
        'processor-mac',
        'processor-mac',
        'RemoteControl',
      ),
    ).toEqual(Option.none())
    expect(
      multipleCountersV3FollowMode(
        'processor.bad',
        'processor-phone',
        'Observe',
      ),
    ).toEqual(Option.none())
    expect(
      multipleCountersV3FollowMode(
        'processor-mac',
        'p'.repeat(129),
        'RemoteControl',
      ),
    ).toEqual(Option.none())
  })

  it('parses Independent, Mirror, and Follow command tokens', () => {
    expect(parseMultipleCountersV3ModeCommand(['independent'])).toEqual(
      Result.succeed(Synchronization.SharedDomain.make({})),
    )
    expect(parseMultipleCountersV3ModeCommand(['mirror'])).toEqual(
      Result.succeed(Synchronization.Mirror.make({})),
    )
    expect(
      parseMultipleCountersV3ModeCommand([
        'follow',
        'processor-mac',
        'processor-cli',
        'remote',
      ]),
    ).toEqual(
      Result.succeed(
        Synchronization.Follow.make({
          followers: [
            Synchronization.Follower.make({
              control: 'RemoteControl',
              processorId: 'processor-cli',
            }),
          ],
          leaderProcessorId: 'processor-mac',
        }),
      ),
    )
    expect(
      Result.isFailure(parseMultipleCountersV3ModeCommand(['follow', 'same'])),
    ).toBe(true)
  })

  it('labels SharedDomain as Independent and names Follow roles', () => {
    expect(
      multipleCountersV3ModeLabel(
        clientSnapshot(Synchronization.SharedDomain.make({})),
      ),
    ).toBe('Independent')
    expect(
      multipleCountersV3ModeLabel(clientSnapshot(Synchronization.Mirror.make({}))),
    ).toBe('Mirror')
    expect(
      multipleCountersV3ModeLabel(
        clientSnapshot(
          Synchronization.Follow.make({
            followers: [
              Synchronization.Follower.make({
                control: 'Observe',
                processorId: 'processor-phone',
              }),
            ],
            leaderProcessorId: 'processor-mac',
          }),
          'processor-phone',
        ),
      ),
    ).toBe('Follow (observe)')
    expect(
      multipleCountersV3ModeRequestLabel(Synchronization.SharedDomain.make({})),
    ).toBe('Independent')
    expect(
      isMultipleCountersV3ObserveFollower(
        clientSnapshot(
          Synchronization.Follow.make({
            followers: [
              Synchronization.Follower.make({
                control: 'Observe',
                processorId: 'processor-browser',
              }),
            ],
            leaderProcessorId: 'processor-mac',
          }),
        ),
      ),
    ).toBe(true)
  })

  it('formats the same chrome lines for CLI and TUI', () => {
    const chrome = multipleCountersV3SessionChrome(
      clientSnapshot(Synchronization.Mirror.make({})),
      'alice@fake.com',
    )
    expect(formatMultipleCountersV3SessionChrome(chrome)).toEqual([
      'Account: alice@fake.com',
      'Connection: Authenticated',
      'Mode: Mirror',
      'Processor: processor-browser',
      'Pending: 0',
    ])
  })

  it('names Observe-follower navigation as following the leader', () => {
    const chrome = multipleCountersV3SessionChrome(
      clientSnapshot(
        Synchronization.Follow.make({
          followers: [
            Synchronization.Follower.make({
              control: 'Observe',
              processorId: 'processor-browser',
            }),
          ],
          leaderProcessorId: 'processor-mac',
        }),
      ),
      'alice@fake.com',
    )
    expect(formatMultipleCountersV3SessionChrome(chrome)).toContain(
      'Navigation follows the leader. Domain actions stay available.',
    )
  })
})
