import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { AwardedPoints, ChangedSections } from 'brandon-core-example'

import { logFieldsOf, sameTotals } from './facts.js'

describe('a fact on the log', () => {
  it('writes the row Foldkit’s reader folds, with its owner', () => {
    const fields = logFieldsOf(
      ChangedSections({ atMs: 5 }),
      { ownerUserID: 'owner', from: 'cli-brandon', atMs: 9 },
    )
    expect(fields).toMatchObject({
      ownerUserID: 'owner',
      app: 'brandon-dot',
      programVersion: 1,
      tag: 'ChangedSections',
      payload: { atMs: 5 },
      from: 'cli-brandon',
      createdAtMs: 9,
    })
  })

  it('carries a score change whole', () => {
    const fields = logFieldsOf(
      AwardedPoints({ eventId: 'e', name: 'Claude', points: -1, reason: 'mixed up names', awardedBy: 'the listener' }),
      { ownerUserID: 'owner', from: 'cli-brandon', atMs: 9 },
    )
    expect(fields.payload).toEqual({
      eventId: 'e',
      name: 'Claude',
      points: -1,
      reason: 'mixed up names',
      awardedBy: 'the listener',
    })
  })
})

describe('the scoreboard check', () => {
  it('passes only when the log and Scribe’s rows agree', () => {
    expect(sameTotals(new Map([['Claude', 1]]), new Map([['Claude', 1]]))).toEqual(Option.none())
    expect(sameTotals(new Map([['Claude', 1]]), new Map([['Claude', 2]]))).toEqual(
      Option.some('Claude: the log has 1, Scribe has 2'),
    )
  })
})
