import { Array, Match as M, Option } from 'effect'
import {
  Button,
  Column,
  Row,
  Text,
  TextInput,
  type UiNode,
} from 'foldkit/renderers'

import {
  type Issue,
  type IssueAttachment,
  type IssueMention,
  IssuePriority,
  type IssueReference,
  issueViewerUrl,
} from '@foldkit/instant-tools/issues'
import { quorumFromPeers } from '@foldkit/instant-tools/leftover'

import { laneHeading, sectionHeading } from './backlog.js'
import {
  landingHeadline,
  subtaskProgress,
  workInProgressLines,
} from './landing.js'
import {
  catalogIssueRefsOf,
  leftoverKindOf,
  leftoverQuorumRequired,
  leftoverStatusesForIssue,
  newestWorkLog,
} from './leftover.js'
import {
  type MentionedLine,
  type RecordingMentionGroup,
  lineRangeLabel,
  mentionedIn,
} from './mentionedIn.js'
import {
  type IssueDraftState,
  type IssueFilesState,
  type IssueLogsState,
  type Model,
} from './model.js'
import {
  interactionsForModel,
  listedBacklog,
  listedIssues,
} from './presentation.js'
import {
  describeIssueReference,
  issueAttachmentWebLink,
  issueReferenceWebLink,
} from './reference.js'
import { productForReference } from './update.js'

const kindLabel = (issue: Issue): string =>
  Option.getOrElse(leftoverKindOf(issue), () => '')

const listIssueLabel = (issue: Issue): string => {
  const kind = kindLabel(issue)
  return kind === ''
    ? `${issue.id}  ${issue.priority}  ${issue.status}  ${issue.title}`
    : `${issue.id}  ${issue.priority}  ${issue.status}  ${kind}  ${issue.title}`
}

const listButtonLabel = (issue: Issue): string => {
  const label = `${listIssueLabel(issue)}  [${issue.product.name}]`
  return Option.match(issue.workInProgress, {
    onNone: () => label,
    onSome: work => `${label}  ${landingHeadline(work)}`,
  })
}

const isoTimeOf = (timeMs: number): string => new Date(timeMs).toISOString()

const workLogLine = (entry: Issue['workLog'][number]): string => {
  const when = isoTimeOf(entry.occurredAtMs)
  const agent = Option.getOrElse(entry.agentId, () => '')
  return agent === ''
    ? `${when}  ${entry.summary}`
    : `${when}  ${entry.summary}  [${agent}]`
}

const labeledNodes = (
  label: string,
  value: Option.Option<string>,
): ReadonlyArray<UiNode> =>
  Option.toArray(Option.map(value, text => Text(`${label}: ${text}`)))

const referenceNode = (prefix: string, reference: IssueReference): UiNode => {
  const content = `${prefix}${describeIssueReference(reference)}`
  return Option.match(issueReferenceWebLink(reference), {
    onNone: () => Text(content),
    onSome: href => Text(content, { href }),
  })
}

const mentionNodes = (mention: IssueMention): ReadonlyArray<UiNode> => [
  Text(
    Array.join(
      [
        ...Option.toArray(Option.map(mention.capturedAtMs, isoTimeOf)),
        Option.getOrElse(
          Option.orElse(mention.directQuote, () => mention.note),
          () => '(no quote)',
        ),
      ],
      '  ',
    ),
  ),
  referenceNode('from ', mention.source),
  ...Option.toArray(
    Option.map(mention.reporter, reporter =>
      referenceNode('reported by ', reporter),
    ),
  ),
  ...Array.map(mention.related, related => referenceNode('', related)),
]

const mentionSectionNodes = (issue: Issue): ReadonlyArray<UiNode> =>
  Array.match(issue.mentions, {
    onEmpty: () => [],
    onNonEmpty: mentions => [
      Column(
        { gap: 1 },
        Text('Mentions'),
        ...Array.flatMap(mentions, mentionNodes),
      ),
    ],
  })

const mentionedLineNode = (line: MentionedLine): UiNode => {
  const content = `${lineRangeLabel(line)}  ${line.quote}`
  return Option.match(line.deepLink, {
    onNone: () => Text(content),
    onSome: href => Text(content, { href }),
  })
}

const recordingGroupHeader = (group: RecordingMentionGroup): string =>
  Option.match(group.newestAtMs, {
    onNone: () => group.recordingLabel,
    onSome: atMs => `${group.recordingLabel}  ${isoTimeOf(atMs).slice(0, 10)}`,
  })

const mentionedInSectionNodes = (issue: Issue): ReadonlyArray<UiNode> =>
  Array.match(mentionedIn(issue), {
    onEmpty: () => [],
    onNonEmpty: groups => [
      Column(
        { gap: 1 },
        Text('Mentioned in'),
        ...Array.flatMap(groups, group => [
          Text(recordingGroupHeader(group), { dim: true }),
          ...Array.map(group.lines, mentionedLineNode),
        ]),
      ),
    ],
  })

const workInProgressSectionNodes = (issue: Issue): ReadonlyArray<UiNode> =>
  Option.match(issue.workInProgress, {
    onNone: () => [],
    onSome: work => [
      Column(
        { gap: 1 },
        Text('Work in progress'),
        ...Array.map(workInProgressLines(work), line => Text(line)),
      ),
    ],
  })

const subtaskSectionNodes = (issue: Issue): ReadonlyArray<UiNode> =>
  Array.match(issue.subtasks, {
    onEmpty: () => [],
    onNonEmpty: subtasks => [
      Column(
        { gap: 1 },
        Text(`Subtasks: ${subtaskProgress(issue)}`),
        ...Array.map(subtasks, subtask =>
          Text(
            `${subtask.state._tag === 'Checked' ? 'done' : 'todo'}  ${subtask.title}`,
          ),
        ),
      ),
    ],
  })

/** How large a stored picture draws: a phone screen's shape, as wide as the page allows. */
const PICTURE_WIDTH = 240
const PICTURE_HEIGHT = 520

/**
 * Where a stored file opens: its web link, or for a file in Instant storage the
 * signed address the open Issue's files carry (Scribe #1345).
 */
const attachmentAddress = (
  attachment: IssueAttachment,
  issueFiles: IssueFilesState,
): Option.Option<string> =>
  Option.orElse(issueAttachmentWebLink(attachment.source), () =>
    attachment.source._tag === 'InstantStorage' &&
    issueFiles._tag === 'LoadedIssueFiles'
      ? Option.map(
          Array.findFirst(
            issueFiles.files,
            file =>
              attachment.source._tag === 'InstantStorage' &&
              file.fileId === attachment.source.fileId,
          ),
          file => file.url,
        )
      : Option.none(),
  )

const isPicture = (attachment: IssueAttachment): boolean =>
  attachment.contentType.startsWith('image/')

const attachmentSectionNodes = (
  issue: Issue,
  issueFiles: IssueFilesState,
): ReadonlyArray<UiNode> =>
  Array.match(issue.attachments, {
    onEmpty: () => [],
    onNonEmpty: attachments => [
      Column(
        { gap: 1 },
        Text('Attachments'),
        ...(issueFiles._tag === 'FailedIssueFiles'
          ? [
              Text(
                `This Issue's pictures could not be read: ${issueFiles.reason}`,
              ),
            ]
          : []),
        ...Array.map(attachments, attachment => {
          const content = `${attachment.fileName} (${attachment.kind})`
          return Option.match(attachmentAddress(attachment, issueFiles), {
            onNone: () => Text(content),
            onSome: href =>
              isPicture(attachment)
                ? Text(content, {
                    href,
                    image: {
                      height: PICTURE_HEIGHT,
                      src: href,
                      width: PICTURE_WIDTH,
                    },
                  })
                : Text(content, { href }),
          })
        }),
      ),
    ],
  })

const issueDetailNodes = (
  issue: Issue,
  issueFiles: IssueFilesState,
): ReadonlyArray<UiNode> => {
  const progress = newestWorkLog(issue.workLog)
  const links = catalogIssueRefsOf(issue)
  const pageUrl = issueViewerUrl(issue.id)
  return [
    Text(`${issue.id}  ${issue.priority}  ${issue.status}`),
    Text(issue.title),
    ...labeledNodes('Type', issue.issueType),
    ...labeledNodes('Area', issue.area),
    ...labeledNodes('Claimed by', issue.claimantId),
    ...labeledNodes('Reported', issue.reportedDate),
    Text(
      `Created ${isoTimeOf(issue.createdAtMs)}  Updated ${isoTimeOf(issue.updatedAtMs)}`,
      { dim: true },
    ),
    Text(issue.details),
    ...workInProgressSectionNodes(issue),
    ...subtaskSectionNodes(issue),
    ...mentionedInSectionNodes(issue),
    ...mentionSectionNodes(issue),
    Column(
      { gap: 1 },
      Text('Work log'),
      ...(Array.isReadonlyArrayEmpty(progress)
        ? [Text('No work log yet.')]
        : Array.map(progress, entry => Text(workLogLine(entry)))),
    ),
    Column(
      { gap: 1 },
      Text('Linked issues'),
      ...(Array.isReadonlyArrayEmpty(links)
        ? [Text('No linked issues.')]
        : Array.map(links, ref =>
            Button({
              token: `open:${ref.id}`,
              label: ref.id,
            }),
          )),
    ),
    Row(
      { gap: 1 },
      ...Array.map(leftoverStatusesForIssue(issue.id), status =>
        Button({
          token: `status:${status}`,
          label: status,
          variant: status === issue.status ? 'Primary' : 'Ghost',
        }),
      ),
    ),
    ...(Array.isReadonlyArrayEmpty(issue.successCriteria)
      ? []
      : [
          Column(
            { gap: 1 },
            Text('Success criteria'),
            ...Array.map(issue.successCriteria, criterion =>
              Text(
                `${criterion.isSatisfied ? 'done' : 'look'}  ${criterion.outcome}`,
              ),
            ),
          ),
        ]),
    ...attachmentSectionNodes(issue, issueFiles),
    Text(`${issue.product._tag}: ${issue.product.name}`),
    Text(pageUrl, { href: pageUrl }),
  ]
}

const navigationButtons = (model: Model): ReadonlyArray<UiNode> =>
  Array.map(
    Array.filter(
      interactionsForModel(model),
      interaction =>
        interaction.token === 'file' ||
        interaction.token === 'triage' ||
        interaction.token === 'backlog' ||
        interaction.token === 'back',
    ),
    interaction =>
      Button({ token: interaction.token, label: interaction.label }),
  )

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

const listNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.issues).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      LoadingIssues: () => [Text('Observing…')],
      FailedIssues: ({ reason }) => [Text(reason)],
      LoadedIssues: ({ issues }) => {
        const visible = listedIssues(model, issues)
        return [
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
          ),
          Text('Current issues'),
          ...Array.map(visible, issue =>
            Button({
              token: `open:${issue.id}`,
              label: listButtonLabel(issue),
            }),
          ),
        ]
      },
    }),
  )

const issueButtons = (issues: ReadonlyArray<Issue>): ReadonlyArray<UiNode> =>
  Array.map(issues, issue =>
    Button({
      token: `open:${issue.id}`,
      label: listButtonLabel(issue),
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
          ...Array.flatMap(backlog.lanes, lane => [
            Column(
              { gap: 1 },
              Text(laneHeading(lane)),
              ...issueButtons(lane.issues),
            ),
          ]),
          ...Array.flatMap(backlog.sections, section => [
            Column(
              { gap: 1 },
              Text(sectionHeading(section)),
              ...issueButtons(section.issues),
            ),
          ]),
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
          onSome: observed => issueDetailNodes(observed, model.issueFiles),
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
      IssueList: () => listNodes(model),
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
    }),
  )

/** Product tree: leftover board, progress, and linked Issue refs. */
export const productView = (model: Model): UiNode =>
  Column(
    { gap: 1 },
    Text('Issues'),
    Row({ gap: 1 }, ...navigationButtons(model)),
    ...destinationNodes(model),
  )
