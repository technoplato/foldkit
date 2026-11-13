import { Duration, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { UnavailableIssueChildren, readIssueChildren } from './family.js'
import {
  UnavailableIssueReferences,
  readIssueReferences,
} from './references.js'

const RECORDING = 'aa11bb22-0000-4000-8000-000000000428'

const referenceRows = {
  issueReferences: [
    {
      id: 'l1',
      issueNumber: 2347,
      placeKind: 'line',
      matchedBy: 'number',
      quote: 'Is 2347 a true epic?',
      atMs: 1,
      recordingID: RECORDING,
      source: 'test',
    },
  ],
}

const isReferencesQuery = (query: unknown): boolean =>
  typeof query === 'object' && query !== null && 'issueReferences' in query

describe('readIssueChildren (Scribe #2348)', () => {
  it('reads the children Scribe answers with', async () => {
    const asked: Array<unknown> = []
    const read = await Effect.runPromise(
      readIssueChildren(async query => {
        asked.push(query)
        return {
          issues: [
            { number: 2332, title: 'QR', status: 'Open', priority: 'P1' },
          ],
        }
      }, 2347),
    )
    expect(read._tag).toBe('FoundIssueChildren')
    expect(read).toMatchObject({ children: { done: 0, total: 1 } })
    expect(asked).toEqual([
      {
        issues: {
          $: {
            where: { parentNumber: 2347 },
            fields: ['number', 'title', 'status', 'priority', 'issueType'],
          },
        },
      },
    ])
  })

  it('never fails: no answer in time, a refused query and rows it cannot read each say why', async () => {
    const silent = await Effect.runPromise(
      readIssueChildren(
        () => new Promise(() => undefined),
        2347,
        Duration.millis(10),
      ),
    )
    expect(silent).toEqual(
      UnavailableIssueChildren.make({
        reason: "Scribe's Instant app did not answer within 0.01 seconds.",
      }),
    )
    const refused = await Effect.runPromise(
      readIssueChildren(async () => {
        throw new Error('Attributes are missing in your schema: parentNumber')
      }, 2347),
    )
    expect(refused).toEqual(
      UnavailableIssueChildren.make({
        reason:
          "the children query to Scribe's Instant app failed: Attributes are missing in your schema: parentNumber",
      }),
    )
    const unreadable = await Effect.runPromise(
      readIssueChildren(async () => ({ issues: [{ number: 'x' }] }), 2347),
    )
    expect(unreadable._tag).toBe('UnavailableIssueChildren')
  })
})

describe('readIssueReferences (Scribe #2348)', () => {
  it("reads the places, then their recordings' titles", async () => {
    const asked: Array<unknown> = []
    const read = await Effect.runPromise(
      readIssueReferences(async query => {
        asked.push(query)
        return isReferencesQuery(query)
          ? referenceRows
          : { recordings: [{ id: RECORDING, title: 'Recording 428' }] }
      }, 2347),
    )
    expect(asked).toHaveLength(2)
    expect(read).toMatchObject({
      _tag: 'FoundIssueReferences',
      references: { recordings: [{ id: RECORDING }] },
    })
    if (read._tag === 'FoundIssueReferences') {
      expect(
        Option.getOrNull(
          Option.flatMap(
            Option.fromUndefinedOr(read.references.recordings[0]),
            recording => recording.maybeTitle,
          ),
        ),
      ).toBe('Recording 428')
    }
  })

  it("keeps the places when the recordings' titles cannot be read", async () => {
    const read = await Effect.runPromise(
      readIssueReferences(async query => {
        if (isReferencesQuery(query)) {
          return referenceRows
        }
        throw new Error('no titles')
      }, 2347),
    )
    expect(read._tag).toBe('FoundIssueReferences')
  })

  it('asks no titles when no recording names the Issue', async () => {
    const asked: Array<unknown> = []
    await Effect.runPromise(
      readIssueReferences(async query => {
        asked.push(query)
        return { issueReferences: [] }
      }, 2347),
    )
    expect(asked).toHaveLength(1)
  })

  it('never fails: a refused query says why', async () => {
    const refused = await Effect.runPromise(
      readIssueReferences(async () => {
        throw new Error('issueReferences is not in the schema')
      }, 2347),
    )
    expect(refused).toEqual(
      UnavailableIssueReferences.make({
        reason:
          "the places query to Scribe's Instant app failed: issueReferences is not in the schema",
      }),
    )
  })
})
