import { Array, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueTracker,
  type IssueTrackerService,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { IssueIdentity } from './issueIdentity.js'
import { DroppedCard, ObservedIssues, ObservedProducts } from './message.js'
import { type Model } from './model.js'
import { makeMemoryIssueTracker } from './resources.js'
import { pathToNavigation } from './route.js'
import { ReleaseIssueClaim, update } from './update.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })
const AGENT = 'claude-code/one@ld'
const HIM = 'michael@site'

const storedIssue = (
  id: string,
  createdAtMs: number,
  status: Issue['status'],
  maybeClaimant: Option.Option<string>,
): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: maybeClaimant,
    complexity: Option.none(),
    createdAtMs,
    details: 'x',
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P2',
    product: scribe,
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status,
    successCriteria: [],
    title: `Issue ${id}`,
    updatedAtMs: createdAtMs,
    viewerURL: Option.none(),
    workLog: [],
  })

const closed102 = storedIssue('102', 3_000, 'Closed', Option.none())
const claimed100 = storedIssue('100', 1_000, 'InProgress', Option.some(AGENT))

const boardByClaimant = (issues: ReadonlyArray<Issue>): Model =>
  Array.reduce(
    [
      ObservedIssues.make({ issues }),
      ObservedProducts.make({ products: [{ product: scribe, updatedAtMs: 1 }] }),
    ],
    modelForNavigation(pathToNavigation('/issues?view=board&group=claimant')),
    (model, message) => update(model, message)[0],
  )

const resourcesOf = (tracker: IssueTrackerService) =>
  Layer.mergeAll(
    Layer.succeed(IssueTracker, tracker),
    Layer.succeed(IssueIdentity, {
      author: Effect.succeed(HIM),
      next: Effect.succeed({ id: 'x', nowMs: 9_000 }),
    }),
  )

const run = async (
  tracker: IssueTrackerService,
  effect: Effect.Effect<unknown, never, IssueIdentity | IssueTracker>,
): Promise<unknown> =>
  Effect.runPromise(effect.pipe(Effect.provide(resourcesOf(tracker))))

const storedOf = async (
  tracker: IssueTrackerService,
  issueId: string,
): Promise<Issue> =>
  Option.getOrThrow(await Effect.runPromise(tracker.fetchIssue(issueId)))

const linesOf = (issue: Issue) =>
  Array.map(issue.workLog, entry => [
    Option.getOrNull(entry.agentId),
    Option.getOrNull(entry.state),
    entry.summary,
  ])

describe('a claim from the board', () => {
  it('claims a card dropped on an agent column for that agent, in the name of who dropped it, and names the status it moves', async () => {
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([closed102, claimed100]),
    )
    const [, commands] = update(
      boardByClaimant([closed102, claimed100]),
      DroppedCard.make({ column: AGENT, issueId: '102' }),
    )
    expect(commands).toHaveLength(1)

    await run(
      tracker,
      // oxlint-disable-next-line typescript/consistent-type-assertions
      Option.getOrThrow(Array.head(commands)).effect as Effect.Effect<
        unknown,
        never,
        IssueIdentity | IssueTracker
      >,
    )

    const stored = await storedOf(tracker, '102')
    expect(stored.claimantId).toEqual(Option.some(AGENT))
    expect(stored.status).toBe('InProgress')
    expect(linesOf(stored)).toEqual([
      [HIM, 'status', 'Status Closed → InProgress.'],
      [HIM, 'claimed', `Claimed for ${AGENT} by ${HIM}.`],
    ])
  })

  it('writes nothing when a card is dropped on the column it is in', () => {
    const [after, commands] = update(
      boardByClaimant([closed102, claimed100]),
      DroppedCard.make({ column: AGENT, issueId: '100' }),
    )

    expect(commands).toEqual([])
    expect(after.rowEdits).toEqual([])
  })
})

describe('a release', () => {
  it('writes nothing on an Issue no one claims', async () => {
    const unclaimed = storedIssue('101', 2_000, 'Open', Option.none())
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([unclaimed]),
    )

    await run(tracker, ReleaseIssueClaim({ issueId: '101' }).effect)

    const stored = await storedOf(tracker, '101')
    expect(stored.workLog).toEqual([])
    expect(stored.updatedAtMs).toBe(2_000)
  })

  it('says whose claim it let go and who let it go', async () => {
    const tracker = await Effect.runPromise(
      makeMemoryIssueTracker([claimed100]),
    )

    await run(tracker, ReleaseIssueClaim({ issueId: '100' }).effect)

    const stored = await storedOf(tracker, '100')
    expect(stored.claimantId).toEqual(Option.none())
    expect(linesOf(stored)).toEqual([
      [HIM, 'released', `Claim of ${AGENT} released by ${HIM}.`],
    ])
  })
})
