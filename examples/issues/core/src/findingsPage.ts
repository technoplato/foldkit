import { Array, Match as M, Option, Order, pipe } from 'effect'
import {
  Column,
  Plain,
  Reference,
  RichText,
  Row,
  Text,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import { type Issue } from '@foldkit/instant-tools/issues'

import { type ChipContext, chipContextOf, chipFactsOf } from './chips.js'
import { type ChipClock, agentChip, spacedChips } from './graphChips.js'
import { type AgentFinding, type FindingFacts } from './graphFacts.js'
import { findingNodes, findingSourceName } from './graphPageParts.js'
import { loadedIssuesIn } from './listing.js'
import { type FindingFilter, Findings, type Model } from './model.js'
import { navigationToPath } from './route.js'
import { readTextReferences } from './textReferences.js'

const KIND_ORDER = ['mistake', 'environment', 'product']
const STATUS_ORDER = ['open', 'promoted', 'attached', 'fixed', 'dismissed']

type Tally = Readonly<{ count: number; name: string }>

const tallied = (names: ReadonlyArray<string>): ReadonlyArray<Tally> => {
  const counts = new Map<string, number>()
  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return Array.map([...counts], ([name, count]) => ({ count, name }))
}

const knownFirst =
  (order: ReadonlyArray<string>): Order.Order<Tally> =>
  (left, right) => {
    const rank = (tally: Tally): number => {
      const at = order.indexOf(tally.name)
      return at >= 0 ? at : order.length
    }
    return Order.Number(rank(left), rank(right))
  }

const mostFirst: Order.Order<Tally> = Order.flip(
  Order.mapInput(Order.Number, (tally: Tally) => tally.count),
)

const matches = (filter: FindingFilter, finding: AgentFinding): boolean =>
  Option.getOrElse(
    Option.map(filter.maybeKind, kind => kind === finding.kind),
    () => true,
  ) &&
  Option.getOrElse(
    Option.map(filter.maybeSource, source => source === finding.source),
    () => true,
  ) &&
  Option.getOrElse(
    Option.map(filter.maybeStatus, status => status === finding.status),
    () => true,
  )

const pathOf = (filter: FindingFilter): string =>
  navigationToPath(Findings.make({ filter }))

const countChip = (
  tally: Tally,
  name: string,
  isChosen: boolean,
  filter: FindingFilter,
): TextPart =>
  Reference({
    label: name,
    title: tally.count.toString(),
    ...(isChosen ? { state: 'shown' } : {}),
    kind: 'Finding',
    href: pathOf(filter),
    detail: [`${tally.count.toString()} findings`],
  })

const noFilter: FindingFilter = {
  maybeKind: Option.none(),
  maybeSource: Option.none(),
  maybeStatus: Option.none(),
}

const countsNodes = (
  findings: ReadonlyArray<AgentFinding>,
  filter: FindingFilter,
): ReadonlyArray<UiNode> => {
  const line = (
    heading: string,
    tallies: ReadonlyArray<Tally>,
    nameOf: (tally: Tally) => string,
    isChosen: (tally: Tally) => boolean,
    filterOf: (tally: Tally) => FindingFilter,
  ): UiNode =>
    RichText([
      Plain(heading),
      ...spacedChips(
        Array.map(tallies, tally =>
          countChip(tally, nameOf(tally), isChosen(tally), filterOf(tally)),
        ),
      ),
    ])
  return [
    line(
      'Kind',
      Array.sort(
        tallied(Array.map(findings, finding => finding.kind)),
        knownFirst(KIND_ORDER),
      ),
      tally => tally.name,
      tally => Option.contains(filter.maybeKind, tally.name),
      tally => ({ ...noFilter, maybeKind: Option.some(tally.name) }),
    ),
    line(
      'Source',
      Array.sort(
        tallied(Array.map(findings, finding => finding.source)),
        mostFirst,
      ),
      tally => findingSourceName(tally.name),
      tally => Option.contains(filter.maybeSource, tally.name),
      tally => ({ ...noFilter, maybeSource: Option.some(tally.name) }),
    ),
    line(
      'State',
      Array.sort(
        tallied(Array.map(findings, finding => finding.status)),
        knownFirst(STATUS_ORDER),
      ),
      tally => tally.name,
      tally => Option.contains(filter.maybeStatus, tally.name),
      tally => ({ ...noFilter, maybeStatus: Option.some(tally.name) }),
    ),
  ]
}

const findingCountWords = (count: number): string =>
  count === 1 ? '1 finding' : `${count.toLocaleString('en-US')} findings`

const isFiltered = (filter: FindingFilter): boolean =>
  Option.isSome(filter.maybeKind) ||
  Option.isSome(filter.maybeSource) ||
  Option.isSome(filter.maybeStatus)

const shownWords = (
  shown: number,
  total: number,
  filter: FindingFilter,
): string =>
  isFiltered(filter)
    ? `${shown.toLocaleString('en-US')} of ${findingCountWords(total)}`
    : findingCountWords(total)

const allChip = (
  total: number,
  filter: FindingFilter,
): ReadonlyArray<UiNode> =>
  isFiltered(filter)
    ? [
        RichText([
          Reference({
            label: 'All',
            title: total.toLocaleString('en-US'),
            kind: 'Finding',
            href: pathOf(noFilter),
            detail: ['Every finding'],
          }),
        ]),
      ]
    : []

const issueIdsInText = (text: string): ReadonlyArray<string> =>
  Array.flatMap(readTextReferences(text), piece =>
    piece._tag === 'Referenced' && piece.reference._tag === 'IssueNumber'
      ? [piece.reference.issueId]
      : [],
  )

const namedIssuesOf = (
  finding: AgentFinding,
  context: ChipContext,
): ReadonlyArray<Issue | undefined> =>
  Array.map(
    [
      ...Option.toArray(finding.maybeIssueId),
      ...Option.toArray(finding.maybePromotedIssueId),
      ...issueIdsInText(finding.quote),
    ],
    issueId => context.issuesById.get(issueId),
  )

type RememberedRow = Readonly<{
  agents: ChipContext['agentsByHandle']
  builds: ChipContext['buildsByNumber']
  issues: ReadonlyArray<Issue | undefined>
  nowMs: number
  offsetMinutes: number
  row: UiNode
}>

const rememberedRows = new WeakMap<AgentFinding, RememberedRow>()

const sameIssues = (
  left: ReadonlyArray<Issue | undefined>,
  right: ReadonlyArray<Issue | undefined>,
): boolean =>
  left.length === right.length &&
  left.every((issue, index) => issue === right[index])

/**
 * One finding's row, built again only when something it shows changed: its
 * clock, its run's state, or an Issue it names. A live change to one of 1,500
 * Issues builds the rows that name it, not all 450.
 */
const findingRow = (
  finding: AgentFinding,
  context: ChipContext,
  clock: ChipClock,
): UiNode => {
  const issues = namedIssuesOf(finding, context)
  const remembered = rememberedRows.get(finding)
  if (
    remembered !== undefined &&
    remembered.nowMs === clock.nowMs &&
    remembered.offsetMinutes === clock.offsetMinutes &&
    remembered.agents === context.agentsByHandle &&
    remembered.builds === context.buildsByNumber &&
    sameIssues(remembered.issues, issues)
  ) {
    return remembered.row
  }
  const row = Column({ gap: 0 }, ...findingNodes(finding, context, clock))
  rememberedRows.set(finding, {
    agents: context.agentsByHandle,
    builds: context.buildsByNumber,
    issues,
    nowMs: clock.nowMs,
    offsetMinutes: clock.offsetMinutes,
    row,
  })
  return row
}

const loadedNodes = (
  model: Model,
  findings: ReadonlyArray<AgentFinding>,
  filter: FindingFilter,
): ReadonlyArray<UiNode> => {
  const context = chipContextOf(
    loadedIssuesIn(model),
    model.clock.nowMs,
    model.clock.offsetMinutes,
    chipFactsOf(model),
  )
  const shown = Array.filter(findings, finding => matches(filter, finding))
  return [
    Text(shownWords(shown.length, findings.length, filter), { dim: true }),
    ...countsNodes(findings, filter),
    ...allChip(findings.length, filter),
    ...Array.map(shown, finding => findingRow(finding, context, model.clock)),
  ]
}

/**
 * What agents reported running into, every one of them, the newest first:
 * how many there are of each kind, source and state, each count a link that
 * shows just those, then each finding with its run, session and Issue, its
 * words, its fix, and what it became.
 */
export const findingsPageNodes = (
  model: Model,
  filter: FindingFilter,
): ReadonlyArray<UiNode> => [
  Text('Findings', { emphasis: 'Headline' }),
  ...M.value(model.findingsList).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NotObservingFindings: () => [Text('Observing…')],
      FailedFindings: ({ reason }) => [
        Text(`Scribe’s rows could not be read: ${reason}`, { dim: true }),
      ],
      LoadedFindings: ({ findings }) => loadedNodes(model, findings, filter),
    }),
  ),
]

/** What Scribe's rows say about one finding: it whole, and the run behind it. */
export const findingFactNodes = (
  { finding, maybeRun }: FindingFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => [
  ...findingNodes(finding, context, clock),
  ...Option.toArray(
    Option.map(maybeRun, run =>
      Row({ gap: 1 }, RichText([Plain('Run '), agentChip(run, clock)])),
    ),
  ),
  ...pipe(
    finding.maybeQuoteLength,
    Option.map(length =>
      Text(`Its words ran to ${length.toLocaleString('en-US')} characters.`, {
        dim: true,
      }),
    ),
    Option.toArray,
  ),
]
