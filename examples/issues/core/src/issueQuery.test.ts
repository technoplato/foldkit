import { Array, Effect, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { catalogIssueQuery } from './issueQuery.js'
import { makeMemoryIssueTracker } from './resources.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

const issueNumbered = (number: number): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: number,
    details: '',
    id: number.toString().padStart(3, '0'),
    issueType: Option.none(),
    mentions: [],
    priority: 'P2',
    product: scribe,
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title: `Issue ${number.toString()}`,
    updatedAtMs: number,
    viewerURL: Option.none(),
    workLog: [],
  })

describe('the catalog query', () => {
  it('reads every Issue, so the oldest never leave the list as the catalog grows', async () => {
    const catalog = Array.makeBy(2_001, index => issueNumbered(index + 1))
    const tracker = await Effect.runPromise(makeMemoryIssueTracker(catalog))

    const observed = await Effect.runPromise(
      Stream.runHead(tracker.observe(catalogIssueQuery)),
    )

    const shown = Option.getOrElse(observed, () => [])
    expect(shown).toHaveLength(2_001)
    expect(Array.map(Array.takeRight(shown, 1), issue => issue.id)).toEqual([
      '001',
    ])
  })
})
