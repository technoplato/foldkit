import { Array, Option } from 'effect'
import {
  Button,
  Column,
  Plain,
  Reference,
  RichText,
  Row,
  Text,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import { type ChipContext, issueChipOf, partsOfText } from './chips.js'
import {
  type ChipClock,
  agentChipOfHandle,
  commitChipOf,
  sessionChipOf,
  spacedChips,
  whenWordsOn,
} from './graphChips.js'
import { type AgentFinding } from './graphFacts.js'
import { agentNameOfHandle } from './graphFacts.js'

/** A headline over its nodes, or nothing when it has none. */
export const headedSection = (
  heading: string,
  children: ReadonlyArray<UiNode>,
): ReadonlyArray<UiNode> =>
  Array.match(children, {
    onEmpty: () => [],
    onNonEmpty: nodes => [
      Column({ gap: 1 }, Text(heading, { emphasis: 'Headline' }), ...nodes),
    ],
  })

/** A label and a whole path or name, the second to copy: a brief, a worktree. */
export const copyableFact = (label: string, value: string): UiNode =>
  Column(
    { gap: 0 },
    Text(label, { dim: true }),
    Text(value, { mono: true, copyable: true }),
  )

/** A handle's chip, with what the page has read about its run. */
export const handleChip = (
  agentId: string,
  context: ChipContext,
  clock: ChipClock,
): TextPart =>
  agentChipOfHandle(
    agentId,
    Option.fromUndefinedOr(
      context.agentsByHandle.get(agentId) ??
        context.agentsByHandle.get(agentNameOfHandle(agentId)),
    ),
    clock,
  )

const findingWhoParts = (
  finding: AgentFinding,
  context: ChipContext,
  clock: ChipClock,
): ReadonlyArray<TextPart> => [
  ...Option.toArray(
    Option.map(finding.maybeAgentId, agentId =>
      handleChip(agentId, context, clock),
    ),
  ),
  ...Option.toArray(Option.map(finding.maybeSessionId, sessionChipOf)),
  ...Option.toArray(
    Option.map(finding.maybeIssueId, issueId => issueChipOf(issueId, context)),
  ),
]

const SOURCE_NAMES: Readonly<Record<string, string>> = {
  agentRunStop: 'Run stopped',
  registryAttempt: 'Attempt stopped',
  registryStop: 'Session died',
  stuck: 'Stuck',
  workLogFinding: 'Stated in a work log',
  workLogFoundWhile: 'Found on the way',
  workLogMistake: 'Own mistake',
}

/** Where a finding was written, in words: `agentRunStop` is `Run stopped`. */
export const findingSourceName = (source: string): string =>
  SOURCE_NAMES[source] ?? source

/** The token that turns one finding into an Issue. */
export const PROMOTE_FINDING_TOKEN_PREFIX = 'promote-finding:'

const promotionNodes = (
  finding: AgentFinding,
  context: ChipContext,
): ReadonlyArray<UiNode> =>
  Option.match(finding.maybePromotedIssueId, {
    onNone: () =>
      finding.status === 'open'
        ? [
            Row(
              { gap: 1 },
              Button({
                label: 'Turn into an Issue',
                token: `${PROMOTE_FINDING_TOKEN_PREFIX}${finding.findingId}`,
                variant: 'Ghost',
              }),
            ),
          ]
        : [],
    onSome: issueId => [
      RichText([Plain('Promoted to '), issueChipOf(issueId, context)]),
    ],
  })

/** One finding: its kind and state, when, who and where, its words and fix. */
export const findingNodes = (
  finding: AgentFinding,
  context: ChipContext,
  clock: ChipClock,
): ReadonlyArray<UiNode> => [
  RichText([
    Reference({
      label: finding.kind,
      state: finding.status,
      kind: 'Finding',
      href: `/findings/${finding.findingId}`,
      detail: [findingSourceName(finding.source)],
    }),
    Plain(`  ${whenWordsOn(finding.occurredAtMs, clock)}`),
    ...spacedChips(findingWhoParts(finding, context, clock)),
  ]),
  RichText(partsOfText(finding.quote, context)),
  ...Option.toArray(
    Option.map(finding.maybeFix, fix =>
      RichText([Plain('Fix: '), ...partsOfText(fix, context)], { dim: true }),
    ),
  ),
  ...Option.toArray(
    Option.map(finding.maybeFixCommitSha, sha =>
      RichText([Plain('Fixed by '), commitChipOf(sha, Option.none())], {
        dim: true,
      }),
    ),
  ),
  ...promotionNodes(finding, context),
]
