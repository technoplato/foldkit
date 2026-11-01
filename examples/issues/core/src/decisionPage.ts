import { Array, Match as M, Option, pipe } from 'effect'
import {
  Column,
  Plain,
  Reference,
  RichText,
  Text,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import {
  type ChipContext,
  chipContextOf,
  chipFactsOf,
  partsOfText,
} from './chips.js'
import { type DecisionFacts, type DecisionRow } from './decisionFacts.js'
import { type ChipClock, spacedChips, whenWordsOn } from './graphChips.js'
import { headedSection } from './graphPageParts.js'
import { loadedIssuesIn } from './listing.js'
import { type DecisionFilter, Decisions, type Model } from './model.js'
import {
  issueChipsOf,
  issueIdsInText,
  momentNodes,
  rememberedRowsOf,
} from './momentParts.js'
import { navigationToPath } from './route.js'
import { decisionChip, decisionChipOf, decisionIdChip } from './rowChips.js'

const STATUS_ORDER = ['decided', 'unconfirmed', 'superseded', 'rejected']
const CANDIDATE_WORDS = 'A candidate is not his until he confirms it.'

const countOf = (
  decisions: ReadonlyArray<DecisionRow>,
  status: string,
): number =>
  Array.filter(decisions, decision => decision.status === status).length

const statusChip = (
  status: string,
  count: number,
  isChosen: boolean,
): TextPart =>
  Reference({
    label: status,
    title: count.toString(),
    ...(isChosen ? { state: 'shown' } : {}),
    kind: 'Decision',
    href: navigationToPath(
      Decisions.make({ filter: { maybeStatus: Option.some(status) } }),
    ),
    detail: [`${count.toString()} decisions`],
  })

const decisionCountWords = (count: number): string =>
  count === 1 ? '1 decision' : `${count.toLocaleString('en-US')} decisions`

const shownWords = (
  shown: number,
  total: number,
  filter: DecisionFilter,
): string =>
  Option.isSome(filter.maybeStatus)
    ? `${shown.toLocaleString('en-US')} of ${decisionCountWords(total)}`
    : decisionCountWords(total)

const countsNodes = (
  decisions: ReadonlyArray<DecisionRow>,
  filter: DecisionFilter,
): ReadonlyArray<UiNode> => [
  RichText([
    Plain('State'),
    ...spacedChips(
      Array.flatMap(STATUS_ORDER, status => {
        const count = countOf(decisions, status)
        return count === 0
          ? []
          : [
              statusChip(
                status,
                count,
                Option.contains(filter.maybeStatus, status),
              ),
            ]
      }),
    ),
    ...(Option.isSome(filter.maybeStatus)
      ? spacedChips([
          Reference({
            label: 'All',
            title: decisions.length.toLocaleString('en-US'),
            kind: 'Decision',
            href: navigationToPath(Decisions.make({})),
            detail: ['Every decision'],
          }),
        ])
      : []),
  ]),
]

const rememberedRow = rememberedRowsOf<DecisionRow>()

const decisionRow = (
  decision: DecisionRow,
  context: ChipContext,
  clock: ChipClock,
): UiNode =>
  rememberedRow(
    decision,
    [...decision.issueIds, ...issueIdsInText(decision.text)],
    context,
    clock,
    () =>
      Column(
        { gap: 0 },
        RichText([
          decisionIdChip(decision, clock),
          Plain(`  ${whenWordsOn(decision.decidedAtMs, clock)}`),
          ...spacedChips(issueChipsOf(decision.issueIds, context)),
        ]),
        RichText(partsOfText(decision.text, context)),
      ),
  )

const loadedNodes = (
  model: Model,
  decisions: ReadonlyArray<DecisionRow>,
  filter: DecisionFilter,
): ReadonlyArray<UiNode> => {
  const context = chipContextOf(
    loadedIssuesIn(model),
    model.clock.nowMs,
    model.clock.offsetMinutes,
    chipFactsOf(model),
  )
  const shown = Option.match(filter.maybeStatus, {
    onNone: () => decisions,
    onSome: status =>
      Array.filter(decisions, decision => decision.status === status),
  })
  return [
    Text(shownWords(shown.length, decisions.length, filter), { dim: true }),
    ...countsNodes(decisions, filter),
    Text(CANDIDATE_WORDS, { dim: true }),
    ...Array.map(shown, decision =>
      decisionRow(decision, context, model.clock),
    ),
  ]
}

/**
 * What he decided, every one of them, the newest first: how many there are in
 * each state, each count a link that shows just those, then each decision with
 * its state, when, the Issues it names and its sentence.
 */
export const decisionsPageNodes = (
  model: Model,
  filter: DecisionFilter,
): ReadonlyArray<UiNode> => [
  Text('Decisions', { emphasis: 'Headline' }),
  ...M.value(model.knownDecisions).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      NotObservingDecisions: () => [Text('Observing…')],
      FailedDecisions: ({ reason }) => [
        Text(`Scribe’s rows could not be read: ${reason}`, { dim: true }),
      ],
      LoadedDecisions: ({ decisions }) => loadedNodes(model, decisions, filter),
    }),
  ),
]

const chainNodes = (
  decision: DecisionRow,
  decisions: ReadonlyArray<DecisionRow>,
  clock: ChipClock,
): ReadonlyArray<UiNode> => [
  ...Option.toArray(
    Option.map(decision.maybeSupersededById, supersededById =>
      RichText([
        Plain('Superseded by '),
        Option.match(
          Array.findFirst(
            decisions,
            candidate => candidate.decisionId === supersededById,
          ),
          {
            onNone: () => decisionChipOf(supersededById),
            onSome: found => decisionChip(found, clock),
          },
        ),
      ]),
    ),
  ),
  ...Array.flatMap(decisions, candidate =>
    Option.contains(candidate.maybeSupersededById, decision.decisionId)
      ? [RichText([Plain('It superseded '), decisionChip(candidate, clock)])]
      : [],
  ),
]

const recorderWords = (facts: DecisionFacts): string =>
  `Recorded by ${facts.recordedBy} through the ${facts.source}`

const agentAskNodes = (facts: DecisionFacts): ReadonlyArray<UiNode> =>
  pipe(
    facts.maybeAgentAsk,
    Option.map(ask => [
      Text(`What agents ask: ${ask.question}`),
      Text(`It covers: ${ask.scope}`, { dim: true }),
      ...Option.toArray(
        Option.map(ask.maybeUntil, until =>
          Text(`Until: ${until}`, { dim: true }),
        ),
      ),
    ]),
    Option.getOrElse((): ReadonlyArray<UiNode> => []),
  )

/**
 * What Scribe's rows say about one decision: the sentence, its state, when and
 * how long ago, what it superseded and what superseded it, his exact words each
 * with a link to them at that moment, and the Issues it names.
 */
export const decisionFactNodes = (
  facts: DecisionFacts,
  clock: ChipClock,
  context: ChipContext,
  decisions: ReadonlyArray<DecisionRow>,
): ReadonlyArray<UiNode> => {
  const { decision } = facts
  return [
    Text(decision.text, { emphasis: 'Headline' }),
    RichText([
      decisionIdChip(decision, clock),
      Plain(`  ${whenWordsOn(decision.decidedAtMs, clock)}`),
    ]),
    ...(decision.status === 'unconfirmed'
      ? [Text(CANDIDATE_WORDS, { dim: true })]
      : []),
    ...chainNodes(decision, decisions, clock),
    ...Option.toArray(
      Option.map(facts.maybeReplaces, replaces =>
        Column(
          { gap: 0 },
          Text('It replaced', { dim: true }),
          RichText(partsOfText(replaces, context)),
        ),
      ),
    ),
    ...headedSection(
      facts.moments.length === 1
        ? 'His words'
        : `His words: ${facts.moments.length.toString()} moments`,
      Array.map(facts.moments, moment => momentNodes(moment, context, clock)),
    ),
    ...headedSection(
      'Issues it names',
      Array.isReadonlyArrayEmpty(decision.issueIds)
        ? []
        : Array.map(issueChipsOf(decision.issueIds, context), chip =>
            RichText([chip]),
          ),
    ),
    ...agentAskNodes(facts),
    Text(recorderWords(facts), { dim: true }),
    ...Option.toArray(
      Option.map(facts.maybeNote, note =>
        RichText(partsOfText(note, context), { dim: true }),
      ),
    ),
  ]
}
