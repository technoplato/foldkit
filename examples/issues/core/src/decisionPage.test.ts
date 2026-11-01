import { Array, Effect, Option, Stream } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import {
  type ChipFacts,
  chipContextOf,
  noChipFacts,
  partsOfText,
} from './chips.js'
import {
  type DecisionRow,
  decisionFactsOf,
  decisionFactsQuery,
  decisionsOf,
  decisionsQuery,
} from './decisionFacts.js'
import { DecisionEntity, backlinksOf } from './entityGraph.js'
import { instantGraphRows } from './graphRows.js'
import { modelForNavigation } from './init.js'
import { type IssueLandingError, type PageFacts } from './issueLandings.js'
import {
  FailedObserveDecisions,
  ObservedDecisions,
  ObservedIssues,
  ObservedPageFacts,
  TickedClock,
} from './message.js'
import { DecisionFilter, Decisions, EntityPage, type Model } from './model.js'
import { pageReadsDecisions } from './pageAgents.js'
import { issuesScreen } from './program.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { readTextReferences } from './textReferences.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T17:00:00Z')
const DECIDED_AT_MS = Date.parse('2026-10-29T14:15:00Z')
const DECISION_ID = 'dbdbf773-f596-5657-a3d4-554a11755709'
const SHORT_ID = 'dbdbf773'
const LATER_ID = '7f83993d-0fd4-5a10-9e0b-5e2a0a6f1c11'
const OLDER_ID = '58ca646e-2f9b-5cd1-8a41-0c8e6d3b7a22'
const CANDIDATE_ID = 'a3fe7871-1c3d-5e8f-b2a6-7d9e0f1a2b33'
const ALL_DIGITS_ID = '42014021-d4c2-5190-a7a0-9753d191c877'
const RECORDING_ID = 'c975fdff-dd92-440b-a371-3cf810ae188b'
const SEGMENT_ID = '2f6e1a0c-df46-4d5a-909f-c3665eaaf454'

const storedDecision = {
  decidedAtMs: DECIDED_AT_MS,
  id: DECISION_ID,
  issueNumbersJSON: '[1393,1394]',
  recordingID: RECORDING_ID,
  status: 'superseded',
  supersededByID: LATER_ID,
  text: 'One Opus agent takes every UI task at once.',
}

const storedLater = {
  decidedAtMs: DECIDED_AT_MS + 86_400_000,
  id: LATER_ID,
  status: 'decided',
  text: 'First users come before performance.',
}

const storedOlder = {
  decidedAtMs: DECIDED_AT_MS - 86_400_000,
  id: OLDER_ID,
  status: 'superseded',
  supersededByID: DECISION_ID,
  text: 'Each UI task gets its own agent.',
}

const storedCandidate = {
  decidedAtMs: DECIDED_AT_MS - 2 * 86_400_000,
  id: CANDIDATE_ID,
  status: 'unconfirmed',
  text: 'Maybe the listener queues UI tasks.',
}

const decisions = decisionsOf({
  decisions: [storedOlder, storedDecision, storedCandidate, storedLater],
})

const saidMoment = {
  firstLineIndex: 87,
  id: 'moment-said',
  kind: 'said',
  lastLineIndex: 100,
  quote: 'I think maybe we should have uh one opus subagent for UI tasks.',
  recordingID: RECORDING_ID,
  role: 'decided',
  segmentID: SEGMENT_ID,
  startSeconds: 824.064,
  startedAtMs: DECIDED_AT_MS,
}

const typedMoment = {
  id: 'moment-typed',
  kind: 'typed',
  quote: 'Yes, keep that trial going.',
  role: 'refined',
  startedAtMs: DECIDED_AT_MS + 3_600_000,
}

const factsOfDecision = Option.getOrThrow(
  decisionFactsOf({
    decisions: [
      {
        ...storedDecision,
        moments: [typedMoment, saidMoment],
        note: 'The recorder heard it as a rule for this trial.',
        recordedBy: 'claude-code-feedback-1455-al',
        replaces: 'Firing off a new agent per UI task.',
        source: 'listener',
      },
    ],
  }),
)

const blank = (id: string, title: string, details = ''): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: DECIDED_AT_MS,
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
    title,
    updatedAtMs: DECIDED_AT_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const catalog = [
  blank('1393', 'One UI agent', `Goes to one agent (decision ${SHORT_ID}).`),
  blank('1394', 'The decision log'),
  blank('1455', 'Cited bare', `Seeded a3fe7871, a208e30c, ${SHORT_ID}, clean.`),
  blank('041', 'Names nothing'),
]

const opened = (
  path: string,
  ...messages: ReadonlyArray<Parameters<typeof update>[1]>
): Model =>
  [
    ObservedIssues.make({ issues: catalog }),
    TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ...messages,
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(pathToNavigation(path)),
  )

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const chipsOf = (model: Model): ReadonlyArray<ReferencePart> =>
  Array.flatMap(textsOf(issuesScreen(model)), text =>
    Array.filter(
      text.parts ?? [],
      (part): part is ReferencePart => part._tag === 'Reference',
    ),
  )

const chipsOfText = (
  text: string,
  facts: ChipFacts = noChipFacts,
): ReadonlyArray<ReferencePart> =>
  Array.filter(
    partsOfText(text, chipContextOf(catalog, NOW_MS, 'America/New_York', facts)),
    (part): part is ReferencePart => part._tag === 'Reference',
  )

const withRows: ChipFacts = { ...noChipFacts, decisions }

describe('what a decision’s rows read', () => {
  it('holds the newest first, with its Issues as a list', () => {
    expect(Array.map(decisions, (row: DecisionRow) => row.decisionId)).toEqual([
      LATER_ID,
      DECISION_ID,
      OLDER_ID,
      CANDIDATE_ID,
    ])
    expect(
      Option.map(
        Array.findFirst(decisions, row => row.decisionId === DECISION_ID),
        row => row.issueIds,
      ),
    ).toEqual(Option.some(['1393', '1394']))
  })

  it('reads every decision’s scalars once, with no link per row', () => {
    const { $, ...links } = decisionsQuery.decisions
    expect('limit' in $).toBe(false)
    expect(Object.keys(links)).toEqual([])
  })

  it('reads a decision by its id, with its moments', () => {
    const query = decisionFactsQuery(DECISION_ID).decisions
    expect(query.$.where).toEqual({ id: DECISION_ID })
    expect(Object.keys(query)).toContain('moments')
  })

  it('holds his words in the order he said them', () => {
    expect(
      Array.map(factsOfDecision.moments, moment => moment.momentId),
    ).toEqual(['moment-said', 'moment-typed'])
  })
})

describe('a decision in text', () => {
  it.each([
    `decision ${SHORT_ID}`,
    `Decision ${SHORT_ID}`,
    `decisions ${SHORT_ID}`,
    `decision log entry ${SHORT_ID}`,
    `scribe decision show ${SHORT_ID}`,
    `Decision: ${SHORT_ID}`,
    `decision ${DECISION_ID}`,
    `https://issues.pisspoursoftware.xyz/decisions/${DECISION_ID}`,
  ])('reads %s', text => {
    expect(
      Array.flatMap(readTextReferences(text), piece =>
        piece._tag === 'Referenced' && piece.reference._tag === 'DecisionId'
          ? [piece.reference.decisionId.slice(0, SHORT_ID.length)]
          : [],
      ),
    ).toEqual([SHORT_ID])
  })

  it('reads a decision whose id has only digits', () => {
    const [chip] = chipsOfText('decision 42014021 holds')
    expect(chip?.href).toBe('/decisions/42014021')
    expect(ALL_DIGITS_ID.startsWith('42014021')).toBe(true)
  })

  it('draws the sentence and its state from the row', () => {
    expect(chipsOfText(`See decision ${SHORT_ID}.`, withRows)).toEqual([
      expect.objectContaining({
        href: `/decisions/${DECISION_ID}`,
        kind: 'Decision',
        label: `decision ${SHORT_ID}`,
        state: 'superseded',
        title: 'One Opus agent takes every UI task at once.',
      }),
    ])
  })

  it('links by the words alone until the row is read', () => {
    expect(chipsOfText(`See decision ${SHORT_ID}.`)).toEqual([
      expect.objectContaining({
        href: `/decisions/${SHORT_ID}`,
        kind: 'Decision',
        label: `decision ${SHORT_ID}`,
      }),
    ])
  })

  it('finds a bare id that a row holds, and leaves any other id alone', () => {
    const chips = chipsOfText(`Seeded a208e30c and ${SHORT_ID}.`, withRows)
    expect(Array.map(chips, chip => chip.kind)).toEqual(['Id', 'Decision'])
  })
})

describe('/decisions', () => {
  const noFilter = DecisionFilter.make({ maybeStatus: Option.none() })

  it('routes the list, its state and one decision', () => {
    const path = '/decisions?status=superseded'
    const navigation = pathToNavigation(path)
    expect(navigation).toEqual(
      Decisions.make({
        filter: DecisionFilter.make({ maybeStatus: Option.some('superseded') }),
      }),
    )
    expect(navigationToPath(navigation)).toBe(path)
    expect(navigationToPath(Decisions.make({}))).toBe('/decisions')
    expect(pathToNavigation(`/decisions/${SHORT_ID}`)).toEqual(
      EntityPage.make({
        entity: DecisionEntity.make({ decisionId: SHORT_ID }),
      }),
    )
  })

  it('lists every decision, the sentence with its state, Issues and when', () => {
    const model = opened('/decisions', ObservedDecisions.make({ decisions }))
    expect(navigationToPath(Decisions.make({ filter: noFilter }))).toBe(
      '/decisions',
    )
    const contents = contentsOf(model)
    expect(contents).toContain('One Opus agent takes every UI task at once.')
    expect(contents).toContain('Maybe the listener queues UI tasks.')
    expect(contents).toContainEqual(expect.stringContaining('4 decisions'))
    const chips = chipsOf(model)
    expect(
      chips.some(
        chip =>
          chip.kind === 'Decision' &&
          chip.href === `/decisions/${DECISION_ID}` &&
          chip.state === 'superseded',
      ),
    ).toBe(true)
    expect(chips.some(chip => chip.href === '/issues/1393')).toBe(true)
    expect(contents).toContainEqual(expect.stringContaining('3 days ago'))
  })

  it('never reads a candidate as his', () => {
    expect(
      contentsOf(opened('/decisions', ObservedDecisions.make({ decisions }))),
    ).toContainEqual(
      expect.stringContaining('A candidate is not his until he confirms it'),
    )
  })

  it('counts each state as a link that narrows, keeping the whole counts', () => {
    const model = opened(
      '/decisions?status=unconfirmed',
      ObservedDecisions.make({ decisions }),
    )
    const contents = contentsOf(model)
    expect(contents).toContain('Maybe the listener queues UI tasks.')
    expect(contents).not.toContain('First users come before performance.')
    expect(contents).toContainEqual(expect.stringContaining('1 of 4 decisions'))
    expect(
      Option.map(
        Array.findFirst(
          chipsOf(model),
          chip => chip.href === '/decisions?status=superseded',
        ),
        chip => chip.title,
      ),
    ).toEqual(Option.some('2'))
  })

  it('lists every decision, with no cutoff', () => {
    const many = decisionsOf({
      decisions: Array.makeBy(600, index => ({
        ...storedLater,
        id: `decision-${index.toString()}`,
        text: `Rule ${index.toString()}`,
      })),
    })
    expect(
      Array.filter(
        contentsOf(
          opened('/decisions', ObservedDecisions.make({ decisions: many })),
        ),
        content => content.startsWith('Rule '),
      ).length,
    ).toBe(600)
  })

  it('says why when the rows could not be read', () => {
    expect(
      contentsOf(
        opened(
          '/decisions',
          FailedObserveDecisions.make({ reason: 'Permission denied' }),
        ),
      ),
    ).toContain('Scribe’s rows could not be read: Permission denied')
  })
})

describe('a decision’s own page', () => {
  const entity = DecisionEntity.make({ decisionId: DECISION_ID })
  const page = (): Model =>
    opened(
      `/decisions/${DECISION_ID}`,
      ObservedDecisions.make({ decisions }),
      ObservedPageFacts.make({ entity, facts: factsOfDecision }),
    )

  it('says the sentence, its state, and when and how long ago', () => {
    const contents = contentsOf(page())
    expect(contents).toContain('One Opus agent takes every UI task at once.')
    expect(contents).toContainEqual(expect.stringContaining('superseded'))
    expect(contents).toContainEqual(
      expect.stringContaining('2026-10-29 10:15 (3 days ago)'),
    )
  })

  it('shows his exact words, a moment deep linking the words at its time', () => {
    const model = page()
    expect(contentsOf(model)).toContain(saidMoment.quote)
    expect(chipsOf(model)).toContainEqual(
      expect.objectContaining({
        href: `https://words.pisspoursoftware.xyz/recording/${RECORDING_ID}/section/${SEGMENT_ID}?t=824.06`,
        label: `Recording ${RECORDING_ID.slice(0, 8)} #87-100`,
      }),
    )
  })

  it('shows a typed moment’s words, with nowhere to link', () => {
    const model = page()
    expect(contentsOf(model)).toContain(typedMoment.quote)
    expect(
      chipsOf(model).some(
        chip => chip.label === 'Typed' && chip.href === undefined,
      ),
    ).toBe(true)
  })

  it('links what superseded it and what it superseded', () => {
    const chips = chipsOf(page())
    expect(
      chips.some(
        chip =>
          chip.href === `/decisions/${LATER_ID}` &&
          chip.title === 'First users come before performance.',
      ),
    ).toBe(true)
    expect(
      chips.some(
        chip =>
          chip.href === `/decisions/${OLDER_ID}` &&
          chip.title === 'Each UI task gets its own agent.',
      ),
    ).toBe(true)
    expect(contentsOf(page())).toContain('Firing off a new agent per UI task.')
  })

  it('links the Issues it names, and who recorded it', () => {
    const model = page()
    expect(chipsOf(model).some(chip => chip.href === '/issues/1394')).toBe(true)
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('Recorded by claude-code-feedback-1455-al'),
    )
    expect(contentsOf(model)).toContainEqual(
      expect.stringContaining('The recorder heard it as a rule'),
    )
  })

  it('lists the Issues whose words cite it, by its word or its bare id', () => {
    expect(
      Array.map(backlinksOf(catalog, entity), backlink => backlink.issue.id),
    ).toEqual(expect.arrayContaining(['1393', '1455']))
    expect(contentsOf(page())).toContainEqual(
      expect.stringContaining('2 Issues point here'),
    )
  })

  it('keeps its page by a short id', () => {
    expect(
      Array.map(
        backlinksOf(catalog, DecisionEntity.make({ decisionId: SHORT_ID })),
        backlink => backlink.issue.id,
      ),
    ).toEqual(expect.arrayContaining(['1393', '1455']))
  })
})

describe('when the table is read', () => {
  it('stays closed on the list until a page asks, then stays open', () => {
    const list = modelForNavigation(pathToNavigation('/issues'))
    expect(pageReadsDecisions(list)).toBe(false)
    expect(
      pageReadsDecisions(modelForNavigation(pathToNavigation('/issues/1393'))),
    ).toBe(true)
    expect(pageReadsDecisions(modelForNavigation(Decisions.make({})))).toBe(
      true,
    )
    expect(
      pageReadsDecisions(
        update(list, ObservedDecisions.make({ decisions }))[0],
      ),
    ).toBe(true)
  })
})

describe('how a decision reads in words', () => {
  it('takes its word into the chip, so it is not said twice', () => {
    expect(
      Array.map(
        partsOfText(
          `Per decision ${SHORT_ID}, done.`,
          chipContextOf(catalog, NOW_MS, 'America/New_York', withRows),
        ),
        part => (part._tag === 'Reference' ? part.label : part.text),
      ),
    ).toEqual(['Per ', `decision ${SHORT_ID}`, ', done.'])
  })
})

describe('a page opened by a short id', () => {
  const openedBy = (id: string): Stream.Stream<PageFacts, IssueLandingError> =>
    instantGraphRows(
      Effect.succeed({
        subscribeQuery: (query, onResponse) => {
          const isOneRow = 'decisions' in query && 'where' in query.decisions.$
          onResponse({
            data: {
              decisions: isOneRow
                ? [
                    {
                      ...storedDecision,
                      moments: [],
                      recordedBy: 'agent',
                      source: 'listener',
                    },
                  ]
                : [storedLater, storedDecision],
            },
          })
          return () => undefined
        },
        updateFinding: () => Promise.resolve(),
      }),
    ).observeDecisionFacts(id)

  it('finds the row through the table, then reads the row by its id', async () => {
    const facts = await Effect.runPromise(Stream.runHead(openedBy(SHORT_ID)))
    expect(
      Option.map(facts, found =>
        found._tag === 'DecisionFacts' ? found.decision.decisionId : found._tag,
      ),
    ).toEqual(Option.some(DECISION_ID))
  })

  it('says none when no row starts with it', async () => {
    const facts = await Effect.runPromise(Stream.runHead(openedBy('00000000')))
    expect(Option.map(facts, found => found._tag)).toEqual(
      Option.some('NoPageFacts'),
    )
  })
})
