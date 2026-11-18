import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueMention,
  IssueWorkLogEntry,
  RecordingMention,
  RecordingReference,
  UriReference,
} from '@foldkit/instant-tools/issues'

import {
  AgentEntity,
  BuildEntity,
  CommitEntity,
  IssueEntity,
  ProductEntity,
  RecordingEntity,
  backlinksOf,
  entityKey,
  issuesOfPage,
  linksOfIssue,
  recordingNumbersOf,
} from './entityGraph.js'

const RECORDING_ID = 'faa684c2-34e4-47e5-8f9b-3b2196da9463'
const SECTION_ID = '8d70b597-a775-41d8-b688-a08f722a87b2'

const base = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_000,
  details: 'Plain details.',
  evidenceLogQueries: [],
  id: '100',
  issueType: Option.some('defect'),
  mentions: [],
  priority: 'P2',
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  projectId: Option.none(),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'Open',
  successCriteria: [],
  title: 'A plain Issue',
  updatedAtMs: 1_000,
  viewerURL: Option.none(),
  workLog: [],
})

const target = Issue.make({
  ...base,
  id: '1358',
  title: 'issues CLI burns CPU',
})

const asked = Issue.make({
  ...base,
  id: '1400',
  title: 'Asked in Recording 208',
  mentions: [
    IssueMention.make({
      capturedAtMs: Option.some(5_000),
      directQuote: Option.some(
        `Recording 208 (${RECORDING_ID}) #2735: words about the tracker`,
      ),
      id: 'mention-1400-1',
      issueId: '1400',
      related: [
        UriReference.make({
          value: `https://words.pisspoursoftware.xyz/recording/${RECORDING_ID}/section/${SECTION_ID}?t=14287.00`,
        }),
      ],
      reporter: Option.none(),
      source: RecordingReference.make({
        recording: RecordingMention.make({
          endMilliseconds: Option.none(),
          recordingId: RECORDING_ID,
          screenshotIds: [],
          startMilliseconds: 14_287_000,
        }),
      }),
    }),
  ],
})

const referring = Issue.make({
  ...base,
  id: '1500',
  title: 'Refers to others',
  details: 'Fixed by #1358 after Recording 208 #2724-2737; see build 218.',
  claimantId: Option.some('claude-code/issues-linear-1538@ld'),
  workLog: [
    IssueWorkLogEntry.make({
      agentId: Option.some('claude-code/issues-linear-1538@ld'),
      commitSha: Option.some('f6155d62c0a1b2c3d4e5f60718293a4b5c6d7e8f'),
      durationSeconds: Option.none(),
      id: 'work-1500-1',
      occurredAtMs: 9_000,
      state: Option.some('progress'),
      summary: 'Green at f6155d62c.',
    }),
  ],
})

const related = Issue.make({ ...base, id: '1600', relatedIssueIds: ['1358'] })

const catalog = [target, asked, referring, related]

const backlinkIds = (backlinks: ReturnType<typeof backlinksOf>) =>
  Array.map(backlinks, backlink => backlink.issue.id)

describe('the entity graph', () => {
  it('lists every Issue that points at an Issue, never the Issue itself', () => {
    const backlinks = backlinksOf(
      catalog,
      IssueEntity.make({ issueId: '1358' }),
    )
    expect(backlinkIds(backlinks).sort()).toEqual(['1500', '1600'])
    const fromText = Array.findFirst(
      backlinks,
      backlink => backlink.issue.id === '1500',
    )
    expect(
      Option.map(fromText, backlink =>
        Array.map(backlink.links, link => link.place),
      ),
    ).toEqual(Option.some(['Details']))
  })

  it('finds a Recording by its id, its words links, and its number once a mention names both', () => {
    expect(
      backlinkIds(
        backlinksOf(
          catalog,
          RecordingEntity.make({ recordingId: RECORDING_ID }),
        ),
      ).sort(),
    ).toEqual(['1400', '1500'])
  })

  it('finds an agent by its claims and its work-log entries', () => {
    const [backlink] = backlinksOf(
      catalog,
      AgentEntity.make({ agentId: 'claude-code/issues-linear-1538@ld' }),
    )
    expect(backlink?.issue.id).toBe('1500')
    expect(Array.map(backlink?.links ?? [], link => link.place).sort()).toEqual(
      ['Claim', 'WorkLog'],
    )
  })

  it('finds a commit by the short SHA a reader writes or the full SHA a work log keeps', () => {
    expect(
      backlinkIds(
        backlinksOf(catalog, CommitEntity.make({ sha: 'f6155d62c' })),
      ),
    ).toEqual(['1500'])
  })

  it('finds a build by its number', () => {
    expect(
      backlinkIds(backlinksOf(catalog, BuildEntity.make({ number: '218' }))),
    ).toEqual(['1500'])
  })

  it('reads an unchanged Issue once', () => {
    expect(linksOfIssue(referring)).toBe(linksOfIssue(referring))
  })

  it("lists on a product's page every Issue of the product, by status, the most recently changed first", () => {
    const open = Array.makeBy(25, index =>
      Issue.make({
        ...base,
        id: (2000 + index).toString(),
        updatedAtMs: 10_000 + index,
      }),
    )
    const fixed = Array.makeBy(3, index =>
      Issue.make({
        ...base,
        id: (3000 + index).toString(),
        status: 'Fixed',
      }),
    )
    const offered = Array.map(
      issuesOfPage(
        [...fixed, ...open],
        ProductEntity.make({ productId: 'scribe' }),
      ),
      issue => issue.id,
    )
    expect(offered).toHaveLength(28)
    expect(Array.take(offered, 2)).toEqual(['2024', '2023'])
    expect(Array.drop(offered, 25)).toEqual(['3000', '3001', '3002'])
  })

  it('names each entity by one key', () => {
    expect(entityKey(CommitEntity.make({ sha: 'f6155d62c0a1b2' }))).toBe(
      'commit:f6155d6',
    )
    expect(entityKey(IssueEntity.make({ issueId: '1358' }))).toBe('issue:1358')
  })
})

const issueQuoting = (id: string, quote: string): Issue =>
  Issue.make({
    ...base,
    id,
    mentions: [
      IssueMention.make({
        capturedAtMs: Option.none(),
        directQuote: Option.some(quote),
        id: `mention-${id}`,
        issueId: id,
        reporter: Option.none(),
        source: UriReference.make({ value: `https://example.com/${id}` }),
      }),
    ],
  })

describe('Recording numbers that name more than one Recording', () => {
  it('turns a number into an id only when one Recording has it, and says which share it', () => {
    const first = '11111111-1111-4111-8111-111111111111'
    const second = '22222222-2222-4222-8222-222222222222'
    const only = '33333333-3333-4333-8333-333333333333'
    const numbers = recordingNumbersOf([
      issueQuoting('100', `Recording 020 (${first}) #4`),
      issueQuoting('101', `Recording 20 (${second}) #9`),
      issueQuoting('102', `Recording 208 (${only}) #2735`),
    ])

    expect(numbers.idOfNumber.get(20)).toBeUndefined()
    expect(numbers.idOfNumber.get(208)).toBe(only)
    expect(numbers.idsOfNumber.get(20)).toEqual([first, second])
    expect(numbers.numberOfId.get(second)).toBe(20)
  })
})

