import { Array, Effect, Option, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  agentChipsQuery,
  agentFactsQuery,
  featureBuildsQuery,
  featureFactsQuery,
} from './graphFacts.js'
import { type GraphDatabase, instantGraphRows } from './graphRows.js'
import { type LandingsQuery, NoPageFacts } from './issueLandings.js'

type Answer = Readonly<{ data?: unknown; error?: unknown }>

const answering = (
  answerOf: (query: LandingsQuery) => Answer,
): Readonly<{
  closed: () => number
  database: GraphDatabase
  promoted: () => ReadonlyArray<unknown>
  queries: () => ReadonlyArray<LandingsQuery>
}> => {
  const queries: Array<LandingsQuery> = []
  const promoted: Array<unknown> = []
  let closed = 0
  return {
    closed: () => closed,
    database: {
      subscribeQuery: (query, onResponse) => {
        queries.push(query)
        onResponse(answerOf(query))
        return () => {
          closed += 1
        }
      },
      updateFinding: (findingId, promotion) => {
        promoted.push({ findingId, ...promotion })
        return Promise.resolve()
      },
    },
    promoted: () => promoted,
    queries: () => queries,
  }
}

const storedLine = {
  edges: [{ basis: 'git', issueNumber: 694, predicate: 'implements' }],
  id: 'line',
  isDraft: false,
  name: 'Scroll back, always.',
  number: 3,
  productSlug: 'scribe',
  slug: 'scroll-back-always',
  sourceCommitSha: 'a'.repeat(40),
  sourceCommittedAtMs: 1,
  status: 'active',
  text: 'Words.',
}

describe('the graph over a live client', () => {
  it('asks only the page’s own query, and closes it with the page', async () => {
    const client = answering(() => ({ data: { agentRuns: [] } }))
    const graph = instantGraphRows(Effect.succeed(client.database))
    const facts = await Effect.runPromise(
      graph.observeAgentFacts('tools/agent-run').pipe(Stream.runHead),
    )
    expect(facts).toEqual(Option.some(NoPageFacts.make({})))
    expect(client.queries()).toEqual([agentFactsQuery('tools/agent-run')])
    expect(client.closed()).toBe(1)
  })

  it('reads a page’s chips for its handles and open Issue alone', async () => {
    const client = answering(() => ({ data: { agentRuns: [] } }))
    const graph = instantGraphRows(Effect.succeed(client.database))
    await Effect.runPromise(
      graph
        .observeAgentChips(['claude-code/a@ld'], Option.some(1538))
        .pipe(Stream.runHead),
    )
    expect(client.queries()).toEqual([
      agentChipsQuery(['claude-code/a@ld'], 1538),
    ])
  })

  it('reads a feature, then which builds its Issues landed in', async () => {
    const client = answering(query =>
      'features' in query
        ? { data: { features: [storedLine] } }
        : {
            data: {
              edges: [
                {
                  commit: [
                    {
                      edges: [
                        { build: [{ number: 101 }], predicate: 'shippedIn' },
                      ],
                    },
                  ],
                  issueNumber: 694,
                },
              ],
            },
          },
    )
    const graph = instantGraphRows(Effect.succeed(client.database))
    const emitted = await Effect.runPromise(
      graph
        .observeFeatureFacts('scroll-back-always')
        .pipe(Stream.take(2), Stream.runCollect),
    )
    expect(client.queries()).toEqual([
      featureFactsQuery('scroll-back-always'),
      featureBuildsQuery([694]),
    ])
    expect(
      Array.map(emitted, facts =>
        facts._tag === 'FeatureFacts' ? facts.issueBuilds.length : -1,
      ),
    ).toEqual([0, 1])
  })

  it('says a feature is not there without asking for builds', async () => {
    const client = answering(() => ({ data: { features: [] } }))
    const graph = instantGraphRows(Effect.succeed(client.database))
    const facts = await Effect.runPromise(
      graph.observeFeatureFacts('nothing').pipe(Stream.runHead),
    )
    expect(facts).toEqual(Option.some(NoPageFacts.make({})))
    expect(client.queries().length).toBe(1)
  })

  it('reads no graph for an Issue with no number', async () => {
    const client = answering(() => ({ data: {} }))
    const graph = instantGraphRows(Effect.succeed(client.database))
    await Effect.runPromise(
      graph.observeIssueGraph('issue-041').pipe(Stream.runHead),
    )
    expect(client.queries()).toEqual([])
  })

  it('marks a finding promoted with the Issue’s number and the time', async () => {
    const client = answering(() => ({ data: {} }))
    const graph = instantGraphRows(Effect.succeed(client.database))
    await Effect.runPromise(graph.markFindingPromoted('finding', 1570))
    expect(client.promoted()).toEqual([
      {
        findingId: 'finding',
        promotedIssueNumber: 1570,
        status: 'promoted',
        updatedAtMs: expect.any(Number),
      },
    ])
  })
})
