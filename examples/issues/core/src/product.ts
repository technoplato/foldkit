import { Array, Match as M, Option } from 'effect'
import {
  Box,
  Button,
  Column,
  List,
  type ListItem,
  Row,
  Text,
  TextInput,
  type UiNode,
} from 'foldkit/renderers'

import { type Issue, IssuePriority } from '@foldkit/instant-tools/issues'
import { quorumFromPeers } from '@foldkit/instant-tools/leftover'

import { askFlowNodes } from './askFlowPage.js'
import { laneHeading, sectionHeading } from './backlog.js'
import { entityPageNodes } from './entityPage.js'
import { type Interaction } from './interaction.js'
import { issuePageNodes } from './issuePage.js'
import { type IssueView } from './issueView.js'
import { navigationInteractionsOf } from './keys.js'
import { leftoverQuorumRequired } from './leftover.js'
import { issueCountWords, issueRowOf } from './listRows.js'
import { listedBacklog, listedIssues } from './listing.js'
import {
  type IssueDraftState,
  type IssueLogsState,
  type Model,
} from './model.js'
import { paletteRowsOf } from './palette.js'
import { productForReference } from './update.js'

const isoTimeOf = (timeMs: number): string => new Date(timeMs).toISOString()

const navigationButtons = (model: Model): ReadonlyArray<UiNode> =>
  Array.map(navigationInteractionsOf(model), interaction =>
    Button({ token: interaction.token, label: interaction.label }),
  )

type RowGroup = Readonly<{
  heading: string
  issues: ReadonlyArray<Issue>
}>

const placedRowsOf = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<ListItem> =>
  Option.match(model.maybeRowCursor, {
    onNone: () => Array.map(issues, issueRowOf),
    onSome: cursorId =>
      Array.map(issues, issue =>
        issue.id === cursorId
          ? { ...issueRowOf(issue), isCurrent: true }
          : issueRowOf(issue),
      ),
  })

const groupNode = (model: Model, group: RowGroup): UiNode =>
  Column(
    { gap: 1 },
    Text(group.heading),
    ...Array.match(group.issues, {
      onEmpty: () => [],
      onNonEmpty: issues => [
        List({ label: group.heading, items: placedRowsOf(model, issues) }),
      ],
    }),
  )

const rowNodes = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<UiNode> =>
  Array.match(issues, {
    onEmpty: () => [],
    onNonEmpty: listed => [
      List({ label: 'Issues', items: placedRowsOf(model, listed) }),
    ],
  })

const productFilterNodes = (
  model: Model,
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<UiNode> => {
  const catalog =
    model.products._tag === 'LoadedProducts' ? model.products.products : []
  const seen = new Set(Array.map(catalog, entry => entry.product.id))
  const fromIssues = Array.reduce(issues, catalog, (entries, issue) => {
    if (seen.has(issue.product.id)) {
      return entries
    }
    seen.add(issue.product.id)
    return Array.append(entries, {
      product: issue.product,
      updatedAtMs: issue.updatedAtMs,
    })
  })
  const preferred = [
    'foldkit',
    'scribe',
    'instant-data-swift',
    'casino',
    'ayutia',
  ]
  const products = Array.appendAll(
    Array.filter(fromIssues, entry => preferred.includes(entry.product.id)),
    Array.filter(fromIssues, entry => !preferred.includes(entry.product.id)),
  )
  const selected =
    model.productFilter._tag === 'OneProduct'
      ? model.productFilter.productId
      : 'all'
  return [
    Text('Product filter'),
    Row(
      { gap: 1 },
      Button({
        token: 'product:all',
        label: 'All',
        variant: selected === 'all' ? 'Primary' : 'Ghost',
      }),
      ...Array.map(products, entry =>
        Button({
          token: `product:${entry.product.id}`,
          label: entry.product.name,
          variant: selected === entry.product.id ? 'Primary' : 'Ghost',
        }),
      ),
    ),
  ]
}

const searchField = (model: Model, view: IssueView): UiNode =>
  TextInput({
    blurToken: 'search-blur',
    focusToken: 'search-focus',
    focused: model.isSearchFocused,
    label: 'Search Issues',
    placeholder: 'Search by number or any word an Issue says  /',
    token: 'search:',
    value: view.query,
  })

const listedCountWords = (
  view: IssueView,
  listedCount: number,
  loadedCount: number,
): string => {
  if (listedCount === loadedCount) {
    return issueCountWords(loadedCount)
  } else if (listedCount === 0 && view.query.trim() !== '') {
    return `No Issues match "${view.query.trim()}".`
  } else {
    return `${listedCount.toLocaleString('en-US')} of ${issueCountWords(loadedCount)}`
  }
}

const listNodes = (model: Model, view: IssueView): ReadonlyArray<UiNode> =>
  M.value(model.issues).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      LoadingIssues: () => [searchField(model, view), Text('Observing…')],
      FailedIssues: ({ reason }) => [searchField(model, view), Text(reason)],
      LoadedIssues: ({ issues }) => {
        const visible = listedIssues(model, issues)
        return [
          searchField(model, view),
          ...productFilterNodes(model, issues),
          Row(
            { gap: 1 },
            Button({
              token: 'landing:all',
              label: 'All work',
              variant:
                model.landingFilter._tag === 'AllWork' ? 'Primary' : 'Ghost',
            }),
            Button({
              token: 'landing:close',
              label: 'Close to landing',
              variant:
                model.landingFilter._tag === 'CloseToLanding'
                  ? 'Primary'
                  : 'Ghost',
            }),
            Button({
              token: 'landing:working',
              label: 'Working now',
              variant:
                model.landingFilter._tag === 'WorkingNow' ? 'Primary' : 'Ghost',
            }),
          ),
          Text(listedCountWords(view, visible.length, issues.length)),
          ...rowNodes(model, visible),
        ]
      },
    }),
  )

const backlogNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.issues).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      LoadingIssues: () => [Text('Backlog'), Text('Observing…')],
      FailedIssues: ({ reason }) => [Text('Backlog'), Text(reason)],
      LoadedIssues: ({ issues }) => {
        const backlog = listedBacklog(model, issues)
        return [
          Text('Backlog'),
          ...productFilterNodes(model, issues),
          ...Array.map(backlog.lanes, lane =>
            groupNode(model, {
              heading: laneHeading(lane),
              issues: lane.issues,
            }),
          ),
          ...Array.map(backlog.sections, section =>
            groupNode(model, {
              heading: sectionHeading(section),
              issues: section.issues,
            }),
          ),
        ]
      },
    }),
  )

const issueLogNodes = (state: IssueLogsState): ReadonlyArray<UiNode> =>
  M.value(state).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NotObservingIssueLogs: () => [],
      LoadingIssueLogs: () => [
        Text('Tagged logs'),
        Text('Loading tagged logs…'),
      ],
      FailedIssueLogs: ({ reason }) => [Text('Tagged logs'), Text(reason)],
      LoadedIssueLogs: ({ logs }) => [
        Column(
          { gap: 1 },
          Text('Tagged logs'),
          ...Array.match(logs, {
            onEmpty: () => [
              Text('No logs have been tagged with this Issue yet.'),
            ],
            onNonEmpty: tagged =>
              Array.map(tagged, log =>
                Text(
                  `${isoTimeOf(log.timestampMs)}  ${log.level}  ${log.name}  ${log.message}`,
                ),
              ),
          }),
        ),
      ],
    }),
  )

const leftoverPresenceNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.leftoverPresence).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NotObservingLeftoverPresence: () => [],
      LoadingLeftoverPresence: () => [Text('Presence: joining…')],
      FailedLeftoverPresence: ({ reason }) => [
        Text(`Presence failed: ${reason}`),
      ],
      LoadedLeftoverPresence: ({ leftoverId, peers }) => {
        const quorum = quorumFromPeers(
          leftoverId,
          peers,
          leftoverQuorumRequired,
        )
        return [
          Text('Presence'),
          ...(Array.isReadonlyArrayEmpty(peers)
            ? [Text('No peers in this leftover room.')]
            : Array.map(peers, peer =>
                Text(`${peer.agentId}  ${peer.role}  ${peer.origin}`),
              )),
          Text(quorum._tag === 'Present' ? 'Quorum present' : 'Quorum missing'),
        ]
      },
    }),
  )

const detailNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.issueDetail).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NotObservingIssue: () => [Text('Not observing')],
      LoadingIssue: () => [Text('Observing…')],
      FailedIssue: ({ reason }) => [Text(reason)],
      LoadedIssue: ({ issue, issueId }) =>
        Option.match(issue, {
          onNone: () => [Text(issueId), Text('Issue not found')],
          onSome: observed => issuePageNodes(model, observed),
        }),
    }),
  )

const draftProductNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.products).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      LoadingProducts: () => [Text('Loading products…')],
      FailedProducts: ({ reason }) => [Text(reason)],
      LoadedProducts: ({ products }) => {
        const maybeChosen = productForReference(products, model.draft.productId)
        return [
          Row(
            { gap: 1 },
            ...Array.map(products, entry =>
              Button({
                token: `product:${entry.product.id}`,
                label: entry.product.name,
                variant: Option.exists(
                  maybeChosen,
                  chosen => chosen.id === entry.product.id,
                )
                  ? 'Primary'
                  : 'Ghost',
              }),
            ),
          ),
        ]
      },
    }),
  )

const draftStateNodes = (state: IssueDraftState): ReadonlyArray<UiNode> =>
  M.value(state).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      EditingIssueDraft: () => [],
      SavingIssueDraft: () => [Text('Filing…')],
      FailedIssueDraft: ({ reason }) => [Text(`Not filed: ${reason}`)],
    }),
  )

const fileNodes = (model: Model): ReadonlyArray<UiNode> => [
  Text('File issue'),
  TextInput({
    label: 'Title',
    placeholder: 'Title',
    token: 'title:',
    value: model.draft.title,
  }),
  TextInput({
    label: 'Details',
    placeholder: 'What is wrong or wanted',
    token: 'details:',
    value: model.draft.details,
  }),
  Text('Product'),
  ...draftProductNodes(model),
  Text('Priority'),
  Row(
    { gap: 1 },
    ...Array.map(IssuePriority.literals, priority =>
      Button({
        token: `priority:${priority}`,
        label: priority,
        variant: priority === model.draft.priority ? 'Primary' : 'Ghost',
      }),
    ),
  ),
  Button({ token: 'submit', label: 'Submit issue', variant: 'Primary' }),
  ...draftStateNodes(model.draftState),
]

const triageNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.triageCandidates).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      LoadingTriageCandidates: () => [
        Text('Triage inbox'),
        Text('LoadingTriageCandidates'),
      ],
      FailedTriageCandidates: ({ reason }) => [
        Text('Triage inbox'),
        Text(reason),
      ],
      LoadedTriageCandidates: ({ candidates }) => [
        Text('Triage inbox'),
        ...Array.flatMap(candidates, candidate => [
          Text(
            `${candidate.id}  ${candidate.status}  ${candidate.suggestedTitle}  [${candidate.segment.startMilliseconds.toString()}-${candidate.segment.endMilliseconds.toString()}ms]`,
          ),
          ...(candidate.status === 'Draft'
            ? [
                Button({
                  token: `promote:${candidate.id}`,
                  label: `Promote ${candidate.id}`,
                }),
                Button({
                  token: `dismiss:${candidate.id}`,
                  label: `Dismiss ${candidate.id}`,
                }),
              ]
            : []),
        ]),
      ],
    }),
  )

const destinationNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.navigation).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      IssueList: ({ view }) => listNodes(model, view),
      IssueDetail: () => [
        ...detailNodes(model),
        ...issueLogNodes(model.issueLogs),
        ...leftoverPresenceNodes(model),
        Text('Comment'),
        TextInput({
          placeholder: 'Comment',
          token: 'comment-draft:',
          value: model.leftoverComment,
        }),
        Button({ label: 'Comment', token: 'comment-submit' }),
        Text('Link issue'),
        TextInput({
          placeholder: 'Issue id',
          token: 'link-draft:',
          value: model.leftoverLink,
        }),
        Button({ label: 'Link', token: 'link-submit' }),
        ...(model.issueMutation._tag === 'FailedIssueMutation'
          ? [Text(model.issueMutation.reason)]
          : []),
        ...(model.issueMutation._tag === 'SavingIssueMutation'
          ? [Text('Saving leftover…')]
          : []),
      ],
      FileIssue: () => fileNodes(model),
      TriageInbox: () => triageNodes(model),
      Backlog: () => backlogNodes(model),
      AskFlow: () => askFlowNodes(model),
      EntityPage: ({ entity }) => entityPageNodes(model, entity),
    }),
  )

const GO_KEY_CHOICES = 'Go to: l list, b backlog, t triage'

const dockNodes = (model: Model): ReadonlyArray<UiNode> =>
  model.isGoKeyPending ? [Box({ isDock: true }, Text(GO_KEY_CHOICES))] : []

const keyHintOf = (key: string): string =>
  key
    .replace('Meta+', '⌘')
    .replace('Control+', 'Ctrl ')
    .replace('Shift+', '⇧')
    .replace('Arrow', '')
    .replace('Escape', 'Esc')

const paletteRowOf = (
  row: Interaction,
  position: number,
  markedPosition: number,
): ListItem => ({
  action: `palette-run:${row.token}`,
  ...(position === markedPosition ? { isCurrent: true } : {}),
  key: row.token,
  lines: Array.map(row.keys, keyHintOf),
  title: row.label,
})

const paletteNode = (
  model: Model,
  query: string,
  markedPosition: number,
): UiNode =>
  Box(
    {
      layer: {
        dismissToken: 'layer-dismiss',
        kind: 'Dialog',
        label: 'Command palette',
      },
    },
    TextInput({
      focused: true,
      label: 'Command palette',
      placeholder: 'Type an action, a place, or an Issue',
      token: 'palette:',
      value: query,
    }),
    ...Array.match(paletteRowsOf(model, query), {
      onEmpty: () => [Text(`Nothing matches "${query.trim()}".`)],
      onNonEmpty: rows => [
        List({
          label: 'Actions and places',
          items: Array.map(rows, (row, position) =>
            paletteRowOf(row, position, markedPosition),
          ),
        }),
      ],
    }),
  )

const layerNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.layer).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NoLayer: () => [],
      PaletteLayer: ({ position, query }) => [
        paletteNode(model, query, position),
      ],
    }),
  )

/** Product tree: leftover board, progress, and linked Issue refs. */
export const productView = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    Text('Issues'),
    Row({ gap: 1 }, ...navigationButtons(model)),
    Column({ gap: 1 }, ...destinationNodes(model)),
    Column({ gap: 0 }, ...dockNodes(model)),
    Column({ gap: 0 }, ...layerNodes(model)),
  )
