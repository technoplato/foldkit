import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import {
  type ChipFacts,
  chipContextOf,
  noChipFacts,
  partsOfText,
} from './chips.js'
import { QuestionEntity, backlinksOf } from './entityGraph.js'
import { modelForNavigation } from './init.js'
import {
  FailedObserveQuestions,
  ObservedIssues,
  ObservedPageFacts,
  TickedClock,
  observedQuestionsOf,
} from './message.js'
import { EntityPage, type Model, QuestionFilter, Questions } from './model.js'
import { issuesScreen } from './program.js'
import {
  keptQuestionsOf,
  questionFactsOf,
  questionFactsQuery,
  questionsOf,
  questionsQuery,
} from './questionFacts.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { readTextReferences } from './textReferences.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T17:00:00Z')
const ASKED_AT_MS = Date.parse('2026-10-29T14:15:00Z')
const QUESTION_ID = '4e740f44-7fba-5a34-a531-a6cbb76f328c'
const SHORT_ID = '4e740f44'
const OPEN_ID = '85e1d773-77b3-5c9a-9266-793fbfdd5f2b'
const RECORDING_ID = 'c975fdff-dd92-440b-a371-3cf810ae188b'
const SEGMENT_ID = '2f6e1a0c-df46-4d5a-909f-c3665eaaf454'

const storedAnswered = {
  askedAtMs: ASKED_AT_MS,
  askedBy: 'michael',
  id: QUESTION_ID,
  issueNumbersJSON: '[1176]',
  learning: false,
  recordingID: RECORDING_ID,
  status: 'answered',
  text: 'Which Scribe build is running on his phone?',
}

const storedOpen = {
  askedAtMs: ASKED_AT_MS - 86_400_000,
  askedBy: 'agent',
  askerName: 'claude-code-feedback',
  id: OPEN_ID,
  learning: true,
  status: 'open',
  text: 'Can two phones measure how far apart they are?',
}

const questions = questionsOf({ questions: [storedOpen, storedAnswered] })

const moment = {
  firstLineIndex: 56,
  id: 'moment-asked',
  kind: 'said',
  lastLineIndex: 59,
  quote: 'Which Scribe build am I actually on right now?',
  recordingID: RECORDING_ID,
  role: 'asked',
  segmentID: SEGMENT_ID,
  startSeconds: 12.5,
  startedAtMs: ASKED_AT_MS,
}

const answer = {
  answeredAtMs: ASKED_AT_MS + 180_000,
  answeredBy: 'agent',
  answererName: 'claude-code-2',
  id: 'answer-1',
  questionID: QUESTION_ID,
  text: 'You’re on 137. It installed on your phone at 9:57.',
  threadID: '263d7793-a29d-5256-83fe-57a80440dc08',
  url: 'https://developer.apple.com/nearby-interaction/',
}

const earlierAnswer = {
  ...answer,
  answeredAtMs: ASKED_AT_MS + 60_000,
  answererName: 'Michael',
  answeredBy: 'michael',
  id: 'answer-0',
  text: 'I checked: it was 137.',
  url: null,
}

const factsOfQuestion = Option.getOrThrow(
  questionFactsOf({
    questions: [
      {
        ...storedAnswered,
        answers: [answer, earlierAnswer],
        moments: [moment],
        note: 'He wants to know which build a test covers.',
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
    createdAtMs: ASKED_AT_MS,
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
    updatedAtMs: ASKED_AT_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const catalog = [
  blank('1176', 'Keep his questions', `Kept question ${SHORT_ID} first.`),
  blank(
    '1048',
    'Cited bare',
    `Kept its first question within minutes (${SHORT_ID}).`,
  ),
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

const withRows: ChipFacts = { ...noChipFacts, questions }

describe('what a question’s rows read', () => {
  it('holds the newest first', () => {
    expect(Array.map(questions, row => row.questionId)).toEqual([
      QUESTION_ID,
      OPEN_ID,
    ])
  })

  it('reads every question’s scalars with no link per row', () => {
    const { $, ...links } = questionsQuery.questions
    expect('limit' in $).toBe(false)
    expect(Object.keys(links)).toEqual([])
  })

  it('reads a question by its id, with its moments and answers', () => {
    const query = questionFactsQuery(QUESTION_ID).questions
    expect(query.$.where).toEqual({ id: QUESTION_ID })
    expect(Object.keys(query)).toEqual(
      expect.arrayContaining(['answers', 'moments']),
    )
  })

  it('holds the answers in the order they came', () => {
    expect(Array.map(factsOfQuestion.answers, found => found.answerId)).toEqual(
      ['answer-0', 'answer-1'],
    )
  })

  it('keeps a row that did not change, so a live change builds one row', () => {
    const keep = keptQuestionsOf()
    const first = keep({ questions: [storedOpen, storedAnswered] })
    const second = keep({
      questions: [storedOpen, { ...storedAnswered, status: 'open' }],
    })
    const row = (
      rows: typeof first,
      questionId: string,
    ): Option.Option<(typeof first)[number]> =>
      Array.findFirst(rows, found => found.questionId === questionId)
    expect(Option.getOrThrow(row(second, OPEN_ID))).toBe(
      Option.getOrThrow(row(first, OPEN_ID)),
    )
    expect(Option.getOrThrow(row(second, QUESTION_ID)).status).toBe('open')
  })
})

describe('a question in text', () => {
  it.each([
    `question ${SHORT_ID}`,
    `Question ${SHORT_ID}`,
    `question ${QUESTION_ID}`,
    `https://issues.pisspoursoftware.xyz/questions/${QUESTION_ID}`,
  ])('reads %s', text => {
    expect(
      Array.flatMap(readTextReferences(text), piece =>
        piece._tag === 'Referenced' && piece.reference._tag === 'QuestionId'
          ? [piece.reference.questionId.slice(0, SHORT_ID.length)]
          : [],
      ),
    ).toEqual([SHORT_ID])
  })

  it('draws the sentence and its state from the row', () => {
    expect(chipsOfText(`See question ${SHORT_ID}.`, withRows)).toEqual([
      expect.objectContaining({
        href: `/questions/${QUESTION_ID}`,
        kind: 'Question',
        label: `question ${SHORT_ID}`,
        state: 'answered',
        title: 'Which Scribe build is running on his phone?',
      }),
    ])
  })

  it('links by the words alone until the row is read', () => {
    expect(chipsOfText(`See question ${SHORT_ID}.`)).toEqual([
      expect.objectContaining({
        href: `/questions/${SHORT_ID}`,
        kind: 'Question',
        label: `question ${SHORT_ID}`,
      }),
    ])
  })

  it('names no page once every question is read and none has the id', () => {
    expect(
      chipsOfText('first real question c8f44981 open', {
        ...withRows,
        isEveryQuestionRead: true,
      }),
    ).toEqual([expect.objectContaining({ kind: 'Id', label: 'c8f44981' })])
  })

  it('finds a bare id that a row holds', () => {
    expect(
      Array.map(
        chipsOfText(`Kept (${SHORT_ID}).`, withRows),
        chip => chip.kind,
      ),
    ).toEqual(['Question'])
  })
})

describe('/questions', () => {
  it('routes the list, its state, what he is learning and one question', () => {
    const path = '/questions?status=open&learning=yes'
    const navigation = pathToNavigation(path)
    expect(navigation).toEqual(
      Questions.make({
        filter: QuestionFilter.make({
          isLearningOnly: true,
          maybeStatus: Option.some('open'),
        }),
      }),
    )
    expect(navigationToPath(navigation)).toBe(path)
    expect(navigationToPath(Questions.make({}))).toBe('/questions')
    expect(pathToNavigation(`/questions/${SHORT_ID}`)).toEqual(
      EntityPage.make({
        entity: QuestionEntity.make({ questionId: SHORT_ID }),
      }),
    )
  })

  it('lists every question, its sentence with its state, Issues and when', () => {
    const model = opened('/questions', observedQuestionsOf(questions))
    const contents = contentsOf(model)
    expect(contents).toContain('Which Scribe build is running on his phone?')
    expect(contents).toContain('Can two phones measure how far apart they are?')
    expect(contents).toContainEqual(expect.stringContaining('2 questions'))
    expect(contents).toContainEqual(expect.stringContaining('3 days ago'))
    expect(chipsOf(model).some(chip => chip.href === '/issues/1176')).toBe(true)
  })

  it('links an Issue the sentence names, and keeps it fresh', () => {
    const named = questionsOf({
      questions: [
        { ...storedOpen, text: 'Can it be forwarded? Filed as #1176.' },
      ],
    })
    const model = opened('/questions', observedQuestionsOf(named))
    expect(
      chipsOf(model).filter(chip => chip.href === '/issues/1176').length,
    ).toBe(1)
    const renamed = update(
      model,
      ObservedIssues.make({
        issues: [blank('1176', 'A new title'), ...catalog.slice(1)],
      }),
    )[0]
    expect(
      chipsOf(renamed).some(
        chip => chip.href === '/issues/1176' && chip.title === 'A new title',
      ),
    ).toBe(true)
  })

  it('counts each state and what he is learning as links that narrow', () => {
    const model = opened(
      '/questions?learning=yes',
      observedQuestionsOf(questions),
    )
    const contents = contentsOf(model)
    expect(contents).toContain('Can two phones measure how far apart they are?')
    expect(contents).not.toContain(
      'Which Scribe build is running on his phone?',
    )
    expect(contents).toContainEqual(expect.stringContaining('1 of 2 questions'))
    const titleOf = (href: string): Option.Option<string | undefined> =>
      Option.map(
        Array.findFirst(chipsOf(model), chip => chip.href === href),
        chip => chip.title,
      )
    expect(titleOf('/questions?status=answered')).toEqual(Option.some('1'))
    expect(titleOf('/questions?learning=yes')).toEqual(Option.some('1'))
  })

  it('lists every question, with no cutoff', () => {
    const many = questionsOf({
      questions: Array.makeBy(1_000, index => ({
        ...storedOpen,
        id: `question-${index.toString()}`,
        text: `Asked ${index.toString()}`,
      })),
    })
    expect(
      Array.filter(
        contentsOf(opened('/questions', observedQuestionsOf(many))),
        content => content.startsWith('Asked '),
      ).length,
    ).toBe(1_000)
  })

  it('says why when the rows could not be read', () => {
    expect(
      contentsOf(
        opened(
          '/questions',
          FailedObserveQuestions.make({ reason: 'Permission denied' }),
        ),
      ),
    ).toContain('Scribe’s rows could not be read: Permission denied')
  })
})

describe('a question’s own page', () => {
  const entity = QuestionEntity.make({ questionId: QUESTION_ID })
  const page = (): Model =>
    opened(
      `/questions/${QUESTION_ID}`,
      ObservedPageFacts.make({ entity, facts: factsOfQuestion }),
    )

  it('says the sentence, who asked, its state, and when and how long ago', () => {
    const contents = contentsOf(page())
    expect(contents).toContain('Which Scribe build is running on his phone?')
    expect(contents).toContainEqual(expect.stringContaining('Asked by him'))
    expect(contents).toContainEqual(
      expect.stringContaining('2026-10-29 10:15 (3 days ago)'),
    )
  })

  it('shows his exact words, a moment deep linking the words at its time', () => {
    const model = page()
    expect(contentsOf(model)).toContain(moment.quote)
    expect(chipsOf(model)).toContainEqual(
      expect.objectContaining({
        href: `https://words.pisspoursoftware.xyz/recording/${RECORDING_ID}/section/${SEGMENT_ID}?t=12.50`,
        label: `Recording ${RECORDING_ID.slice(0, 8)} #56-59`,
      }),
    )
  })

  it('shows each answer, who gave it, when and how soon after he asked', () => {
    const contents = contentsOf(page())
    expect(contents).toContainEqual(expect.stringContaining('You’re on 137.'))
    expect(contents).toContainEqual(expect.stringContaining('claude-code-2'))
    expect(contents).toContainEqual(expect.stringContaining('3 min after'))
    expect(contents).toContainEqual(expect.stringContaining('Michael'))
  })

  it('links the source an answer cites and the Issues it names', () => {
    const chips = chipsOf(page())
    expect(chips.some(chip => chip.href === answer.url)).toBe(true)
    expect(chips.some(chip => chip.href === '/issues/1176')).toBe(true)
  })

  it('keeps the listener’s reading', () => {
    expect(contentsOf(page())).toContainEqual(
      expect.stringContaining('which build a test covers'),
    )
  })

  it('lists the Issues whose words cite it, by its word or its bare id', () => {
    expect(
      Array.map(backlinksOf(catalog, entity), backlink => backlink.issue.id),
    ).toEqual(expect.arrayContaining(['1176', '1048']))
    expect(contentsOf(page())).toContainEqual(
      expect.stringContaining('2 Issues point here'),
    )
  })

  it('says when the rows hold no such question', () => {
    expect(
      contentsOf(
        update(
          opened(`/questions/${SHORT_ID}`),
          ObservedPageFacts.make({
            entity: QuestionEntity.make({ questionId: SHORT_ID }),
            facts: { _tag: 'NoPageFacts' },
          }),
        )[0],
      ),
    ).toContain('Scribe’s rows hold no such question.')
  })
})
