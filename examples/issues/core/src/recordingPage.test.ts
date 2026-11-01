import { Array, Effect, Layer, Option, Stream } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueMention,
  IssueWorkLogEntry,
  RecordingMention,
  RecordingReference,
} from '@foldkit/instant-tools/issues'

import {
  type PageEntity,
  RecordingEntity,
  RecordingNumberEntity,
  SegmentEntity,
} from './entityGraph.js'
import { GraphRows, NoGraphRows } from './graphRows.js'
import { modelForNavigation } from './init.js'
import {
  IssueLandings,
  type LandingsDatabase,
  type LandingsQuery,
  NoIssueLandings,
  type PageFacts,
  instantIssueLandings,
  recordingFactsOf,
  recordingMomentsQuery,
  recordingRowQuery,
  segmentFactsOf,
  segmentFactsQuery,
} from './issueLandings.js'
import {
  ObservedIssues,
  ObservedPageFacts,
  OpenedNavigation,
  TickedClock,
} from './message.js'
import { EntityPage, IssueDetail, type Model } from './model.js'
import { issuesScreen } from './program.js'
import { pathToNavigation } from './route.js'
import { graphSubscriptions } from './subscription.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T14:00:00Z')
const RECORDING_ID = 'faa684c2-34e4-47e5-8f9b-3b2196da9463'
const SAID_AT_MS = Date.parse('2026-10-10T13:00:00Z')
const HOUR_MS = 3_600_000
const AFTER_HE_SAID_IT = SAID_AT_MS + HOUR_MS
const BEFORE_HE_SAID_IT = SAID_AT_MS - 7 * 24 * HOUR_MS
const LINE_52 = '11111111-1111-4111-8111-000000000052'
const LINE_56 = '11111111-1111-4111-8111-000000000056'
const LINE_76 = '3d31675a-e99d-4ee6-b047-32d83878af40'
const LINE_294 = '11111111-1111-4111-8111-000000000294'
const LINE_786 = '11111111-1111-4111-8111-000000000786'

const wordsLink = (segmentId: string, atSeconds: string): string =>
  `https://words.pisspoursoftware.xyz/recording/${RECORDING_ID}/section/${segmentId}?t=${atSeconds}`

const trackedIssue = (number: number, createdAtMs: number) => ({
  createdAtMs,
  id: `row-of-${number.toString()}`,
  number,
})

const moment = (
  id: string,
  fields: Readonly<{
    createdAtMs?: number
    first: number
    issueNumber?: number
    kind?: string
    last?: number
    role: string
    segmentId: string
    startSeconds: number
  }>,
) => ({
  firstLineIndex: fields.first,
  id,
  kind: fields.kind ?? 'said',
  lastLineIndex: fields.last ?? fields.first,
  role: fields.role,
  segmentID: fields.segmentId,
  startSeconds: fields.startSeconds,
  startedAtMs: SAID_AT_MS,
  trackedIssue:
    fields.issueNumber === undefined
      ? []
      : [
          trackedIssue(
            fields.issueNumber,
            fields.createdAtMs ?? AFTER_HE_SAID_IT,
          ),
        ],
})

const introduced620 = moment('m1', {
  first: 52,
  issueNumber: 620,
  role: 'introduced',
  segmentId: LINE_52,
  startSeconds: 930.5,
})
const refined620 = moment('m2', {
  first: 56,
  issueNumber: 620,
  role: 'refined',
  segmentId: LINE_56,
  startSeconds: 980.25,
})
const refined670 = moment('m3', {
  first: 49,
  issueNumber: 670,
  last: 51,
  role: 'refined',
  segmentId: LINE_52,
  startSeconds: 900,
})
const introduced617 = moment('m4', {
  first: 76,
  issueNumber: 617,
  role: 'introduced',
  segmentId: LINE_76,
  startSeconds: 1_359.22,
})
const introducedLate = moment('m5', {
  createdAtMs: BEFORE_HE_SAID_IT,
  first: 786,
  issueNumber: 587,
  role: 'introduced',
  segmentId: LINE_786,
  startSeconds: 5_000,
})
const seenAloud = moment('m6', {
  first: 294,
  issueNumber: 617,
  kind: 'seen',
  role: 'refined',
  segmentId: LINE_294,
  startSeconds: 2_259.17,
})
const fromAnOldBridge = moment('m7', {
  first: 3_037,
  role: 'introduced',
  segmentId: LINE_786,
  startSeconds: 9_000,
})

const storedRecording = {
  durationSeconds: 19_176.74,
  id: RECORDING_ID,
  startedAtMs: SAID_AT_MS,
  title: 'Recording 208',
}

const everyMoment = [
  refined620,
  seenAloud,
  introducedLate,
  fromAnOldBridge,
  introduced617,
  introduced620,
  refined670,
]

const recordingAnswer = {
  recordings: [storedRecording],
  sourceMoments: everyMoment,
}

const blank = (id: string, title: string, fields: object = {}): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: SAID_AT_MS,
    details: '',
    evidenceLogQueries: [],
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P1',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title,
    updatedAtMs: SAID_AT_MS,
    viewerURL: Option.none(),
    workLog: [],
    ...fields,
  })

const catalog = [
  blank('620', 'Agent answers never reach the Apple Watch', {
    details: `Heard in Recording 208 (${RECORDING_ID}).`,
  }),
  blank('617', 'Show posted X posts as rich previews'),
  blank('670', 'Public share links open'),
  blank('587', 'A screenshot lands on the wrong line'),
  blank('1538', 'The issues site as usable as Linear', {
    workLog: [
      IssueWorkLogEntry.make({
        agentId: Option.none(),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: 'work-1',
        occurredAtMs: NOW_MS,
        state: Option.none(),
        summary: `Measured the read of Recording 208 (${RECORDING_ID}) in 1.2 s.`,
      }),
    ],
  }),
]

const pageOf = (entity: PageEntity, facts: PageFacts): Model =>
  [
    ObservedIssues.make({ issues: catalog }),
    TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ObservedPageFacts.make({ entity, facts }),
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(EntityPage.make({ entity })),
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

const chipLabeled = (model: Model, label: string): ReferencePart =>
  Option.getOrThrow(
    Array.findFirst(chipsOf(model), chip => chip.label === label),
  )

const lineOf = (contents: ReadonlyArray<string>, words: string): number =>
  Option.getOrThrow(
    Array.findFirstIndex(contents, content => content.includes(words)),
  )

const recordingEntity = RecordingEntity.make({ recordingId: RECORDING_ID })
const recordingPage = pageOf(recordingEntity, recordingFactsOf(recordingAnswer))

const issueIdsOf = (
  facts: PageFacts,
): Readonly<{
  alsoCameUp: ReadonlyArray<string>
  cameFrom: ReadonlyArray<string>
}> =>
  facts._tag === 'RecordingFacts' || facts._tag === 'SegmentFacts'
    ? {
        alsoCameUp: Array.map(
          facts.issues.alsoCameUp,
          ({ issueId }) => issueId,
        ),
        cameFrom: Array.map(facts.issues.cameFrom, ({ issueId }) => issueId),
      }
    : { alsoCameUp: [], cameFrom: [] }

describe('what a Recording’s page asks of Scribe’s rows', () => {
  const row = recordingRowQuery(RECORDING_ID.toUpperCase())
  const moments = recordingMomentsQuery(RECORDING_ID.toUpperCase())

  it('reads the Recording’s own row and its Issue moments by the lowercase id the rows hold', () => {
    expect(row.recordings.$.where.id).toBe(RECORDING_ID)
    expect(moments.sourceMoments.$.where).toEqual({
      recordingID: RECORDING_ID,
      subjectKind: 'issue',
    })
  })

  it('leaves out the moment’s words, which the page does not paint', () => {
    expect(moments.sourceMoments.$.fields).not.toContain('quote')
    expect(moments.sourceMoments.$.fields).not.toContain('why')
    expect(moments.sourceMoments.trackedIssue.$.fields).toContain('number')
  })

  it('asks for the row and the moments apart, so a live Recording’s length restates one row, not its moments', async () => {
    const queries: Array<LandingsQuery> = []
    const database: LandingsDatabase = {
      subscribeQuery: (asked, onResponse) => {
        queries.push(asked)
        onResponse({
          data:
            'recordings' in asked
              ? { recordings: recordingAnswer.recordings }
              : { sourceMoments: recordingAnswer.sourceMoments },
        })
        return () => undefined
      },
    }
    const landings = instantIssueLandings(Effect.succeed(database))
    const facts = await Effect.runPromise(
      Stream.runHead(
        landings.observeRecordingFacts(RECORDING_ID.toUpperCase()),
      ),
    )
    expect(queries).toEqual([
      recordingRowQuery(RECORDING_ID),
      recordingMomentsQuery(RECORDING_ID),
    ])
    expect(Option.map(facts, ({ _tag }) => _tag)).toEqual(
      Option.some('RecordingFacts'),
    )
  })
})

describe('the Issues a Recording’s rows say came from it', () => {
  const facts = recordingFactsOf(recordingAnswer)

  it('lists each Issue once, in the order he said them, each with its moments', () => {
    const { alsoCameUp, cameFrom } = issueIdsOf(facts)
    expect(cameFrom).toEqual(['620', '617'])
    expect(alsoCameUp).toEqual(['670', '587'])
    const moments =
      facts._tag === 'RecordingFacts'
        ? Array.map(facts.issues.cameFrom, issue =>
            Array.map(issue.moments, ({ firstLineIndex }) => firstLineIndex),
          )
        : []
    expect(moments).toEqual([
      [52, 56],
      [76, 294],
    ])
  })

  it('keeps an Issue that was filed before he said the line out of what came from it', () => {
    expect(issueIdsOf(facts).cameFrom).not.toContain('587')
    expect(issueIdsOf(facts).alsoCameUp).toContain('587')
  })

  it('skips a moment whose row names no Issue', () => {
    const counted =
      facts._tag === 'RecordingFacts'
        ? Array.flatMap(
            [...facts.issues.cameFrom, ...facts.issues.alsoCameUp],
            issue => issue.moments,
          ).length
        : 0
    expect(counted).toBe(everyMoment.length - 1)
  })

  it('orders the same rows the same way however Instant answers them', () => {
    expect(
      recordingFactsOf({
        recordings: [storedRecording],
        sourceMoments: Array.reverse(everyMoment),
      }),
    ).toEqual(facts)
  })

  it('reads a link Instant answers as one row, and a row from before kinds were written as said', () => {
    const { kind: _kind, ...withoutKind } = introduced620
    const read = recordingFactsOf({
      recordings: [storedRecording],
      sourceMoments: [
        {
          ...withoutKind,
          trackedIssue: trackedIssue(620, AFTER_HE_SAID_IT),
        },
      ],
    })
    expect(issueIdsOf(read).cameFrom).toEqual(['620'])
    expect(
      read._tag === 'RecordingFacts'
        ? Array.map(
            Array.flatMap(read.issues.cameFrom, issue => issue.moments),
            ({ kind }) => kind,
          )
        : [],
    ).toEqual(['Said'])
  })

  it('is a Recording with no Issue when the rows hold no moment', () => {
    expect(
      issueIdsOf(
        recordingFactsOf({
          recordings: [storedRecording],
          sourceMoments: [],
        }),
      ),
    ).toEqual({ alsoCameUp: [], cameFrom: [] })
  })
})

describe('a Recording’s page', () => {
  it('says how many Issues came from it, above what came up in it, above what mentions it', () => {
    const contents = contentsOf(recordingPage)
    const cameFrom = lineOf(contents, 'Came from this Recording: 2 Issues')
    const alsoCameUp = lineOf(
      contents,
      'Also came up in this Recording: 2 Issues',
    )
    const mentions = lineOf(contents, 'Mentions this Recording: 2 Issues')
    expect(cameFrom).toBeLessThan(alsoCameUp)
    expect(alsoCameUp).toBeLessThan(mentions)
  })

  it('shows each Issue’s chip beside a chip for each of its moments, on one line', () => {
    const contents = contentsOf(recordingPage)
    const row = Option.getOrThrow(
      Array.findFirst(contents, content => content.includes('#620')),
    )
    expect(row).toContain('#620')
    expect(row).toContain('Line 52')
    expect(row).toContain('Line 56')
    expect(contents.filter(content => content.includes('Line 52'))).toEqual([
      row,
    ])
  })

  it('deep links each moment to his words at the exact time', () => {
    expect(chipLabeled(recordingPage, 'Line 52').href).toBe(
      wordsLink(LINE_52, '930.50'),
    )
    expect(chipLabeled(recordingPage, 'Line 52').kind).toBe('Segment')
    expect(chipLabeled(recordingPage, 'Lines 49-51').href).toBe(
      wordsLink(LINE_52, '900.00'),
    )
    expect(chipLabeled(recordingPage, 'Line 56').detail).toContain(
      'Opens his words at 16:20',
    )
  })

  it('marks the line an Issue came from, on the chip, in words a phone shows', () => {
    expect(chipLabeled(recordingPage, 'Line 52').title).toBe('origin')
    expect(chipLabeled(recordingPage, 'Line 56').title).toBeUndefined()
    expect(chipLabeled(recordingPage, 'Line 786').title).toBeUndefined()
  })

  it('never calls a seen moment his words', () => {
    const seen = chipLabeled(recordingPage, 'Line 294')
    expect(seen.title).toBe('not his words')
    expect(Array.join(seen.detail ?? [], ' ')).not.toContain('Opens his words')
    expect(seen.href).toBe(wordsLink(LINE_294, '2259.17'))
  })

  it('links each Issue to its page, the way to where it landed', () => {
    expect(
      chipsOf(recordingPage).some(
        chip =>
          chip.kind === 'Issue' &&
          chip.href === '/issues/620' &&
          chip.title === 'Agent answers never reach the Apple Watch',
      ),
    ).toBe(true)
  })

  it('keeps every Issue that merely mentions it, under its own heading', () => {
    const contents = contentsOf(recordingPage)
    const mentions = lineOf(contents, 'Mentions this Recording')
    const listed = contents.slice(mentions)
    expect(listed.some(content => content.includes('#1538'))).toBe(true)
    expect(listed.some(content => content.includes('#620'))).toBe(true)
  })

  it('says when no Issue came from it, and still lists what mentions it', () => {
    const contents = contentsOf(
      pageOf(
        recordingEntity,
        recordingFactsOf({ recordings: [storedRecording], sourceMoments: [] }),
      ),
    )
    expect(contents).toContain('No Issue came from this Recording yet.')
    expect(contents).toContain('Mentions this Recording: 2 Issues')
  })

  it('keeps what mentions it while the rows are not read yet', () => {
    const contents = contentsOf(
      update(
        modelForNavigation(EntityPage.make({ entity: recordingEntity })),
        ObservedIssues.make({ issues: catalog }),
      )[0],
    )
    expect(contents).toContain('Mentions this Recording: 2 Issues')
    expect(
      contents.some(content => content.includes('Came from this Recording')),
    ).toBe(false)
  })

  it('heads a Recording named by its number the same way', () => {
    const entity = RecordingNumberEntity.make({ recordingNumber: 208 })
    const contents = contentsOf(
      pageOf(entity, recordingFactsOf(recordingAnswer)),
    )
    expect(contents).toContain('Came from this Recording: 2 Issues')
  })
})

describe('coming back to a Recording’s page', () => {
  const openedFrom = (model: Model, entity: PageEntity): Model =>
    update(
      model,
      OpenedNavigation.make({ navigation: EntityPage.make({ entity }) }),
    )[0]
  const issueOpened = update(
    recordingPage,
    OpenedNavigation.make({
      navigation: IssueDetail.make({ issueId: '620' }),
    }),
  )[0]
  const otherEntity = SegmentEntity.make({ segmentId: LINE_76 })

  it('paints what its rows said at once, at the height Back’s kept scroll needs', () => {
    expect(contentsOf(openedFrom(issueOpened, recordingEntity))).toContain(
      'Came from this Recording: 2 Issues',
    )
  })

  it('paints them at once from another entity’s page too', () => {
    const elsewhere = openedFrom(recordingPage, otherEntity)
    expect(contentsOf(openedFrom(elsewhere, recordingEntity))).toContain(
      'Came from this Recording: 2 Issues',
    )
  })

  it('shows no page what another page read', () => {
    expect(openedFrom(recordingPage, otherEntity).pageFacts._tag).toBe(
      'NotObservingPageFacts',
    )
    expect(issueOpened.pageFacts._tag).toBe('NotObservingPageFacts')
  })

  it('takes the rows’ next answer over what it kept', () => {
    const back = openedFrom(issueOpened, recordingEntity)
    const [answered] = update(
      back,
      ObservedPageFacts.make({
        entity: recordingEntity,
        facts: recordingFactsOf({
          recordings: [storedRecording],
          sourceMoments: [introduced620],
        }),
      }),
    )
    expect(contentsOf(answered)).toContain('Came from this Recording: 1 Issue')
  })
})

describe('a Recording named by its number, /recordings/208', () => {
  const named = blank('620', 'Agent answers never reach the Apple Watch', {
    mentions: [
      IssueMention.make({
        capturedAtMs: Option.some(SAID_AT_MS),
        directQuote: Option.some(
          `Recording 208 (${RECORDING_ID}) #52: the Watch never hears back`,
        ),
        id: 'mention-1',
        issueId: '620',
        related: [],
        reporter: Option.none(),
        source: RecordingReference.make({
          recording: RecordingMention.make({
            endMilliseconds: Option.none(),
            recordingId: RECORDING_ID,
            screenshotIds: [],
            startMilliseconds: 930_500,
          }),
        }),
      }),
    ],
  })
  const entry = graphSubscriptions.selectedEntityFacts
  const opened = modelForNavigation(pathToNavigation('/recordings/208'))
  const loaded = update(opened, ObservedIssues.make({ issues: [named] }))[0]

  it('reads the rows of the Recording its catalog says that number is', () => {
    expect(entry.modelToDependencies(loaded).maybeRecordingId).toEqual(
      Option.some(RECORDING_ID),
    )
  })

  it('reads nothing while no Issue has said which Recording that is', () => {
    expect(entry.modelToDependencies(opened).maybeRecordingId).toEqual(
      Option.none(),
    )
  })

  it('answers with the facts of the page that asked', async () => {
    const asked: Array<string> = []
    const landings = {
      ...NoIssueLandings,
      observeRecordingFacts: (recordingId: string) => {
        asked.push(recordingId)
        return Stream.succeed(recordingFactsOf(recordingAnswer))
      },
    }
    const resources = Layer.mergeAll(
      Layer.succeed(IssueLandings, landings),
      Layer.succeed(GraphRows, NoGraphRows),
    )
    const answer = await Effect.runPromise(
      Stream.runHead(
        entry.dependenciesToStream(entry.modelToDependencies(loaded), () =>
          entry.modelToDependencies(loaded),
        ),
      ).pipe(Effect.provide(resources)),
    )
    expect(asked).toEqual([RECORDING_ID])
    expect(Option.map(answer, ({ _tag }) => _tag)).toEqual(
      Option.some('ObservedPageFacts'),
    )
  })
})

describe('what a line’s page asks of Scribe’s rows', () => {
  const query = segmentFactsQuery(LINE_76.toUpperCase())

  it('reads the Issue moments that cover the line, through the line’s own link', () => {
    expect(query.transcriptionSegments.$.where.id).toBe(LINE_76)
    expect(query.transcriptionSegments.sourceMoments.$.where).toEqual({
      subjectKind: 'issue',
    })
    expect(query.transcriptionSegments.sourceMoments.$.fields).not.toContain(
      'quote',
    )
    expect(
      query.transcriptionSegments.sourceMoments.trackedIssue.$.fields,
    ).toContain('number')
  })
})

describe('a line’s page', () => {
  const entity = SegmentEntity.make({ segmentId: LINE_76 })
  const storedLine = {
    id: LINE_76,
    recordingID: RECORDING_ID,
    segmentIndex: 76,
    startTimeSeconds: 1_359.22,
    text: 'Can you do a test post to X',
    wallClockStartedAtMs: SAID_AT_MS,
  }
  const covering = [
    moment('r670', {
      first: 76,
      issueNumber: 670,
      last: 78,
      role: 'refined',
      segmentId: LINE_76,
      startSeconds: 1_359.22,
    }),
    moment('r617', {
      first: 76,
      issueNumber: 617,
      last: 115,
      role: 'refined',
      segmentId: LINE_76,
      startSeconds: 1_359.22,
    }),
    introduced617,
  ]
  const page = pageOf(
    entity,
    segmentFactsOf({
      transcriptionSegments: [{ ...storedLine, sourceMoments: covering }],
    }),
  )

  it('lists each Issue whose moments cover it once, what came from it first', () => {
    const contents = contentsOf(page)
    const cameFrom = lineOf(contents, 'Came from this line: 1 Issue')
    const alsoCameUp = lineOf(contents, 'Also came up on this line: 1 Issue')
    expect(cameFrom).toBeLessThan(alsoCameUp)
    expect(contents.filter(content => content.includes('#617'))).toHaveLength(1)
  })

  it('links each Issue, the second of the two clicks to where it landed', () => {
    expect(
      chipsOf(page).some(
        chip => chip.kind === 'Issue' && chip.href === '/issues/617',
      ),
    ).toBe(true)
  })

  it('says when no Issue came from it', () => {
    expect(
      contentsOf(
        pageOf(entity, segmentFactsOf({ transcriptionSegments: [storedLine] })),
      ),
    ).toContain('No Issue came from this line yet.')
  })

  it('does not call a line only seen his words', () => {
    const seenLine = {
      ...storedLine,
      id: LINE_294,
      segmentIndex: 294,
      sourceMoments: [seenAloud],
      startTimeSeconds: 2_259.17,
      text: 'Your go aheads are marked top priority.',
    }
    const model = pageOf(
      SegmentEntity.make({ segmentId: LINE_294 }),
      segmentFactsOf({ transcriptionSegments: [seenLine] }),
    )
    const contents = contentsOf(model)
    expect(contents).toContain('These words are not his.')
    expect(contents.some(content => content.startsWith('Said '))).toBe(false)
    expect(
      Array.join(chipLabeled(model, 'Line 294').detail ?? [], ' '),
    ).not.toContain('Opens his words')
  })

  it('still calls a line his words when a said moment covers it', () => {
    const contents = contentsOf(page)
    expect(contents.some(content => content.startsWith('Said '))).toBe(true)
    expect(contents).not.toContain('These words are not his.')
  })
})
