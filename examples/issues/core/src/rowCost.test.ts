import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueWorkLogEntry,
} from '@foldkit/instant-tools/issues'

import {
  decisionFactsOf,
  decisionsOf,
  keptDecisionsOf,
} from './decisionFacts.js'
import {
  DecisionEntity,
  QuestionEntity,
  ReminderEntity,
} from './entityGraph.js'
import { issueGraphOf } from './graphFacts.js'
import { modelForNavigation } from './init.js'
import {
  type Message,
  ObservedDecisions,
  ObservedIssue,
  ObservedIssueGraph,
  ObservedPageFacts,
  TickedClock,
  observedIssuesOf,
  observedQuestionsOf,
  observedRemindersOf,
} from './message.js'
import { type Model } from './model.js'
import { issuesScreen } from './program.js'
import {
  keptQuestionsOf,
  questionFactsOf,
  questionsOf,
} from './questionFacts.js'
import { reminderFactsOf, remindersOf } from './reminderFacts.js'
import { pathToNavigation } from './route.js'
import { update } from './update.js'

const CATALOG_SIZE = 1_500
const RECORDING_COUNT = 60
const WORK_LOG_LENGTH = 10
const BUDGET_MS = 8
const RUNS = 5
const NOW_MS = 1_790_100_000_000

const PADDING =
  'He wants the tracker to open on the words he said and the build that shipped them, measured as Linear would, without retyping anything an agent already wrote down. '

const recordingIdAt = (index: number): string =>
  `faa684c2-34e4-47e5-8f9b-${(index % RECORDING_COUNT).toString().padStart(12, '0')}`

const sectionIdAt = (index: number, step: number, link: number): string =>
  `8d70b597-a775-41d8-b688-${(index * 100 + step * 10 + link).toString().padStart(12, '0')}`

const issueAt = (index: number): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs: 1_790_000_000_000 + index,
    details: `Issue ${index.toString()} cites decision decision-3. ${PADDING.repeat(6)}`,
    evidenceLogQueries: [],
    id: (index + 1).toString().padStart(4, '0'),
    issueType: Option.none(),
    mentions: [],
    priority: 'P2',
    product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title: `A title for Issue ${index.toString()}`,
    updatedAtMs: 1_790_000_000_000 + index,
    viewerURL: Option.none(),
    workLog: Array.makeBy(WORK_LOG_LENGTH, step =>
      IssueWorkLogEntry.make({
        agentId: Option.some('claude-code/agent@ld'),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-${index.toString()}-${step.toString()}`,
        occurredAtMs: 1_790_000_000_000 + step,
        state: Option.some('progress'),
        summary: `Step ${step.toString()} after #1358. ${PADDING.repeat(4)}`,
      }),
    ),
  })

const catalog = Array.makeBy(CATALOG_SIZE, issueAt)

const changedCatalogs = Array.makeBy(RUNS, run =>
  Array.map(catalog, (issue, index) =>
    index === 7 + run
      ? Issue.make({ ...issue, updatedAtMs: issue.updatedAtMs + 1 })
      : issue,
  ),
)

const loadedAt = (path: string): Model => {
  const navigated = modelForNavigation(pathToNavigation(path))
  const loaded = update(navigated, observedIssuesOf(catalog))[0]
  return Option.match(Array.get(catalog, 0), {
    onNone: () => loaded,
    onSome: first =>
      update(
        loaded,
        ObservedIssue.make({ issue: Option.some(first), issueId: first.id }),
      )[0],
  })
}

const fastestRepaintMs = (model: Model): number => {
  issuesScreen(model)
  return Math.min(
    ...Array.map(changedCatalogs, changed => {
      const startedAt = performance.now()
      issuesScreen(update(model, observedIssuesOf(changed))[0])
      return performance.now() - startedAt
    }),
  )
}

const DECISION_COUNT = 155
const QUESTION_COUNT = 964
const REMINDER_COUNT = 140
const MOMENT_COUNT = 12

const storedDecision = (index: number) => ({
  decidedAtMs: 1_790_000_000_000 + index,
  id: `decision-${index.toString()}`,
  issueNumbersJSON: `[${((index % CATALOG_SIZE) + 1).toString()},1358]`,
  status: index % 5 === 0 ? 'unconfirmed' : 'decided',
  text: `Rule ${index.toString()}, as one plain sentence of what he decided.`,
})

const storedQuestion = (index: number) => ({
  askedAtMs: 1_790_000_000_000 + index,
  askedBy: 'michael',
  id: `question-${index.toString()}`,
  learning: index % 2 === 0,
  status: index % 3 === 0 ? 'answered' : 'open',
  text: `Question ${index.toString()}, as one plain sentence he could be asked again?`,
})

const storedReminder = (index: number) => ({
  createdAtMs: 1_790_000_000_000 + index,
  dueAtMs: 1_790_000_000_000 + index,
  id: `reminder-${index.toString()}`,
  isCompleted: index % 2 === 0,
  title: `Reminder ${index.toString()}, as he said it.`,
})

const storedMoment = (index: number) => ({
  firstLineIndex: index,
  id: `moment-${index.toString()}`,
  kind: 'said',
  lastLineIndex: index + 2,
  quote: PADDING,
  recordingID: recordingIdAt(index),
  role: 'decided',
  segmentID: sectionIdAt(index, 0, 0),
  startSeconds: index * 7,
  startedAtMs: 1_790_000_000_000 + index,
})

const decisions = decisionsOf({
  decisions: Array.makeBy(DECISION_COUNT, storedDecision),
})
const questions = questionsOf({
  questions: Array.makeBy(QUESTION_COUNT, storedQuestion),
})
const reminders = remindersOf({
  remindersItems: Array.makeBy(REMINDER_COUNT, storedReminder),
})

const opened = (path: string, ...messages: ReadonlyArray<Message>): Model =>
  [
    TickedClock.make({ nowMs: NOW_MS, offsetMinutes: -300 }),
    ...messages,
  ].reduce((model, message) => update(model, message)[0], loadedAt(path))

const decisionsPage = opened(
  '/decisions',
  ObservedDecisions.make({ decisions }),
)
const questionsPage = opened('/questions', observedQuestionsOf(questions))
const remindersPage = opened('/reminders', observedRemindersOf(reminders))

const decisionEntity = DecisionEntity.make({ decisionId: 'decision-3' })
const decisionPage = opened(
  '/decisions/decision-3',
  ObservedDecisions.make({ decisions }),
  ObservedPageFacts.make({
    entity: decisionEntity,
    facts: Option.getOrThrow(
      decisionFactsOf({
        decisions: [
          {
            ...storedDecision(3),
            moments: Array.makeBy(MOMENT_COUNT, storedMoment),
            recordedBy: 'claude-code-feedback-1455-al',
            source: 'listener',
          },
        ],
      }),
    ),
  }),
)

const questionEntity = QuestionEntity.make({ questionId: 'question-3' })
const questionPage = opened(
  '/questions/question-3',
  ObservedPageFacts.make({
    entity: questionEntity,
    facts: Option.getOrThrow(
      questionFactsOf({
        questions: [
          {
            ...storedQuestion(3),
            answers: Array.makeBy(MOMENT_COUNT, index => ({
              answeredAtMs: 1_790_000_000_000 + index,
              answeredBy: 'agent',
              answererName: 'claude-code-2',
              id: `answer-${index.toString()}`,
              text: `Answer ${index.toString()} citing #1358. ${PADDING}`,
            })),
            moments: Array.makeBy(MOMENT_COUNT, storedMoment),
          },
        ],
      }),
    ),
  }),
)

const reminderEntity = ReminderEntity.make({ reminderId: 'reminder-3' })
const reminderPage = opened(
  '/reminders/reminder-3',
  ObservedPageFacts.make({
    entity: reminderEntity,
    facts: Option.getOrThrow(
      reminderFactsOf({
        remindersItems: [
          {
            ...storedReminder(3),
            moments: [],
            notes: PADDING,
            sourceMoments: Array.makeBy(MOMENT_COUNT, storedMoment),
          },
        ],
      }),
    ),
  }),
)

const issueWithDecisions = opened(
  '/issues/0001',
  ObservedDecisions.make({ decisions }),
  ObservedIssueGraph.make({
    graph: issueGraphOf(
      {
        agentFindings: [],
        edges: [],
        questions: Array.makeBy(5, index => ({
          ...storedQuestion(index),
          issueNumbersJSON: '[1]',
        })),
      },
      Option.some('0001'),
    ),
    issueId: '0001',
  }),
)

const changedRowsOf = <Row>(
  rows: ReadonlyArray<Row>,
  changeRow: (row: Row) => Row,
): ReadonlyArray<ReadonlyArray<Row>> =>
  Array.makeBy(RUNS, run =>
    Array.map(rows, (row, index) => (index === run ? changeRow(row) : row)),
  )

const fastestMs = (run: (index: number) => void): number =>
  Math.min(
    ...Array.makeBy(RUNS, index => {
      const startedAt = performance.now()
      run(index)
      return performance.now() - startedAt
    }),
  )

describe('what a row of his costs a page after a live change', () => {
  it('takes in one of 964 questions without decoding the others', () => {
    const keep = keptQuestionsOf()
    const stored = Array.makeBy(QUESTION_COUNT, storedQuestion)
    keep({ questions: stored })
    expect(
      fastestMs(index =>
        keep({
          questions: Array.map(stored, (row, at) =>
            at === index ? { ...row, status: 'answered' } : row,
          ),
        }),
      ),
    ).toBeLessThan(1)
  })

  it('takes in one of 155 decisions without decoding the others', () => {
    const keep = keptDecisionsOf()
    const stored = Array.makeBy(DECISION_COUNT, storedDecision)
    keep({ decisions: stored })
    expect(
      fastestMs(index =>
        keep({
          decisions: Array.map(stored, (row, at) =>
            at === index ? { ...row, status: 'superseded' } : row,
          ),
        }),
      ),
    ).toBeLessThan(1)
  })

  it('paints /questions again after one of 964 questions changed', () => {
    const changed = changedRowsOf(questions, row => ({
      ...row,
      status: 'answered',
    }))
    issuesScreen(questionsPage)
    expect(
      fastestMs(index =>
        issuesScreen(
          update(
            questionsPage,
            observedQuestionsOf(changed[index] ?? questions),
          )[0],
        ),
      ),
    ).toBeLessThan(BUDGET_MS)
  })

  it('paints /decisions again after one of 155 decisions changed', () => {
    const changed = changedRowsOf(decisions, row => ({
      ...row,
      status: 'superseded',
    }))
    issuesScreen(decisionsPage)
    expect(
      fastestMs(index =>
        issuesScreen(
          update(
            decisionsPage,
            ObservedDecisions.make({ decisions: changed[index] ?? decisions }),
          )[0],
        ),
      ),
    ).toBeLessThan(BUDGET_MS)
  })
})

describe('what a page of his rows costs to paint again after a live change, with 1,500 Issues loaded', () => {
  it('paints all 155 decisions again, building the rows of the Issue that changed', () => {
    expect(fastestRepaintMs(decisionsPage)).toBeLessThan(BUDGET_MS)
  })

  it('paints all 964 questions again, none of them naming the Issue that changed', () => {
    expect(fastestRepaintMs(questionsPage)).toBeLessThan(BUDGET_MS)
  })

  it('paints all 140 reminders again, none of them reading an Issue', () => {
    expect(fastestRepaintMs(remindersPage)).toBeLessThan(BUDGET_MS)
  })

  it("paints a decision's page again", () => {
    expect(fastestRepaintMs(decisionPage)).toBeLessThan(BUDGET_MS)
  })

  it("paints a question's page again", () => {
    expect(fastestRepaintMs(questionPage)).toBeLessThan(BUDGET_MS)
  })

  it("paints a reminder's page again", () => {
    expect(fastestRepaintMs(reminderPage)).toBeLessThan(BUDGET_MS)
  })

  it("paints an Issue's page with its decisions and questions again", () => {
    expect(fastestRepaintMs(issueWithDecisions)).toBeLessThan(BUDGET_MS)
  })
})
