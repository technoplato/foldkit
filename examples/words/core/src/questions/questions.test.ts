import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { decodeQuestions } from './decode.js'
import {
  ClickedQuestionFilter,
  FailedObserveQuestions,
  ObservedQuestions,
  UpdatedQuestionSearch,
} from './message.js'
import {
  FailedQuestions,
  LoadedQuestions,
  type Model,
  type Question,
  countFor,
  init,
  listedQuestionsOf,
  matchesSearch,
} from './model.js'
import { update, withSearch } from './update.js'

const R297 = '3b1d645a-cef4-4ba6-9acd-c52583ade335'

const proximityRow = {
  id: '85e1d773-77b3-5c9a-9266-793fbfdd5f2b',
  text: 'What proximity APIs does iOS have, to tell how far the phone is from his AirPods?',
  askedBy: 'michael',
  learning: true,
  status: 'answered',
  recordingID: R297,
  askedAtMs: 1_792_932_969_000,
  issueNumbersJSON: '[1176]',
  answers: [
    {
      id: 'f094c911-01ea-5964-99a5-57ed3d5d6224',
      answeredBy: 'agent',
      answererName: 'claude-code-2',
      text: 'Best fit: Nearby Interaction, the ultra-wideband chip.',
      threadID: '95585d86-642f-5a53-b5e4-542f40b7c27b',
      answeredAtMs: 1_792_933_031_975,
      moments: [],
    },
  ],
  moments: [
    {
      id: 'm1',
      role: 'asked',
      recordingID: R297,
      segmentID: '53116f05-ac09-4eb2-9df4-8acffd3276cc',
      firstLineIndex: 56,
      lastLineIndex: 59,
      startSeconds: 2368.72,
      startedAtMs: 1_792_932_969_000,
      quote: `"Wonder if there's any way to detect proximity." "to airpods." "What is there?"`,
    },
  ],
  topics: [{ id: 't1', path: 'scribe/recording/live', title: 'Live capture' }],
}

const buildRow = {
  id: '4e740f44-7fba-5a34-a531-a6cbb76f328c',
  text: 'Which Scribe build is running on his iPhone: 137, or did a new version just install?',
  askedBy: 'michael',
  learning: false,
  status: 'open',
  recordingID: R297,
  askedAtMs: 1_792_939_000_000,
  note: null,
  answers: [],
  moments: [],
  topics: [],
}

const loaded = (
  rows: ReadonlyArray<unknown>,
  overrides: Partial<Model> = {},
): Model => {
  const { questions, unreadableCount } = decodeQuestions(rows)
  return {
    ...init(),
    ...overrides,
    state: LoadedQuestions({ questions, unreadableCount }),
  }
}

const textsOf = (questions: ReadonlyArray<Question>): ReadonlyArray<string> =>
  Array.map(questions, question => question.text)

describe('decodeQuestions', () => {
  it('reads a question with its stretches, answers, topics and issues', () => {
    const { questions, unreadableCount } = decodeQuestions([proximityRow])
    expect(unreadableCount).toBe(0)
    const [question] = questions
    expect(question?.askedBy).toBe('Michael')
    expect(question?.isLearning).toBe(true)
    expect(question?.status).toBe('Answered')
    expect(question?.issueNumbers).toEqual([1176])
    expect(question?.stretches).toEqual([
      {
        recordingID: R297,
        segmentID: '53116f05-ac09-4eb2-9df4-8acffd3276cc',
        firstLineIndex: 56,
        lastLineIndex: 59,
        startSeconds: 2368.72,
        startedAtMs: 1_792_932_969_000,
        quote: `"Wonder if there's any way to detect proximity." "to airpods." "What is there?"`,
        role: 'Asked',
      },
    ])
    expect(question?.answers[0]?.answeredBy).toBe('Agent')
    expect(question?.answers[0]?.maybeThreadID).toEqual(
      Option.some('95585d86-642f-5a53-b5e4-542f40b7c27b'),
    )
    expect(question?.topics).toEqual([
      { path: 'scribe/recording/live', title: 'Live capture' },
    ])
  })

  it('counts a row it cannot read, and a note left blank is none', () => {
    const { questions, unreadableCount } = decodeQuestions([
      buildRow,
      { id: 'x', text: 'No asker', status: 'open' },
    ])
    expect(textsOf(questions)).toEqual([buildRow.text])
    expect(questions[0]?.maybeNote).toEqual(Option.none())
    expect(unreadableCount).toBe(1)
  })
})

describe('listed questions', () => {
  it('lists the newest first, and a search finds his words, the answers and the topics', () => {
    const model = loaded([proximityRow, buildRow])
    expect(textsOf(listedQuestionsOf(model))).toEqual([
      buildRow.text,
      proximityRow.text,
    ])
    expect(textsOf(listedQuestionsOf(withSearch(model, 'airpods')))).toEqual([
      proximityRow.text,
    ])
    expect(
      textsOf(listedQuestionsOf(withSearch(model, 'ULTRA-wideband'))),
    ).toEqual([proximityRow.text])
    expect(
      textsOf(listedQuestionsOf(withSearch(model, 'live capture'))),
    ).toEqual([proximityRow.text])
    expect(listedQuestionsOf(withSearch(model, 'proximity bluetooth'))).toEqual(
      [],
    )
  })

  it('filters to the ones to learn from or the open ones; a dismissed one is never listed', () => {
    const dismissed = {
      ...buildRow,
      id: 'd',
      status: 'dismissed',
      text: 'Where is my phone?',
    }
    const model = loaded([proximityRow, buildRow, dismissed])
    expect(textsOf(listedQuestionsOf(model))).toEqual([
      buildRow.text,
      proximityRow.text,
    ])
    expect(
      textsOf(listedQuestionsOf({ ...model, filter: 'Learning' })),
    ).toEqual([proximityRow.text])
    expect(textsOf(listedQuestionsOf({ ...model, filter: 'Open' }))).toEqual([
      buildRow.text,
    ])
    expect([
      countFor(model, 'All'),
      countFor(model, 'Learning'),
      countFor(model, 'Open'),
    ]).toEqual([2, 1, 1])
    expect(matchesSearch(listedQuestionsOf(model)[1]!, '')).toBe(true)
  })
})

describe('update', () => {
  it('takes what Instant reports, the search typed and the filter chosen', () => {
    const { questions } = decodeQuestions([proximityRow])
    const observed = update(
      init(),
      ObservedQuestions({ questions, unreadableCount: 0 }),
    )
    expect(observed.state).toEqual(
      LoadedQuestions({ questions, unreadableCount: 0 }),
    )
    expect(
      update(observed, FailedObserveQuestions({ reason: 'offline' })).state,
    ).toEqual(FailedQuestions({ reason: 'offline' }))
    expect(
      update(observed, UpdatedQuestionSearch({ value: 'proximity' })).search,
    ).toBe('proximity')
    expect(
      update(observed, ClickedQuestionFilter({ filter: 'Learning' })).filter,
    ).toBe('Learning')
  })
})
