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

// Scribe #1990: a question he typed in a chat. Made-up words and ids.
const SESSION = '00000000-0000-4000-8000-0000000000a1'
const MESSAGE = '00000000-0000-4000-8000-0000000000b2'
const CHAT_LINK = `claude-code://session/${SESSION}/message/${MESSAGE}`
const TYPED_AT = 1_794_023_062_762

const typedMoment = (id: string, quote: string, chatMessage: unknown) => ({
  id,
  role: 'asked',
  kind: 'typed',
  chatMessageID: '00000000-0000-4000-8000-0000000000d4',
  startedAtMs: TYPED_AT,
  quote,
  chatMessage,
})

const typedRow = {
  id: '00000000-0000-4000-8000-0000000000c3',
  text: 'Is a core the same as a CPU?',
  askedBy: 'michael',
  learning: true,
  status: 'open',
  askedAtMs: TYPED_AT,
  answers: [],
  moments: [
    typedMoment(
      'm-typed-1',
      'Made-up: when you say core, does that mean a CPU?',
      {
        harness: 'claude-code',
        sessionID: SESSION,
        messageID: MESSAGE,
        author: 'michael',
      },
    ),
    typedMoment('m-typed-2', 'Made-up: so is a core a CPU?', [
      {
        harness: 'claude-code',
        sessionID: SESSION,
        messageID: MESSAGE,
        author: 'michael',
      },
    ]),
    typedMoment('m-typed-3', 'Made-up: and in a thread?', {
      harness: 'scribe',
      sessionID: 'thread-1',
      messageID: 'reply-1',
      author: 'michael',
      url: 'https://og.pisspoursoftware.xyz/recording/r/thread/thread-1?reply=reply-1',
    }),
    typedMoment('m-typed-4', 'Made-up: a passage whose message is gone', null),
  ],
  topics: [],
}

const loaded = (
  rows: ReadonlyArray<unknown>,
  overrides: Partial<Model> = {},
): Model => {
  const { questions, unreadableCount, isLimitReached } = decodeQuestions(
    rows,
    500,
  )
  return {
    ...init(),
    ...overrides,
    state: LoadedQuestions({ questions, unreadableCount, isLimitReached }),
  }
}

const textsOf = (questions: ReadonlyArray<Question>): ReadonlyArray<string> =>
  Array.map(questions, question => question.text)

describe('decodeQuestions', () => {
  it('reads a question with its stretches, answers, topics and issues', () => {
    const { questions, unreadableCount } = decodeQuestions([proximityRow], 500)
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
    const { questions, unreadableCount } = decodeQuestions(
      [buildRow, { id: 'x', text: 'No asker', status: 'open' }],
      500,
    )
    expect(textsOf(questions)).toEqual([buildRow.text])
    expect(questions[0]?.maybeNote).toEqual(Option.none())
    expect(unreadableCount).toBe(1)
  })

  it('reads a question he typed: each passage with his words, where and when he typed it, and the address of his message (Scribe #1990)', () => {
    const { questions, unreadableCount } = decodeQuestions([typedRow], 500)
    expect(unreadableCount).toBe(0)
    const [question] = questions
    expect(question?.maybeRecordingID).toEqual(Option.none())
    expect(question?.stretches).toEqual([])
    expect(question?.typedPassages).toEqual([
      {
        harness: 'claude-code',
        sessionID: SESSION,
        messageID: MESSAGE,
        link: CHAT_LINK,
        sentAtMs: TYPED_AT,
        quote: 'Made-up: when you say core, does that mean a CPU?',
        role: 'Asked',
      },
      {
        harness: 'claude-code',
        sessionID: SESSION,
        messageID: MESSAGE,
        link: CHAT_LINK,
        sentAtMs: TYPED_AT,
        quote: 'Made-up: so is a core a CPU?',
        role: 'Asked',
      },
      {
        harness: 'scribe',
        sessionID: 'thread-1',
        messageID: 'reply-1',
        link: 'https://og.pisspoursoftware.xyz/recording/r/thread/thread-1?reply=reply-1',
        sentAtMs: TYPED_AT,
        quote: 'Made-up: and in a thread?',
        role: 'Asked',
      },
    ])
    expect(
      decodeQuestions([proximityRow], 500).questions[0]?.typedPassages,
    ).toEqual([])
  })

  it('says when the query’s limit cut the list, so older questions are never missing in silence', () => {
    const rows = [proximityRow, buildRow, { id: 'x', text: 'No asker' }]
    expect(decodeQuestions(rows, 3).isLimitReached).toBe(true)
    expect(decodeQuestions(rows, 4).isLimitReached).toBe(false)
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
    expect(
      textsOf(
        listedQuestionsOf(
          withSearch(loaded([typedRow, buildRow]), 'core does that mean'),
        ),
      ),
    ).toEqual([typedRow.text])
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
    const { questions } = decodeQuestions([proximityRow], 500)
    const observed = update(
      init(),
      ObservedQuestions({
        questions,
        unreadableCount: 0,
        isLimitReached: true,
      }),
    )
    expect(observed.state).toEqual(
      LoadedQuestions({ questions, unreadableCount: 0, isLimitReached: true }),
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
