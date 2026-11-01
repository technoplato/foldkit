import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueMention,
  UriReference,
} from '@foldkit/instant-tools/issues'

import { chipContextOf, partsOfText } from './chips.js'
import {
  FeatureEntity,
  FindingEntity,
  ProductEntity,
  SessionEntity,
  backlinksOf,
} from './entityGraph.js'
import { featureChipsOf, issueGraphOf } from './graphFacts.js'
import { modelForNavigation } from './init.js'
import {
  ObservedFeatureChips,
  ObservedIssue,
  ObservedIssueGraph,
  ObservedIssues,
} from './message.js'
import { EntityPage, IssueDetail, type Model } from './model.js'
import { issuesScreen } from './program.js'
import { readTextReferences } from './textReferences.js'
import { update } from './update.js'

const FINDING_ID = '1adc23b2-451d-5dd5-9cf9-3b79405661fe'
const SESSION_ID = '2914b977-312b-4d93-a41c-4681d1255fe1'
const AT_MS = Date.parse('2026-11-01T14:00:00Z')

const line = (name: string, slug: string, number: number) => ({
  id: slug,
  isDraft: false,
  name,
  number,
  productSlug: 'scribe',
  slug,
  status: 'active',
})

const features = featureChipsOf({
  features: [
    line('Recording.', 'recording', 1),
    line('Scroll back, always.', 'scroll-back-always', 3),
  ],
})

const blank = (id: string, details: string): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: AT_MS,
    details,
    evidenceLogQueries: [],
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'InProgress',
    successCriteria: [],
    title: `Issue ${id}`,
    updatedAtMs: AT_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const chipsIn = (
  text: string,
  known: typeof features = features,
): ReadonlyArray<ReferencePart> =>
  Array.filter(
    partsOfText(
      text,
      chipContextOf([blank('1538', '')], AT_MS, -300, {
        agents: [],
        builds: [],
        commits: [],
        features: known,
      }),
    ),
    (part): part is ReferencePart => part._tag === 'Reference',
  )

const tagsIn = (text: string): ReadonlyArray<string> =>
  Array.flatMap(readTextReferences(text), piece =>
    piece._tag === 'Referenced' ? [piece.reference._tag] : [],
  )

describe('a feature named in text', () => {
  it('reads FEATURES and the number, the way agents write it', () => {
    expect(tagsIn('This keeps FEATURES 3 whole.')).toEqual([
      'FeatureLineNumber',
    ])
    expect(tagsIn('docs/FEATURES.md #3 and FEATURES.md line 1')).toEqual([
      'FeatureLineNumber',
      'FeatureLineNumber',
    ])
    expect(tagsIn('FEATURES items 1, 3 and 7')).toEqual([
      'FeatureLineNumber',
      'FeatureLineNumber',
      'FeatureLineNumber',
    ])
  })

  it('leaves the word alone with no number', () => {
    expect(tagsIn('docs/FEATURES.md (35 items)')).toEqual([])
    expect(tagsIn('The FEATURES file.')).toEqual([])
  })

  it('shows its name and state, and links its page', () => {
    const [chip] = chipsIn('Keeps FEATURES 3 whole.')
    expect(chip?.kind).toBe('Feature')
    expect(chip?.title).toBe('Scroll back, always.')
    expect(chip?.state).toBe('active')
    expect(chip?.href).toBe('/features/scroll-back-always')
    expect(chip?.detail).toContainEqual(expect.stringContaining('FEATURES 3'))
  })

  it('keeps its words when no line is known', () => {
    expect(chipsIn('Keeps FEATURES 3 whole.', [])).toEqual([])
    expect(
      Array.map(
        partsOfText('Keeps FEATURES 3 whole.', chipContextOf([], AT_MS, -300)),
        part => (part._tag === 'Plain' ? part.text : part.label),
      ),
    ).toEqual(['Keeps FEATURES ', '3', ' whole.'])
  })

  it('on an Issue, reads the number as the file had it when the Issue said it', () => {
    const issue = blank('702', 'This keeps FEATURES 3 whole.')
    const graph = issueGraphOf({
      agentFindings: [],
      edges: [
        {
          basis: 'tracker',
          feature: [line('Recording.', 'recording', 1)],
          note: "#702's details names FEATURES 3, Recording., as of 521edbfdb",
          predicate: 'touches',
        },
      ],
    })
    const model: Model = [
      ObservedIssues.make({ issues: [issue] }),
      ObservedIssue.make({ issue: Option.some(issue), issueId: '702' }),
      ObservedFeatureChips.make({ features }),
      ObservedIssueGraph.make({ graph, issueId: '702' }),
    ].reduce(
      (current, message) => update(current, message)[0],
      modelForNavigation(IssueDetail.make({ issueId: '702' })),
    )
    const chips = Array.flatMap(textsOf(issuesScreen(model)), text =>
      Array.filter(
        text.parts ?? [],
        (part): part is ReferencePart =>
          part._tag === 'Reference' && part.label === '3',
      ),
    )
    expect(Array.map(chips, chip => chip.href)).toEqual(['/features/recording'])
  })
})

describe('the site’s own links in text', () => {
  const SITE = 'https://issues.pisspoursoftware.xyz'

  it('reads a product, feature, finding, session and agent page', () => {
    expect(
      tagsIn(
        `${SITE}/products/foldkit ${SITE}/features/recording ${SITE}/findings/${FINDING_ID} ${SITE}/sessions/${SESSION_ID} ${SITE}/agents/claude-code%2Fissues-linear-1538%40al`,
      ),
    ).toEqual([
      'ProductName',
      'FeatureName',
      'FindingId',
      'ChatSession',
      'AgentName',
    ])
  })

  it('shows each as its own chip with its page in the site', () => {
    const chips = chipsIn(
      `${SITE}/products/scribe ${SITE}/features/scroll-back-always ${SITE}/findings/${FINDING_ID}`,
    )
    expect(Array.map(chips, chip => [chip.kind, chip.href])).toEqual([
      ['Product', '/products/scribe'],
      ['Feature', '/features/scroll-back-always'],
      ['Finding', `/findings/${FINDING_ID}`],
    ])
    expect(Array.map(chips, chip => chip.label)).toEqual([
      'Scribe',
      'Scroll back, always.',
      `Finding ${FINDING_ID.slice(0, 8)}`,
    ])
  })
})

describe('a finding and a session named in text', () => {
  it('reads `finding <id>`', () => {
    expect(tagsIn(`From finding ${FINDING_ID}, environment.`)).toEqual([
      'FindingId',
    ])
  })

  it('links a session’s page and says so on hover', () => {
    const [chip] = chipsIn(`Written in session ${SESSION_ID}.`)
    expect(chip?.kind).toBe('Session')
    expect(chip?.href).toBe(`/sessions/${SESSION_ID}`)
    expect(chip?.detail).toContain(`Session ${SESSION_ID}`)
  })

  it('reads agents on every harness', () => {
    expect(
      tagsIn(
        'By pi/pc-proof-910@max-credits and by cursor-grok/triage-p01-930@cursor-ultra.',
      ),
    ).toEqual(['AgentName', 'AgentName'])
    expect(tagsIn('An angle of pi/2.')).toEqual([])
  })
})

describe('what points at each page', () => {
  const issues = [
    blank('1538', `From finding ${FINDING_ID}, in session ${SESSION_ID}.`),
    Issue.make({
      ...blank('0702', 'Plain words.'),
      mentions: [
        IssueMention.make({
          capturedAtMs: Option.some(AT_MS),
          directQuote: Option.none(),
          id: 'mention-702',
          issueId: '0702',
          note: Option.none(),
          related: [
            UriReference.make({
              value: 'https://issues.knophy.com/features/recording',
            }),
          ],
          reporter: Option.none(),
          source: UriReference.make({ value: 'https://example.com' }),
        }),
      ],
    }),
  ]

  it('finds a finding’s, a session’s and a feature’s Issues', () => {
    const ids = (entity: Parameters<typeof backlinksOf>[1]) =>
      Array.map(backlinksOf(issues, entity), backlink => backlink.issue.id)
    expect(ids(FindingEntity.make({ findingId: FINDING_ID }))).toEqual(['1538'])
    expect(ids(SessionEntity.make({ sessionId: SESSION_ID }))).toEqual(['1538'])
    expect(ids(FeatureEntity.make({ slug: 'recording' }))).toEqual(['0702'])
  })

  it('still lists a product’s Issues by its field', () => {
    expect(
      backlinksOf(issues, ProductEntity.make({ productId: 'scribe' })).length,
    ).toBe(2)
  })

  it('says nothing under a feature when only its rows name its Issues', () => {
    const entity = FeatureEntity.make({ slug: 'scroll-back-always' })
    const model = [ObservedIssues.make({ issues })].reduce(
      (current, message) => update(current, message)[0],
      modelForNavigation(EntityPage.make({ entity })),
    )
    expect(
      Array.map(textsOf(issuesScreen(model)), text => text.content),
    ).not.toContain('No Issue points here yet.')
  })
})
