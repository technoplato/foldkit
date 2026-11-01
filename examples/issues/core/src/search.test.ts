import { Array, Match as M, Option } from 'effect'
import {
  type ListItem,
  type UiNode,
  inputsOf,
  textsOf,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueAgentPresence,
  IssueMention,
  IssueSuccessCriterion,
  IssueWorkLogEntry,
  RunningAgent,
  UriReference,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { ObservedIssues, UpdatedSearchQuery } from './message.js'
import { IssueDetail, IssueList, type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { issuesScreen } from './program.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { update } from './update.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

const stored = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_000,
  details: 'Nothing about the search words.',
  id: '021',
  issueType: Option.none(),
  mentions: [],
  priority: 'P1',
  product: scribe,
  projectId: Option.none(),
  reportedDate: Option.none(),
  sourceDocument: Option.none(),
  status: 'Open',
  successCriteria: [],
  title: 'Keep transcript aligned',
  updatedAtMs: 1_000,
  viewerURL: Option.none(),
  workLog: [],
})

const linear = Issue.make({
  ...stored,
  area: Option.some('Issue tracker'),
  claimantId: Option.some('claude-code/issues-linear-1538@ld'),
  createdAtMs: 4_000,
  id: '1538',
  title: 'The issues site as usable as Linear',
})
const heartRate = Issue.make({
  ...stored,
  area: Option.some('Recording / sensors'),
  createdAtMs: 3_000,
  id: '092',
  title: 'Heart rate during a recording',
})
const heartbeat = Issue.make({
  ...stored,
  agentPresence: Option.some(
    IssueAgentPresence.make({
      account: Option.some('ld'),
      agentId: 'claude-code/mirror-1005@ld',
      branch: Option.none(),
      harness: Option.none(),
      run: RunningAgent.make({ sinceMs: 1_000 }),
      startedAtMs: Option.none(),
      touchedFiles: Option.none(),
      worktree: Option.none(),
    }),
  ),
  createdAtMs: 2_000,
  id: '1005',
  title: 'Mirror heartbeat stalls after 1538 lines',
})
const unrelated = Issue.make({
  ...stored,
  area: Option.some('Playback'),
  createdAtMs: 1_000,
  id: '210',
  title: 'Chapters zoom level is too sensitive',
})

const loaded = (): Model =>
  update(
    modelForNavigation(IssueList.make({})),
    ObservedIssues.make({ issues: [linear, heartRate, heartbeat, unrelated] }),
  )[0]

const pageRowsOf = (node: UiNode): ReadonlyArray<ListItem> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ListItem>>(),
    M.tagsExhaustive({
      List: list => list.items,
      Row: row => Array.flatMap(row.children, pageRowsOf),
      Column: column => Array.flatMap(column.children, pageRowsOf),
      Box: box =>
        box.layer === undefined ? Array.flatMap(box.children, pageRowsOf) : [],
      DeviceShell: shell => Array.flatMap(shell.children, pageRowsOf),
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const shownNumbersOf = (model: Model): ReadonlyArray<string> =>
  Array.map(pageRowsOf(issuesScreen(model)), row => row.key)

const typed = (model: Model, query: string): Model =>
  update(
    model,
    Option.getOrThrow(messageForScreenToken(model, `search:${query}`)),
  )[0]

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

describe('Issue Tracker screen: search', () => {
  it('gives the list a search field that shows what was typed', () => {
    const searching = typed(loaded(), 'heart')

    expect(
      Array.map(inputsOf(issuesScreen(searching)), input => ({
        label: input.label,
        token: input.token,
        value: input.value,
      })),
    ).toContainEqual({
      label: 'Search Issues',
      token: 'search:',
      value: 'heart',
    })
    expect(messageForScreenToken(loaded(), 'search:heart')).toEqual(
      Option.some(UpdatedSearchQuery.make({ query: 'heart' })),
    )
  })

  it('narrows the list as each letter is typed to the Issues whose title, area, claimant or running agent hold every word', () => {
    const model = loaded()

    expect(shownNumbersOf(typed(model, 'h'))).toEqual([
      '1538',
      '092',
      '1005',
      '210',
    ])
    expect(shownNumbersOf(typed(model, 'heart'))).toEqual(['092', '1005'])
    expect(shownNumbersOf(typed(model, 'HEART  rate'))).toEqual(['092'])
    expect(shownNumbersOf(typed(model, 'sensors'))).toEqual(['092'])
    expect(shownNumbersOf(typed(model, 'issues-linear'))).toEqual(['1538'])
    expect(shownNumbersOf(typed(model, 'mirror-1005'))).toEqual(['1005'])
    expect(shownNumbersOf(typed(model, 'linear mirror'))).toEqual([])
    expect(shownNumbersOf(typed(model, ''))).toEqual([
      '1538',
      '092',
      '1005',
      '210',
    ])
  })

  it('finds an Issue by its number, with or without #, and a number in a title', () => {
    const model = loaded()

    expect(shownNumbersOf(typed(model, '#1538'))).toEqual(['1538'])
    expect(shownNumbersOf(typed(model, '1538'))).toEqual(['1538', '1005'])
    expect(shownNumbersOf(typed(model, '92'))).toEqual(['092'])
    expect(shownNumbersOf(typed(model, '#092'))).toEqual(['092'])
    expect(shownNumbersOf(typed(model, '#15'))).toEqual(['1538'])
  })

  it('says how many Issues match, and when none do', () => {
    const model = loaded()

    expect(contentsOf(typed(model, 'heart'))).toContain('2 of 4 Issues')
    expect(contentsOf(typed(model, 'zebra'))).toContain(
      'No Issues match "zebra".',
    )
    expect(contentsOf(model)).toContain('4 Issues')
  })

  it('keeps the search in the URL, so a search is a link', () => {
    const searching = typed(loaded(), 'heart rate')

    expect(navigationToPath(searching.navigation)).toBe('/issues?q=heart+rate')
    expect(pathToNavigation('/issues?q=heart+rate')).toEqual(
      searching.navigation,
    )
    expect(pathToNavigation('/issues?q=heart%20rate')).toEqual(
      searching.navigation,
    )
    expect(navigationToPath(pathToNavigation('/issues'))).toBe('/issues')
    expect(
      shownNumbersOf(
        update(
          modelForNavigation(pathToNavigation('/issues?q=%23092')),
          ObservedIssues.make({
            issues: [linear, heartRate, heartbeat, unrelated],
          }),
        )[0],
      ),
    ).toEqual(['092'])
  })
})

const inDetails = Issue.make({
  ...stored,
  createdAtMs: 9_000,
  details: 'The fan spins because the CPU stays busy.',
  id: '301',
  title: 'Phone runs hot',
})
const inMention = Issue.make({
  ...stored,
  createdAtMs: 8_000,
  id: '302',
  mentions: [
    IssueMention.make({
      capturedAtMs: Option.none(),
      directQuote: Option.some('why is the cpu so high on this'),
      id: 'mention-302-1',
      issueId: '302',
      note: Option.some('said during the walk'),
      related: [],
      reporter: Option.none(),
      source: UriReference.make({ value: 'https://example.com/moment' }),
    }),
  ],
  title: 'Recording drains the battery',
})
const inWorkLog = Issue.make({
  ...stored,
  createdAtMs: 7_000,
  id: '303',
  title: 'Mirror stalls',
  workLog: [
    IssueWorkLogEntry.make({
      agentId: Option.some('claude-code/mirror@ld'),
      commitSha: Option.some('9be70b4a8'),
      durationSeconds: Option.none(),
      id: 'work-303-1',
      occurredAtMs: 7_000,
      state: Option.some('progress'),
      summary: 'Measured cpu at 180 percent during the sync.',
    }),
  ],
})
const inTitle = Issue.make({
  ...stored,
  createdAtMs: 1_000,
  id: '304',
  title: 'CPU cost of the mirror',
})
const inCriterion = Issue.make({
  ...stored,
  createdAtMs: 500,
  id: '305',
  successCriteria: [
    IssueSuccessCriterion.make({
      id: 'issue-305-criterion-1',
      isSatisfied: false,
      outcome: 'A recording never holds the cpu above 20 percent.',
      requiredEvidence: [],
    }),
  ],
  title: 'Quiet recording',
})
const mentionsNumber = Issue.make({
  ...stored,
  createdAtMs: 6_000,
  details: 'Filed after #304 landed.',
  id: '306',
  title: 'A follow-up',
})

const deepLoaded = (): Model =>
  update(
    modelForNavigation(IssueList.make({})),
    ObservedIssues.make({
      issues: [
        inDetails,
        inMention,
        inWorkLog,
        mentionsNumber,
        inTitle,
        inCriterion,
      ],
    }),
  )[0]

const submittedSearch = (model: Model, query: string) =>
  update(
    typed(model, query),
    Option.getOrThrow(
      messageForScreenToken(typed(model, query), 'search-submit'),
    ),
  )[0]

describe('Issue Tracker screen: search reaches everything an Issue says', () => {
  it('finds a word in the details, a mention, the work log and the success criteria, the Issues with it in their title first', () => {
    expect(shownNumbersOf(typed(deepLoaded(), 'cpu'))).toEqual([
      '304',
      '301',
      '302',
      '303',
      '305',
    ])
    expect(shownNumbersOf(typed(deepLoaded(), 'walk'))).toEqual(['302'])
    expect(shownNumbersOf(typed(deepLoaded(), '9be70b4a8'))).toEqual(['303'])
  })

  it('holds every word of the query across the whole Issue', () => {
    expect(shownNumbersOf(typed(deepLoaded(), 'mirror cpu'))).toEqual([
      '304',
      '303',
    ])
  })

  it('lists the Issue a number names first, then those that mention it', () => {
    expect(shownNumbersOf(typed(deepLoaded(), '304'))).toEqual(['304', '306'])
    expect(shownNumbersOf(typed(deepLoaded(), '#304'))).toEqual(['304'])
  })

  it('keeps a word typed further narrowing the same Issues, and finds them again when it is deleted', () => {
    const model = deepLoaded()
    const narrowed = typed(typed(typed(model, 'c'), 'cp'), 'cpu')
    expect(shownNumbersOf(narrowed)).toEqual(
      shownNumbersOf(typed(model, 'cpu')),
    )
    expect(shownNumbersOf(typed(narrowed, 'c'))).toEqual(
      shownNumbersOf(typed(model, 'c')),
    )
  })

  it('finds a changed Issue after a live change, without another key', () => {
    const searching = typed(deepLoaded(), 'zebra')
    expect(shownNumbersOf(searching)).toEqual([])
    const changed = update(
      searching,
      ObservedIssues.make({
        issues: [
          Issue.make({ ...inTitle, details: 'A zebra in the details.' }),
        ],
      }),
    )[0]
    expect(shownNumbersOf(changed)).toEqual(['304'])
  })
})

describe('Issue Tracker screen: Enter in the search', () => {
  it('opens the Issue a typed number names, in any spelling', () => {
    expect(submittedSearch(deepLoaded(), '304').navigation).toEqual(
      IssueDetail.make({ issueId: '304' }),
    )
    expect(submittedSearch(deepLoaded(), '#304').navigation).toEqual(
      IssueDetail.make({ issueId: '304' }),
    )
  })

  it('opens a number filtered out of the list too', () => {
    expect(
      submittedSearch(
        update(
          deepLoaded(),
          Option.getOrThrow(
            messageForScreenToken(deepLoaded(), 'landing:close'),
          ),
        )[0],
        '304',
      ).navigation,
    ).toEqual(IssueDetail.make({ issueId: '304' }))
  })

  it('opens a number with a zero the store pads', () => {
    expect(submittedSearch(loaded(), '92').navigation).toEqual(
      IssueDetail.make({ issueId: '092' }),
    )
  })

  it('opens the first row for words, and stays when nothing matches', () => {
    expect(submittedSearch(deepLoaded(), 'cpu').navigation).toEqual(
      IssueDetail.make({ issueId: '304' }),
    )
    expect(submittedSearch(deepLoaded(), 'zebra').navigation).toEqual(
      IssueList.make({ view: { query: 'zebra' } }),
    )
  })
})
