import { Array, Match as M, Option } from 'effect'
import {
  type ListItem,
  type ProgressNode,
  type ReferencePart,
  type TextNode,
  type UiNode,
  textsOf,
} from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  CatalogIssueReference,
  CheckedSubtask,
  ConversationReference,
  Issue,
  IssueMention,
  IssueSubtask,
  UncheckedSubtask,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import { ObservedIssue, ObservedIssues } from './message.js'
import { IssueDetail, IssueList, type Model } from './model.js'
import { issuesScreen } from './program.js'
import { update } from './update.js'

const stored = Issue.make({
  area: Option.none(),
  attachments: [],
  claimantId: Option.none(),
  complexity: Option.none(),
  createdAtMs: 1_000,
  details: 'What is wrong.',
  id: '021',
  issueType: Option.none(),
  mentions: [],
  priority: 'P2',
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
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

const site = Issue.make({
  ...stored,
  id: '1538',
  relatedIssueIds: ['174', '689', '95'],
  status: 'InProgress',
  title: 'The issues site as usable as Linear',
})
const graph = Issue.make({
  ...stored,
  id: '174',
  status: 'Planned',
  title: 'Richer issue entity graph',
})
const provenance = Issue.make({
  ...stored,
  id: '689',
  relatedIssueIds: ['1538'],
  status: 'VerificationNeeded',
  title: 'Programmatic provenance',
})
const mentioning = Issue.make({
  ...stored,
  id: '700',
  mentions: [
    IssueMention.make({
      capturedAtMs: Option.none(),
      directQuote: Option.none(),
      id: 'mention-700-1',
      issueId: '700',
      related: [CatalogIssueReference.make({ id: '174' })],
      reporter: Option.none(),
      source: ConversationReference.make({
        conversation: { note: 'Said so.', sessionId: 'session-1' },
      }),
    }),
  ],
  title: 'Names the graph in a mention',
})
const stepped = Issue.make({
  ...stored,
  id: '835',
  subtasks: [
    IssueSubtask.make({
      id: 'issue-835-subtask-1',
      state: CheckedSubtask.make({ checkedAtMs: 2_000 }),
      title: 'Red tests',
    }),
    IssueSubtask.make({
      id: 'issue-835-subtask-2',
      state: UncheckedSubtask.make({}),
      title: 'Merge after #174',
    }),
    IssueSubtask.make({
      id: 'issue-835-subtask-3',
      state: UncheckedSubtask.make({}),
      title: 'Ship it',
    }),
  ],
  title: 'Track work in progress',
})

const catalog = [site, graph, provenance, mentioning, stepped]

const pageOf = (issue: Issue): Model =>
  update(
    update(
      modelForNavigation(IssueDetail.make({ issueId: issue.id })),
      ObservedIssues.make({ issues: catalog }),
    )[0],
    ObservedIssue.make({ issue: Option.some(issue), issueId: issue.id }),
  )[0]

const childrenOf = (node: UiNode): ReadonlyArray<UiNode> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      List: () => [],
      Row: row => row.children,
      Column: column => column.children,
      Box: box => box.children,
      DeviceShell: shell => shell.children,
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Progress: () => [],
      Seek: () => [],
      Transcript: () => [],
    }),
  )

const nodesIn = (node: UiNode): ReadonlyArray<UiNode> => [
  node,
  ...Array.flatMap(childrenOf(node), nodesIn),
]

const sectionUnder = (model: Model, heading: string): ReadonlyArray<TextNode> =>
  Option.getOrThrow(
    Array.findFirst(nodesIn(issuesScreen(model)), node =>
      node._tag === 'Column' &&
      Array.some(
        node.children,
        child => child._tag === 'Text' && child.content.startsWith(heading),
      )
        ? Option.some(
            Array.flatMap(node.children, child =>
              child._tag === 'Text' && child.emphasis !== 'Headline'
                ? [child]
                : [],
            ),
          )
        : Option.none(),
    ),
  )

const chipsIn = (text: TextNode): ReadonlyArray<ReferencePart> =>
  Array.flatMap(text.parts ?? [], part =>
    part._tag === 'Reference' ? [part] : [],
  )

const linkedOf = (model: Model) =>
  Array.map(sectionUnder(model, 'Linked issues'), text => ({
    chips: Array.map(chipsIn(text), chip => ({
      label: chip.label,
      state: chip.state,
      title: chip.title,
    })),
    words: text.content,
  }))

describe('Issue Tracker relations', () => {
  it('shows each linked Issue as a chip with its title and state', () => {
    const linked = linkedOf(pageOf(site))
    expect(Array.map(linked, line => line.chips)).toEqual([
      [
        {
          label: '#174',
          state: 'Planned',
          title: 'Richer issue entity graph',
        },
      ],
      [
        {
          label: '#689',
          state: 'VerificationNeeded',
          title: 'Programmatic provenance',
        },
      ],
      [{ label: '#95', state: undefined, title: undefined }],
    ])
  })

  it('lists on the other end who links to it, with no link stored there', () => {
    const linked = linkedOf(pageOf(graph))
    expect(Array.map(linked, line => line.chips[0]?.label)).toEqual([
      '#1538',
      '#700',
    ])
    expect(linked[0]?.words).toContain('links here')
  })

  it('shows a link stored at both ends once on each', () => {
    expect(
      Array.map(linkedOf(pageOf(provenance)), line => line.chips[0]?.label),
    ).toEqual(['#1538'])
    expect(
      Array.filter(
        Array.map(linkedOf(pageOf(site)), line => line.chips[0]?.label),
        label => label === '#689',
      ),
    ).toHaveLength(1)
  })

  it('says no more about a link than what is stored', () => {
    const words = Array.map(
      textsOf(issuesScreen(pageOf(site))),
      text => text.content,
    )
    Array.forEach(['blocks', 'blocked by', 'duplicate', 'parent'], kind => {
      expect(
        Array.filter(words, line => line.toLowerCase().includes(kind)),
      ).toEqual([])
    })
  })

  it('shows how far its subtasks are, each with its state, its title in full, and chips inside', () => {
    const model = pageOf(stepped)
    const progress = Option.getOrThrow(
      Array.findFirst(
        nodesIn(issuesScreen(model)),
        (node): node is ProgressNode => node._tag === 'Progress',
      ),
    )
    expect([progress.value, progress.max, progress.label]).toEqual([
      1,
      3,
      '1 of 3 done',
    ])
    const lines = sectionUnder(model, 'Subtasks: 1 of 3 done')
    expect(
      Array.map(lines, line => Array.map(chipsIn(line), chip => chip.label)),
    ).toEqual([['done'], ['todo', '#174'], ['todo']])
    expect(Array.map(lines, line => line.content)).toEqual(
      expect.arrayContaining([expect.stringContaining('Merge after #174')]),
    )
  })

  it('shows on the list how far the subtasks are', () => {
    const [list] = update(
      modelForNavigation(IssueList.make({})),
      ObservedIssues.make({ issues: catalog }),
    )
    const rows: ReadonlyArray<ListItem> = Array.flatMap(
      nodesIn(issuesScreen(list)),
      node => (node._tag === 'List' ? node.items : []),
    )
    expect(
      Option.map(
        Array.findFirst(rows, row => row.key === '835'),
        row => row.lines,
      ),
    ).toEqual(Option.some(['#835', '1 of 3 done']))
  })
})
