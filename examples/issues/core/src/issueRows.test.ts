import { Array, Option } from 'effect'
import { type ReferencePart, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { decisionsOf } from './decisionFacts.js'
import { issueGraphOf, issueGraphQuery } from './graphFacts.js'
import { modelForNavigation } from './init.js'
import {
  ObservedDecisions,
  ObservedIssue,
  ObservedIssueGraph,
  ObservedIssues,
  TickedClock,
  observedRemindersOf,
} from './message.js'
import { type Model } from './model.js'
import { pageCites } from './pageAgents.js'
import { issuesScreen } from './program.js'
import { remindersOf } from './reminderFacts.js'
import { pathToNavigation } from './route.js'
import { update } from './update.js'

const NOW_MS = Date.parse('2026-11-01T17:00:00Z')
const AT_MS = Date.parse('2026-10-29T14:15:00Z')

const named = {
  decidedAtMs: AT_MS,
  id: 'dbdbf773-f596-5657-a3d4-554a11755709',
  issueNumbersJSON: '[1393,1394]',
  status: 'decided',
  text: 'One Opus agent takes every UI task at once.',
}

const cited = {
  decidedAtMs: AT_MS - 86_400_000,
  id: '58ca646e-2f9b-5cd1-8a41-0c8e6d3b7a22',
  status: 'superseded',
  text: 'Each UI task gets its own agent.',
}

const elsewhere = {
  decidedAtMs: AT_MS - 2 * 86_400_000,
  id: 'a3fe7871-1c3d-5e8f-b2a6-7d9e0f1a2b33',
  issueNumbersJSON: '[41]',
  status: 'decided',
  text: 'Names another Issue.',
}

const decisions = decisionsOf({ decisions: [elsewhere, named, cited] })

const question = {
  askedAtMs: AT_MS,
  askedBy: 'michael',
  id: '4e740f44-7fba-5a34-a531-a6cbb76f328c',
  issueNumbersJSON: '[1393]',
  learning: false,
  status: 'answered',
  text: 'Which build is on his phone?',
}

const otherQuestion = {
  ...question,
  id: '85e1d773-77b3-5c9a-9266-793fbfdd5f2b',
  issueNumbersJSON: '[41]',
  text: 'Names another Issue?',
}

const linkedReminder = {
  createdAtMs: AT_MS,
  id: 'c0ffee03-0a0b-5c0d-8e0f-101112131415',
  isCompleted: false,
  title: 'Return the borrowed ladder',
  url: 'https://issues.pisspoursoftware.xyz/issues/1393',
}

const otherLink = {
  ...linkedReminder,
  id: 'c0ffee04-0a0b-5c0d-8e0f-101112131415',
  title: 'Sort the garage shelves',
  url: 'https://words.pisspoursoftware.xyz/recording/faa684c2-34e4-47e5-8f9b-000000000002',
}

const citedReminder = {
  createdAtMs: AT_MS,
  id: 'c0ffee01-0a0b-5c0d-8e0f-101112131415',
  isCompleted: false,
  title: 'Water the plants before the trip',
}

const graph = issueGraphOf(
  {
    agentFindings: [],
    edges: [],
    questions: [question, otherQuestion],
    remindersItems: [linkedReminder, otherLink],
  },
  Option.some('1393'),
)

const blank = (id: string, title: string, details = ''): Issue =>
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
    title,
    updatedAtMs: AT_MS,
    viewerURL: Option.none(),
    workLog: [],
  })

const issue = blank(
  '1393',
  'One UI agent',
  'It replaced a rule (58ca646e). Reminder c0ffee01 holds the ask.',
)
const plain = blank('042', 'Names nothing')

const opened = (
  open: Issue,
  ...messages: ReadonlyArray<Parameters<typeof update>[1]>
): Model =>
  [
    ObservedIssues.make({ issues: [issue, plain] }),
    TickedClock.make({ nowMs: NOW_MS, timeZone: 'America/New_York' }),
    ObservedIssue.make({ issue: Option.some(open), issueId: open.id }),
    ...messages,
  ].reduce(
    (model, message) => update(model, message)[0],
    modelForNavigation(pathToNavigation(`/issues/${open.id}`)),
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

const page = (): Model =>
  opened(
    issue,
    ObservedDecisions.make({ decisions }),
    ObservedIssueGraph.make({ graph, issueId: '1393' }),
    observedRemindersOf(
      remindersOf({ remindersItems: [citedReminder, linkedReminder] }),
    ),
  )

describe('what an Issue’s page reads of his rows', () => {
  it('reads only the questions and reminders that hold an Issue or a link', () => {
    const query = issueGraphQuery(1393)
    expect(query.questions.$.where).toEqual({
      issueNumbersJSON: { $isNull: false },
    })
    expect(query.remindersItems.$.where).toEqual({ url: { $isNull: false } })
  })

  it('keeps the questions that name it', () => {
    expect(Array.map(graph.questions, found => found.text)).toEqual([
      'Which build is on his phone?',
    ])
  })

  it('keeps the reminders whose link is its page, and no other', () => {
    expect(Array.map(graph.reminders, found => found.title)).toEqual([
      'Return the borrowed ladder',
    ])
  })

  it('reads every reminder only when its words cite one', () => {
    expect(pageCites(opened(issue), 'ReminderEntity')).toBe(true)
    expect(pageCites(opened(plain), 'ReminderEntity')).toBe(false)
  })
})

describe('an Issue’s page at a glance', () => {
  it('lists the decisions that name it or that its words cite', () => {
    const model = page()
    const contents = contentsOf(model)
    expect(contents).toContain('Decisions: 2')
    const chips = chipsOf(model)
    expect(
      chips.some(
        chip =>
          chip.href === `/decisions/${named.id}` && chip.state === 'decided',
      ),
    ).toBe(true)
    expect(
      chips.some(
        chip =>
          chip.href === `/decisions/${cited.id}` && chip.state === 'superseded',
      ),
    ).toBe(true)
    expect(chips.some(chip => chip.href === `/decisions/${elsewhere.id}`)).toBe(
      false,
    )
  })

  it('lists the questions that name it', () => {
    const model = page()
    expect(contentsOf(model)).toContain('Questions: 1')
    expect(
      chipsOf(model).some(chip => chip.href === `/questions/${question.id}`),
    ).toBe(true)
  })

  it('lists the reminders it cites or whose link is its page', () => {
    const model = page()
    expect(contentsOf(model)).toContain('Reminders: 2')
    const chips = chipsOf(model)
    expect(
      chips.some(chip => chip.href === `/reminders/${citedReminder.id}`),
    ).toBe(true)
    expect(
      chips.some(chip => chip.href === `/reminders/${linkedReminder.id}`),
    ).toBe(true)
  })

  it('shows none of the three on an Issue no row names', () => {
    const contents = contentsOf(
      opened(
        plain,
        ObservedDecisions.make({ decisions }),
        ObservedIssueGraph.make({
          graph: issueGraphOf(
            { agentFindings: [], edges: [] },
            Option.some('042'),
          ),
          issueId: '042',
        }),
      ),
    )
    expect(
      contents.some(content =>
        /^(?:Decisions|Questions|Reminders): /.test(content),
      ),
    ).toBe(false)
  })
})
