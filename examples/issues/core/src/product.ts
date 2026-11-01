import { Array, Match as M, Option } from 'effect'
import {
  Box,
  Button,
  Column,
  List,
  type ListItem,
  Plain,
  Reference,
  RichText,
  Row,
  Text,
  TextInput,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import { type Issue, IssuePriority } from '@foldkit/instant-tools/issues'
import { quorumFromPeers } from '@foldkit/instant-tools/leftover'

import { askFlowNodes } from './askFlowPage.js'
import { laneHeading, sectionHeading } from './backlog.js'
import { CARD_DROP_TOKEN_PREFIX } from './board.js'
import { menuHasField, productChoicesOf, sortNameOf } from './choices.js'
import { entityPageNodes } from './entityPage.js'
import { decisionsPageNodes } from './decisionPage.js'
import { featuresPageNodes } from './featurePage.js'
import { findingsPageNodes } from './findingsPage.js'
import { questionsPageNodes } from './questionPage.js'
import { remindersPageNodes } from './reminderPage.js'
import { inboxNodes } from './inboxPage.js'
import { type Interaction } from './interaction.js'
import { issuePageNodes } from './issuePage.js'
import {
  type ClaimantFilter,
  type IssueGroup,
  type IssueView,
} from './issueView.js'
import { type SavedView } from './issueViews.js'
import { navigationInteractionsOf } from './keys.js'
import { type ProductFilter, leftoverQuorumRequired } from './leftover.js'
import {
  cardOf,
  currentRowOf,
  issueCountWords,
  selectableRowOf,
} from './listRows.js'
import {
  isPageOfRows,
  issuesInHandOf,
  listedBacklog,
  listedColumns,
  listedGroups,
  listedIssues,
  loadedIssuesIn,
  productFilterOf,
  savedViewsOf,
  selectedRowsOf,
  selectedSetOf,
} from './listing.js'
import { type MenuRow, menuRowsOf } from './menus.js'
import {
  type ChoiceMenu,
  type IssueDraftState,
  type IssueLogsState,
  type Model,
} from './model.js'
import { productsPageNodes } from './productPage.js'
import { listPathOfSearch, searchOfView } from './route.js'
import {
  type FailedRowEdit,
  issueWithEdits,
  rowChangeWords,
} from './rowEdit.js'
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
  shapedAs: (row: ListItem) => ListItem = row => row,
): ReadonlyArray<ListItem> => {
  const selected = selectedSetOf(model)
  const maybeCursorId = Option.getOrUndefined(model.maybeRowCursor)
  return Array.map(issues, issue => {
    const row = shapedAs(selectableRowOf(issue, selected.has(issue.id)))
    return issue.id === maybeCursorId ? currentRowOf(row) : row
  })
}

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

const menuButton = (
  token: string,
  label: string,
  isFiltering: boolean,
): UiNode =>
  Button({
    label,
    token,
    variant: isFiltering ? 'Primary' : 'Ghost',
  })

const productNameOf = (model: Model, filter: ProductFilter): string =>
  filter._tag === 'OneProduct'
    ? Option.match(
        Array.findFirst(
          productChoicesOf(model),
          product => product.id === filter.productId,
        ),
        {
          onNone: () => filter.productId,
          onSome: product => product.name,
        },
      )
    : 'All'

const productFilterButton = (model: Model, filter: ProductFilter): UiNode =>
  menuButton(
    'menu:product',
    `Product: ${productNameOf(model, filter)}`,
    filter._tag === 'OneProduct',
  )

const chosenWords = (
  chosen: ReadonlyArray<string>,
  noneChosen: string,
): string =>
  Array.isReadonlyArrayEmpty(chosen) ? noneChosen : Array.join(chosen, ', ')

const claimantWords = (filter: ClaimantFilter): string =>
  M.value(filter).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      AnyClaimant: () => 'Anyone',
      Unclaimed: () => 'Unclaimed',
      OneClaimant: ({ claimantId }) => claimantId,
    }),
  )

const filterButtons = (
  model: Model,
  view: IssueView,
): ReadonlyArray<UiNode> => [
  productFilterButton(model, view.product),
  menuButton(
    'menu:status',
    `Status: ${chosenWords(view.statuses, 'Any')}`,
    Array.isReadonlyArrayNonEmpty(view.statuses),
  ),
  menuButton(
    'menu:priority',
    `Priority: ${chosenWords(view.priorities, 'Any')}`,
    Array.isReadonlyArrayNonEmpty(view.priorities),
  ),
  menuButton(
    'menu:claimant',
    `Claimant: ${claimantWords(view.claimant)}`,
    view.claimant._tag !== 'AnyClaimant',
  ),
  menuButton(
    'menu:sort',
    `Sort: ${sortNameOf(view.sort)}`,
    view.sort !== 'Created',
  ),
  menuButton('menu:group', `Group: ${view.grouping}`, view.grouping !== 'None'),
  menuButton(
    view.layout === 'Board' ? 'view:list' : 'view:board',
    'Board',
    view.layout === 'Board',
  ),
]

const saveViewButtons = (
  model: Model,
  view: IssueView,
): ReadonlyArray<UiNode> => {
  const shown = searchOfView(view)
  return Array.some(savedViewsOf(model), saved => saved.query === shown)
    ? []
    : [menuButton('view-save', 'Save view', false)]
}

const landingButtons = (view: IssueView): ReadonlyArray<UiNode> => [
  Button({
    token: 'landing:all',
    label: 'All work',
    variant: view.landing._tag === 'AllWork' ? 'Primary' : 'Ghost',
  }),
  Button({
    token: 'landing:close',
    label: 'Close to landing',
    variant: view.landing._tag === 'CloseToLanding' ? 'Primary' : 'Ghost',
  }),
  Button({
    token: 'landing:working',
    label: 'Working now',
    variant: view.landing._tag === 'WorkingNow' ? 'Primary' : 'Ghost',
  }),
]

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

const groupedRowNodes = (
  model: Model,
  view: IssueView,
  issues: ReadonlyArray<Issue>,
  listed: ReadonlyArray<Issue>,
): ReadonlyArray<UiNode> =>
  view.grouping === 'None'
    ? rowNodes(model, listed)
    : Array.map(listedGroups(model, issues), group =>
        groupNode(model, {
          heading: `${group.name}: ${issueCountWords(group.issues.length)}`,
          issues: group.issues,
        }),
      )

const boardColumnNode = (model: Model, column: IssueGroup): UiNode =>
  Column(
    { gap: 1 },
    Text(`${column.name}: ${issueCountWords(column.issues.length)}`),
    List({
      dropAction: `${CARD_DROP_TOKEN_PREFIX}${column.name}`,
      items: placedRowsOf(model, column.issues, cardOf),
      label: column.name,
    }),
  )

const boardNode = (model: Model, issues: ReadonlyArray<Issue>): UiNode =>
  Row(
    { gap: 1, isBoard: true },
    ...Array.map(listedColumns(model, issues), column =>
      boardColumnNode(model, column),
    ),
  )

const savedViewChip = (saved: SavedView, shown: string): TextPart =>
  Reference({
    href: listPathOfSearch(saved.query),
    kind: saved.query === shown ? 'CurrentView' : 'View',
    label: saved.name,
  })

const savedViewNodes = (
  model: Model,
  view: IssueView,
): ReadonlyArray<UiNode> => {
  const shown = searchOfView(view)
  return Array.match(savedViewsOf(model), {
    onEmpty: () =>
      model.savedViews._tag === 'FailedSavedViews'
        ? [
            Text(`Saved views could not be read: ${model.savedViews.reason}`, {
              dim: true,
            }),
          ]
        : [],
    onNonEmpty: views => [
      RichText(
        Array.intersperse(
          Array.map(views, saved => savedViewChip(saved, shown)),
          Plain(' '),
        ),
      ),
    ],
  })
}

const searchRow = (
  model: Model,
  view: IssueView,
  words: ReadonlyArray<UiNode>,
): UiNode => Row({ gap: 1 }, searchField(model, view), ...words)

const listNodes = (model: Model, view: IssueView): ReadonlyArray<UiNode> =>
  M.value(model.issues).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      LoadingIssues: () => [searchRow(model, view, [Text('Observing…')])],
      FailedIssues: ({ reason }) => [searchRow(model, view, [Text(reason)])],
      LoadedIssues: () => {
        const issues = loadedIssuesIn(model)
        const visible = listedIssues(model, issues)
        return [
          searchRow(model, view, [
            Text(listedCountWords(view, visible.length, issues.length)),
          ]),
          ...savedViewNodes(model, view),
          Row(
            { gap: 1 },
            ...landingButtons(view),
            ...filterButtons(model, view),
            menuButton('menu:views', 'Views', false),
            ...saveViewButtons(model, view),
          ),
          ...(view.layout === 'Board'
            ? [boardNode(model, issues)]
            : groupedRowNodes(model, view, issues, visible)),
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
      LoadedIssues: () => {
        const backlog = listedBacklog(model, loadedIssuesIn(model))
        return [
          Text('Backlog'),
          Row({ gap: 1 }, productFilterButton(model, productFilterOf(model))),
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

const issueActionNodes = (model: Model): ReadonlyArray<UiNode> => [
  Row(
    { gap: 1 },
    TextInput({
      blurToken: 'writing-blur:Comment',
      focusToken: 'writing-focus:Comment',
      label: 'Comment',
      placeholder: 'Comment',
      token: 'comment-draft:',
      value: model.leftoverComment,
    }),
    Button({ label: 'Comment', token: 'comment-submit' }),
  ),
  Row(
    { gap: 1 },
    TextInput({
      label: 'Link issue',
      placeholder: 'Issue id',
      token: 'link-draft:',
      value: model.leftoverLink,
    }),
    Button({ label: 'Link', token: 'link-submit' }),
  ),
  ...(model.issueMutation._tag === 'FailedIssueMutation'
    ? [Text(model.issueMutation.reason)]
    : []),
  ...(model.issueMutation._tag === 'SavingIssueMutation'
    ? [Text('Saving leftover…')]
    : []),
]

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
          onSome: observed =>
            issuePageNodes(
              model,
              issueWithEdits(observed, model.rowEdits),
              issueActionNodes(model),
            ),
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

const findingDraftNodes = (model: Model): ReadonlyArray<UiNode> =>
  Option.toArray(
    Option.map(model.maybeDraftFindingId, findingId =>
      RichText([
        Plain('This files '),
        Reference({
          label: 'a finding',
          kind: 'Finding',
          href: `/findings/${findingId}`,
          detail: [`Finding ${findingId}`],
        }),
        Plain('; its row will name the Issue.'),
      ]),
    ),
  )

const fileNodes = (model: Model): ReadonlyArray<UiNode> => [
  Text('File issue'),
  ...findingDraftNodes(model),
  TextInput({
    blurToken: 'writing-blur:Title',
    focused: true,
    focusToken: 'writing-focus:Title',
    label: 'Title',
    placeholder: 'Title',
    token: 'title:',
    value: model.draft.title,
  }),
  TextInput({
    blurToken: 'writing-blur:Details',
    focusToken: 'writing-focus:Details',
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
  Button({
    token: 'submit',
    label: 'Submit issue',
    variant: 'Primary',
    ...(model.draftState._tag === 'SavingIssueDraft'
      ? { disabled: true, because: 'Filing…' }
      : {}),
  }),
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
      ],
      FileIssue: () => fileNodes(model),
      TriageInbox: () => triageNodes(model),
      Backlog: () => backlogNodes(model),
      AskFlow: () => askFlowNodes(model),
      Inbox: ({ kind }) => inboxNodes(model, kind),
      EntityPage: ({ entity }) => entityPageNodes(model, entity),
      Findings: ({ filter }) => findingsPageNodes(model, filter),
      Decisions: ({ filter }) => decisionsPageNodes(model, filter),
      Questions: ({ filter }) => questionsPageNodes(model, filter),
      Reminders: ({ filter }) => remindersPageNodes(model, filter),
      Features: () => featuresPageNodes(model),
      Products: () => productsPageNodes(model),
    }),
  )

const GO_KEY_CHOICES =
  'Go to: l list, b backlog, t triage, v views, i inbox, f findings, d decisions, q questions, r reminders, e features, p products'

const savingWords = (count: number): string =>
  count === 1 ? 'Saving 1 change…' : `Saving ${count.toString()} changes…`

const failedEditWords = ({ edit, reason }: FailedRowEdit): string =>
  `Not saved: #${edit.issueId} ${rowChangeWords(edit.change)}: ${reason}`

const SELECTION_KEYS = 's status, p priority, a claim, x let go, Esc clear'

const hiddenWords = (hiddenCount: number): string =>
  hiddenCount === 0
    ? ''
    : `, ${hiddenCount.toLocaleString('en-US')} hidden by this view`

const selectionNodes = (model: Model): ReadonlyArray<UiNode> => {
  const shownCount = selectedRowsOf(model).length
  const hiddenCount = model.selectedIssueIds.length - shownCount
  return Array.isReadonlyArrayEmpty(model.selectedIssueIds) ||
    !isPageOfRows(model)
    ? []
    : [
        Text(
          `${shownCount.toLocaleString('en-US')} selected${hiddenWords(hiddenCount)}: ${SELECTION_KEYS}`,
        ),
        Row(
          { gap: 1 },
          ...(shownCount === 0
            ? []
            : [
                Button({ label: 'Status', token: 'menu:set-status' }),
                Button({ label: 'Priority', token: 'menu:set-priority' }),
                Button({ label: 'Claim', token: 'menu:claim' }),
              ]),
          Button({ label: 'Clear', token: 'selection-clear' }),
        ),
      ]
}

const viewFailureNodes = (model: Model): ReadonlyArray<UiNode> =>
  Option.match(model.maybeViewFailure, {
    onNone: () => [],
    onSome: reason => [
      Text(reason),
      Button({ label: 'Dismiss', token: 'view-failure-dismiss' }),
    ],
  })

const dockChildren = (model: Model): ReadonlyArray<UiNode> => [
  ...(model.isGoKeyPending ? [Text(GO_KEY_CHOICES)] : []),
  ...selectionNodes(model),
  ...viewFailureNodes(model),
  ...(Array.isReadonlyArrayNonEmpty(model.rowEdits)
    ? [Text(savingWords(model.rowEdits.length))]
    : []),
  ...Array.map(model.failedRowEdits, failed => Text(failedEditWords(failed))),
  ...(Array.isReadonlyArrayNonEmpty(model.failedRowEdits)
    ? [Button({ label: 'Dismiss', token: 'edits-dismiss' })]
    : []),
]

const dockNodes = (model: Model): ReadonlyArray<UiNode> =>
  Array.match(dockChildren(model), {
    onEmpty: () => [],
    onNonEmpty: children => [Box({ isDock: true }, ...children)],
  })

const keyHintOf = (key: string): string =>
  key
    .replace('Meta+', '⌘')
    .replace('Control+', 'Ctrl ')
    .replace('Shift+', '⇧')
    .replace('Arrow', '')
    .replace('Escape', 'Esc')

const CHOSEN_MARK = '✓'

const menuRowLines = (row: MenuRow): ReadonlyArray<string> => [
  ...Array.map(row.action.keys, keyHintOf),
  ...(row.isChosen ? [CHOSEN_MARK] : []),
  ...Option.toArray(
    Option.map(row.count, count => count.toLocaleString('en-US')),
  ),
]

const plainMenuItems = new WeakMap<Interaction, ListItem>()

const menuRowItemOf = (row: MenuRow): ListItem => ({
  ...Option.match(row.maybeHref ?? Option.none(), {
    onNone: () => ({ action: `palette-run:${row.action.token}` }),
    onSome: href => ({ href }),
  }),
  key: row.action.token,
  lines: menuRowLines(row),
  title: row.action.label,
  ...(row.trailing === undefined ? {} : { trailing: row.trailing }),
})

const plainMenuRowItemOf = (row: MenuRow): ListItem =>
  Option.getOrElse(
    Option.fromUndefinedOr(plainMenuItems.get(row.action)),
    () => {
      const item = menuRowItemOf(row)
      plainMenuItems.set(row.action, item)
      return item
    },
  )

const menuRowItem = (
  row: MenuRow,
  position: number,
  markedPosition: number,
): ListItem => {
  const item =
    Option.isNone(row.count) && !row.isChosen && row.trailing === undefined
      ? plainMenuRowItemOf(row)
      : menuRowItemOf(row)
  return position === markedPosition ? { ...item, isCurrent: true } : item
}

const issuesInHandWords = (model: Model): string =>
  Array.match(issuesInHandOf(model), {
    onEmpty: () => 'no Issue',
    onNonEmpty: ([first, ...rest]) =>
      Array.isReadonlyArrayEmpty(rest)
        ? `#${first}`
        : `${(rest.length + 1).toString()} selected Issues`,
  })

const menuLabelOf = (model: Model, menu: ChoiceMenu): string =>
  M.value(menu).pipe(
    M.withReturnType<string>(),
    M.when('Everything', () => 'Command palette'),
    M.when('ProductFilter', () => 'Product'),
    M.when('StatusFilter', () => 'Status'),
    M.when('PriorityFilter', () => 'Priority'),
    M.when('ClaimantFilter', () => 'Claimant'),
    M.when('Sort', () => 'Sort by'),
    M.when('Group', () => 'Group by'),
    M.when('SetStatus', () => `Status of ${issuesInHandWords(model)}`),
    M.when('SetPriority', () => `Priority of ${issuesInHandWords(model)}`),
    M.when('SetClaim', () => `Claim ${issuesInHandWords(model)}`),
    M.when('SetProduct', () => `Product of ${issuesInHandWords(model)}`),
    M.when('SavedViews', () => 'Saved views'),
    M.exhaustive,
  )

const menuFieldNodes = (
  model: Model,
  menu: ChoiceMenu,
  query: string,
): ReadonlyArray<UiNode> =>
  menuHasField(menu)
    ? [
        TextInput({
          focused: true,
          label: menuLabelOf(model, menu),
          placeholder:
            menu === 'Everything'
              ? 'Type an action, a place, or an Issue'
              : `${menuLabelOf(model, menu)}: type to narrow`,
          token: 'palette:',
          value: query,
        }),
      ]
    : [Text(menuLabelOf(model, menu), { emphasis: 'Headline' })]

const choiceLayerNode = (
  model: Model,
  menu: ChoiceMenu,
  query: string,
  markedPosition: number,
): UiNode =>
  Box(
    {
      layer: {
        dismissToken: 'layer-dismiss',
        kind: 'Dialog',
        label: menuLabelOf(model, menu),
      },
    },
    ...menuFieldNodes(model, menu, query),
    ...Array.match(menuRowsOf(model, menu, query), {
      onEmpty: () => [Text(`Nothing matches "${query.trim()}".`)],
      onNonEmpty: rows => [
        List({
          label: menuLabelOf(model, menu),
          items: Array.map(rows, (row, position) =>
            menuRowItem(row, position, markedPosition),
          ),
        }),
      ],
    }),
  )

const peekNode = (model: Model, issueId: string): UiNode =>
  Box(
    {
      layer: {
        dismissToken: 'layer-dismiss',
        kind: 'Panel',
        label: `Peek at #${issueId}`,
      },
    },
    ...Option.match(
      Array.findFirst(loadedIssuesIn(model), issue => issue.id === issueId),
      {
        onNone: () => [Text(`#${issueId} is no longer stored.`)],
        onSome: issue => issuePageNodes(model, issue),
      },
    ),
  )

const namingViewNode = (
  maybeViewId: Option.Option<string>,
  name: string,
): UiNode => {
  const label = Option.isSome(maybeViewId) ? 'Rename view' : 'Save this view'
  return Box(
    {
      layer: {
        dismissToken: 'layer-dismiss',
        kind: 'Dialog',
        label,
      },
    },
    Text(label, { emphasis: 'Headline' }),
    TextInput({
      focused: true,
      label: 'Name',
      placeholder: 'What to call this view',
      token: 'view-name:',
      value: name,
    }),
    Button({ label: 'Save', token: 'view-name-submit', variant: 'Primary' }),
  )
}

const layerNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.layer).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NoLayer: () => [],
      ChoiceLayer: ({ menu, position, query }) => [
        choiceLayerNode(model, menu, query, position),
      ],
      PeekLayer: ({ issueId }) => [peekNode(model, issueId)],
      NamingViewLayer: ({ maybeViewId, name }) => [
        namingViewNode(maybeViewId, name),
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
