import { describe, expect, it } from 'vitest'

import {
  AgentEntity,
  BuildEntity,
  CommitEntity,
  type PageEntity,
  ProductEntity,
  RecordingEntity,
  RecordingNumberEntity,
} from './entityGraph.js'
import { modelForNavigation } from './init.js'
import { TickedClock } from './message.js'
import { EntityPage, IssueDetail, IssueList } from './model.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { update } from './update.js'

const RECORDING_ID = 'faa684c2-34e4-47e5-8f9b-3b2196da9463'

describe('entity pages', () => {
  it.each<readonly [string, PageEntity]>([
    [
      `/recordings/${RECORDING_ID}`,
      RecordingEntity.make({ recordingId: RECORDING_ID }),
    ],
    ['/recordings/208', RecordingNumberEntity.make({ recordingNumber: 208 })],
    [
      '/agents/claude-code%2Fissues-linear-1538%40ld',
      AgentEntity.make({ agentId: 'claude-code/issues-linear-1538@ld' }),
    ],
    ['/commits/6ff20758d', CommitEntity.make({ sha: '6ff20758d' })],
    ['/builds/218', BuildEntity.make({ number: '218' })],
    ['/products/scribe', ProductEntity.make({ productId: 'scribe' })],
  ])('opens %s as its page and prints it back', (path, entity) => {
    const navigation = pathToNavigation(path)
    expect(navigation).toEqual(EntityPage.make({ entity }))
    expect(navigationToPath(navigation)).toBe(path)
  })

  it('keeps Issue pages where they were', () => {
    expect(pathToNavigation('/issues/1358')).toEqual(
      IssueDetail.make({ issueId: '1358' }),
    )
  })
})

describe('the reader clock', () => {
  it('keeps the time and offset a tick gave, for how long ago things were', () => {
    const [next] = update(
      modelForNavigation(IssueList.make({})),
      TickedClock.make({ nowMs: 1_793_541_600_000, timeZone: 'America/New_York' }),
    )
    expect(next.clock).toEqual({
      nowMs: 1_793_541_600_000,
      timeZone: 'America/New_York',
    })
  })

  it('starts unread, so times show as dates until the first tick', () => {
    expect(modelForNavigation(IssueList.make({})).clock.nowMs).toBe(0)
  })
})
