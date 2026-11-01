import { Array, Option } from 'effect'
import { textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { IssueLanding, LandedBuild, LandedCommit } from './issueLandings.js'
import {
  MovedRowCursor,
  ObservedIssueLanding,
  ObservedIssues,
  PeekedRowUnderCursor,
} from './message.js'
import { type Model } from './model.js'
import { issuesScreen } from './program.js'
import { pathToNavigation } from './route.js'
import { graphSubscriptions } from './subscription.js'
import { update } from './update.js'

const storedIssue = (id: string, createdAtMs: number): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs,
    details: '',
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P2',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title: `Issue ${id}`,
    updatedAtMs: createdAtMs,
    viewerURL: Option.none(),
    workLog: [],
  })

const landing = IssueLanding.make({
  commits: [
    LandedCommit.make({
      authoredAtMs: 1_790_000_000_000,
      builds: [
        LandedBuild.make({
          builtAtMs: 1_790_000_100_000,
          marketingVersion: '0.1',
          maybeTag: Option.none(),
          maybeTaggedAtMs: Option.none(),
          maybeTestflightInvite: Option.none(),
          maybeTestflightPage: Option.none(),
          maybeTestflightVersion: Option.none(),
          number: 214,
          status: 'installed',
        }),
      ],
      repo: 'technoplato/scribe',
      sha: '8fc12c548aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      subject: 'Keep the phone cool (#101)',
    }),
  ],
  foundIn: [],
})

const peekingAt101 = (): Model =>
  Array.reduce(
    [
      ObservedIssues.make({
        issues: [storedIssue('102', 3_000), storedIssue('101', 2_000)],
      }),
      MovedRowCursor.make({ direction: 'Next' }),
      MovedRowCursor.make({ direction: 'Next' }),
      PeekedRowUnderCursor.make({}),
    ],
    modelForNavigation(pathToNavigation('/issues')),
    (model, message) => update(model, message)[0],
  )

describe('a peek reads what the Issue page reads', () => {
  it('asks Scribe’s rows for the peeked Issue’s landing and graph', () => {
    const peeking = peekingAt101()
    expect(peeking.layer).toEqual({ _tag: 'PeekLayer', issueId: '101' })
    expect(
      graphSubscriptions.selectedIssueLanding.modelToDependencies(peeking),
    ).toEqual({ maybeIssueId: Option.some('101') })
    expect(
      graphSubscriptions.selectedIssueGraph.modelToDependencies(peeking),
    ).toEqual({ maybeIssueId: Option.some('101') })
  })

  it('shows where the peeked Issue landed', () => {
    const [landed] = update(
      peekingAt101(),
      ObservedIssueLanding.make({ issueId: '101', landing }),
    )
    expect(
      Array.map(textsOf(issuesScreen(landed)), text => text.content),
    ).toContainEqual(expect.stringContaining('Landed in Scribe 0.1 (214)'))
  })
})
