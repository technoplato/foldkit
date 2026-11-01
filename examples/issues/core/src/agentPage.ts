import { Array, Option } from 'effect'
import {
  Column,
  Plain,
  Reference,
  RichText,
  Text,
  type TextPart,
  type UiNode,
} from 'foldkit/renderers'

import { type ChipContext, issueChipOf, partsOfText } from './chips.js'
import { durationLabel } from './clock.js'
import {
  type ChipClock,
  agentChip,
  commitChipOf,
  sessionChip,
  spacedChips,
  whenWordsOn,
} from './graphChips.js'
import {
  type AgentFacts,
  type AgentRun,
  type AgentRunPage,
  type AgentSession,
  type SessionFacts,
} from './graphFacts.js'
import {
  copyableFact,
  findingNodes,
  handleChip,
  headedSection,
} from './graphPageParts.js'
import { commitsOfRun } from './pageAgents.js'

const WORD_SEPARATOR = '  ·  '
const TASK_HEADING_MARK = /^#+\s*/

const words = (parts: ReadonlyArray<string>): string =>
  Array.join(parts, WORD_SEPARATOR)

const howItRanLine = (run: AgentRun): UiNode =>
  Text(
    words([
      ...Option.toArray(run.maybeKind),
      ...Option.toArray(run.maybeAccount),
      ...Option.toArray(run.maybeModel),
      ...Option.toArray(run.maybeEffort),
      ...Option.toArray(run.maybeLane),
      ...Option.toArray(run.maybeHost),
    ]),
  )

const runHeadLine = (run: AgentRun, clock: ChipClock): UiNode =>
  RichText([
    agentChip(run, clock),
    ...Option.match(run.maybeExitCode, {
      onNone: () => [],
      onSome: exitCode => [Plain(`  exit ${exitCode.toString()}`)],
    }),
    ...Option.match(run.maybeCostUsd, {
      onNone: () => [],
      onSome: costUsd => [Plain(`  $${costUsd.toFixed(2)}`)],
    }),
  ])

const timesWords = (
  maybeStartedAtMs: Option.Option<number>,
  maybeEndedAtMs: Option.Option<number>,
  clock: ChipClock,
): ReadonlyArray<string> =>
  Option.match(maybeStartedAtMs, {
    onNone: () => [],
    onSome: startedAtMs => [
      `Started ${whenWordsOn(startedAtMs, clock)}`,
      ...Option.match(maybeEndedAtMs, {
        onNone: () =>
          clock.nowMs === 0
            ? []
            : [`running for ${durationLabel(startedAtMs, clock.nowMs)}`],
        onSome: endedAtMs => [
          `ended ${whenWordsOn(endedAtMs, clock)}`,
          `ran ${durationLabel(startedAtMs, endedAtMs)}`,
        ],
      }),
    ],
  })

const timesLine = (
  maybeStartedAtMs: Option.Option<number>,
  maybeEndedAtMs: Option.Option<number>,
  clock: ChipClock,
): ReadonlyArray<UiNode> =>
  Array.match(timesWords(maybeStartedAtMs, maybeEndedAtMs, clock), {
    onEmpty: () => [],
    onNonEmpty: parts => [Text(Array.join(parts, ', '), { dim: true })],
  })

const askedNodes = (
  run: AgentRun,
  context: ChipContext,
): ReadonlyArray<UiNode> => [
  ...Option.toArray(
    Option.map(run.maybeTask, task =>
      RichText(partsOfText(task.replace(TASK_HEADING_MARK, ''), context)),
    ),
  ),
  ...Option.toArray(
    Option.map(run.maybeAskedIn, askedIn =>
      RichText([Plain('Asked in '), ...partsOfText(askedIn, context)], {
        dim: true,
      }),
    ),
  ),
  ...Option.toArray(
    Option.map(run.maybeAskedUrl, href =>
      RichText([
        Reference({
          label: 'Where he asked',
          kind: 'Segment',
          href,
          detail: ['Opens his words at this moment'],
        }),
      ]),
    ),
  ),
]

const endedNodes = (
  run: AgentRun,
  context: ChipContext,
): ReadonlyArray<UiNode> =>
  Option.toArray(
    Option.map(run.maybeEndedReason, reason =>
      RichText(partsOfText(reason, context), { dim: true }),
    ),
  )

const filesNodes = (run: AgentRun): ReadonlyArray<UiNode> => [
  ...Option.toArray(
    Option.map(run.maybeWorktree, path => copyableFact('Worktree', path)),
  ),
  ...Option.toArray(
    Option.map(run.maybeBranch, branch => copyableFact('Branch', branch)),
  ),
  ...Option.toArray(
    Option.map(run.maybeBriefPath, path => copyableFact('Brief', path)),
  ),
  ...Option.toArray(
    Option.map(run.maybeLogPath, path => copyableFact('Log', path)),
  ),
  ...Option.toArray(
    Option.map(run.maybeTmux, tmux => copyableFact('tmux', tmux)),
  ),
]

const relationLine = (
  label: string,
  chips: ReadonlyArray<TextPart>,
): ReadonlyArray<UiNode> =>
  Array.match(chips, {
    onEmpty: () => [],
    onNonEmpty: found => [RichText([Plain(label), ...spacedChips(found)])],
  })

const relationNodes = (
  page: AgentRunPage,
  facts: AgentFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => {
  const { maybeParent, run } = page
  const sameName = Array.map(facts.runs, ({ run: other }) => other)
  return [
    ...relationLine(
      'Resumes',
      Array.flatMap(Option.toArray(run.maybeResumesRunId), runId =>
        Array.map(
          Array.filter(sameName, other => other.runId === runId),
          other => agentChip(other, clock),
        ),
      ),
    ),
    ...relationLine(
      'Resumed by',
      Array.map(
        Array.filter(sameName, other =>
          Option.contains(other.maybeResumesRunId, run.runId),
        ),
        other => agentChip(other, clock),
      ),
    ),
    ...relationLine(
      'Sub-agent of',
      Option.toArray(
        Option.map(maybeParent, parent => agentChip(parent, clock)),
      ),
    ),
    ...relationLine(
      'Started by',
      Option.isSome(maybeParent)
        ? []
        : Array.map(
            Array.filter(Option.toArray(run.maybeStartedBy), startedBy =>
              startedBy.includes('/'),
            ),
            startedBy => handleChip(startedBy, context, clock),
          ),
    ),
  ]
}

const sessionWords = (session: AgentSession): string =>
  words([
    session.harness,
    ...Option.toArray(session.maybeAccount),
    ...Option.toArray(session.maybeModel),
    ...Option.toArray(session.maybeEffort),
    ...Option.toArray(session.maybeEntrypoint),
  ])

const remoteChip = (session: AgentSession): ReadonlyArray<TextPart> =>
  Option.toArray(
    Option.map(session.maybeRemoteUrl, href =>
      Reference({
        label: 'claude.ai',
        kind: 'Session',
        href,
        detail: [
          'Opens only on the account that made it',
          ...Option.toArray(session.maybeAccount),
        ],
      }),
    ),
  )

const sessionNodes = (session: AgentSession, clock: ChipClock): UiNode =>
  Column(
    { gap: 0 },
    RichText([
      sessionChip(session),
      ...spacedChips(remoteChip(session)),
      Plain(`  ${sessionWords(session)}`),
    ]),
    ...timesLine(
      Option.some(session.startedAtMs),
      session.maybeEndedAtMs,
      clock,
    ),
    ...Option.toArray(
      Option.map(session.maybeEndedReason, reason =>
        Text(`Ended: ${reason}`, { dim: true }),
      ),
    ),
    ...Option.toArray(
      Option.map(session.maybeTranscriptPath, path =>
        copyableFact('Transcript', path),
      ),
    ),
  )

const runPageNodes = (
  page: AgentRunPage,
  facts: AgentFacts,
  clock: ChipClock,
  context: ChipContext,
): UiNode => {
  const { children, findings, run, sessions } = page
  return Column(
    { gap: 1 },
    runHeadLine(run, clock),
    howItRanLine(run),
    ...timesLine(run.maybeStartedAtMs, run.maybeEndedAtMs, clock),
    ...askedNodes(run, context),
    ...endedNodes(run, context),
    ...relationNodes(page, facts, clock, context),
    ...filesNodes(run),
    ...headedSection(
      `Sessions: ${sessions.length.toString()}`,
      Array.map(sessions, session => sessionNodes(session, clock)),
    ),
    ...headedSection(
      `Sub-agents: ${children.length.toString()}`,
      Array.map(children, child => RichText([agentChip(child, clock)])),
    ),
    ...headedSection(
      `Issues it touched: ${run.issueIds.length.toString()}`,
      Array.map(run.issueIds, issueId =>
        RichText([issueChipOf(issueId, context)]),
      ),
    ),
    ...commitNodes(page, context),
    ...headedSection(
      `Findings it reported: ${findings.length.toString()}`,
      Array.map(findings, finding =>
        Column({ gap: 0 }, ...findingNodes(finding, context, clock)),
      ),
    ),
  )
}

const commitNodes = (
  page: AgentRunPage,
  context: ChipContext,
): ReadonlyArray<UiNode> => {
  const shas = commitsOfRun(page, context.issuesById)
  return headedSection(
    `Commits it logged: ${shas.length.toString()}`,
    Array.map(shas, sha => RichText([commitChipOf(sha, Option.none())])),
  )
}

const runCountWords = (count: number): string =>
  count === 1 ? '1 run' : `${count.toString()} runs`

/**
 * What Scribe's rows say about an agent: every run its handle names, the
 * newest first, each with how it ran, when and for how long, what it was asked,
 * how it ended, what it resumes, its worktree, branch, brief and log to copy,
 * its sessions, sub-agents, Issues, commits and findings.
 */
export const agentFactNodes = (
  facts: AgentFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => [
  Text(runCountWords(facts.runs.length), { dim: true }),
  ...Array.map(facts.runs, page => runPageNodes(page, facts, clock, context)),
]

/**
 * What Scribe's rows say about a session: its id whole, how it ran, when, how
 * to reach it, and its run.
 */
export const sessionFactNodes = (
  { maybeRun, session }: SessionFacts,
  clock: ChipClock,
  context: ChipContext,
): ReadonlyArray<UiNode> => [
  Text(session.hostSessionId, { mono: true, copyable: true }),
  ...Option.toArray(
    Option.map(session.maybeTitle, title =>
      RichText(partsOfText(title, context)),
    ),
  ),
  sessionNodes(session, clock),
  ...Option.toArray(
    Option.map(session.maybeCwd, cwd => copyableFact('Folder', cwd)),
  ),
  ...Option.toArray(
    Option.map(session.maybeBranch, branch => copyableFact('Branch', branch)),
  ),
  ...Option.toArray(
    Option.map(session.maybeConfigDir, dir =>
      copyableFact('Login folder', dir),
    ),
  ),
  ...relationLine(
    'Run',
    Option.toArray(Option.map(maybeRun, run => agentChip(run, clock))),
  ),
  ...headedSection(
    `Issues it named: ${session.issueIds.length.toString()}`,
    Array.map(session.issueIds, issueId =>
      RichText([issueChipOf(issueId, context)]),
    ),
  ),
]
