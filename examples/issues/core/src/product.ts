import { Array, Match as M, Option } from 'effect'
import {
  Button,
  Column,
  Row,
  Text,
  TextInput,
  type UiNode,
} from 'foldkit/renderers'

import { type Issue } from '@foldkit/instant-tools/issues'

import {
  catalogIssueRefsOf,
  issuesForProductFilter,
  leftoverKindOf,
  leftoverStatusOf,
  leftoverStatusesForIssue,
  newestWorkLog,
} from './leftover.js'
import { type Model } from './model.js'
import { interactionsForModel } from './presentation.js'

const kindLabel = (issue: Issue): string =>
  Option.getOrElse(leftoverKindOf(issue), () => '')

const listIssueLabel = (issue: Issue): string => {
  const kind = kindLabel(issue)
  const leftover = leftoverStatusOf(issue.status)
  return kind === ''
    ? `${issue.id}  ${issue.priority}  ${leftover}  ${issue.title}`
    : `${issue.id}  ${issue.priority}  ${leftover}  ${kind}  ${issue.title}`
}

const workLogLine = (entry: Issue['workLog'][number]): string => {
  const when = new Date(entry.occurredAtMs).toISOString()
  const agent = Option.getOrElse(entry.agentId, () => '')
  return agent === ''
    ? `${when}  ${entry.summary}`
    : `${when}  ${entry.summary}  [${agent}]`
}

const issueDetailNodes = (issue: Issue): ReadonlyArray<UiNode> => {
  const leftover = leftoverStatusOf(issue.status)
  const kind = leftoverKindOf(issue)
  const progress = newestWorkLog(issue.workLog)
  const links = catalogIssueRefsOf(issue)
  return [
    Text(`${issue.id}  ${issue.priority}  ${leftover}`),
    ...Option.match(kind, {
      onNone: () => [],
      onSome: value => [Text(value)],
    }),
    Text(issue.title),
    Text(issue.details),
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
          variant: status === leftover ? 'Primary' : 'Ghost',
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
    Text(`${issue.product._tag}: ${issue.product.name}`),
    ...Option.match(issue.viewerURL, {
      onNone: () => [],
      onSome: url => (url === '' ? [] : [Text(url, { href: url })]),
    }),
  ]
}

const navigationButtons = (model: Model): ReadonlyArray<UiNode> =>
  Array.map(
    Array.filter(
      interactionsForModel(model),
      interaction =>
        interaction.token === 'file' ||
        interaction.token === 'triage' ||
        interaction.token === 'back' ||
        interaction.token === 'submit',
    ),
    interaction =>
      Button({ token: interaction.token, label: interaction.label }),
  )

const listNodes = (model: Model): ReadonlyArray<UiNode> =>
  M.value(model.issues).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      LoadingIssues: () => [Text('Observing…')],
      FailedIssues: ({ reason }) => [Text(reason)],
      LoadedIssues: ({ issues }) => {
        const visible = issuesForProductFilter(issues, model.productFilter)
        const catalog =
          model.products._tag === 'LoadedProducts'
            ? model.products.products
            : []
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
          Array.filter(fromIssues, entry =>
            preferred.includes(entry.product.id),
          ),
          Array.filter(
            fromIssues,
            entry => !preferred.includes(entry.product.id),
          ),
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
          Text('Current issues'),
          ...Array.map(visible, issue =>
            Button({
              token: `open:${issue.id}`,
              label: `${listIssueLabel(issue)}  [${issue.product.name}]`,
            }),
          ),
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
          onSome: observed => issueDetailNodes(observed),
        }),
    }),
  )

const fileNodes = (model: Model): ReadonlyArray<UiNode> => [
  Text('File issue'),
  Text(`Title: ${model.draft.title}`),
  Text(`Product: ${model.draft.productId}`),
  Text(`Priority: ${model.draft.priority}`),
  Text(`State: ${model.draftState._tag}`),
  ...(model.draftState._tag === 'FailedIssueDraft'
    ? [Text(model.draftState.reason)]
    : []),
  Text(`Catalog: ${model.products._tag}`),
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
