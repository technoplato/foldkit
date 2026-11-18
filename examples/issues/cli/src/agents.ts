import {
  Array,
  Duration,
  Effect,
  Match as M,
  Option,
  Result,
  Schema as S,
} from 'effect'
import {
  type IssueAgent,
  type IssueAgentSession,
  IssueAgents,
  type IssueSubagent,
  type RecordingIssue,
  RecordingIssues,
  issueAgentsOf,
  issueAgentsQuery,
  recordingAgentsOf,
  recordingIssuesOf,
  recordingIssuesQuery,
} from 'issues-core-example'

import { describeIssueTrackerCause } from '@foldkit/instant-tools/issues'

import {
  type ScribeQuery,
  buildJobsTimeout,
  durationText,
  localClockText,
  oneLine,
} from './builds.js'

// The agents started for an Issue, and a recording's, as `issues show` and
// `issues recording` print them (Scribe #2303): read from Scribe's rows by the
// one query core's issueAgentsQuery names, so the commands and the Issue page
// ask the schema the same question.

/** Scribe answered: the agents started for each Issue asked for. */
export const FoundIssueAgents = S.TaggedStruct('FoundIssueAgents', {
  issues: S.Array(IssueAgents),
})

/**
 * The agents could not be read, and why, such as
 * `Scribe's Instant app did not answer within 5 seconds.`
 */
export const UnavailableIssueAgents = S.TaggedStruct('UnavailableIssueAgents', {
  reason: S.String,
})

/** What a command learned of the agents started for Issues. */
export const IssueAgentsRead = S.Union([
  FoundIssueAgents,
  UnavailableIssueAgents,
])
/** What a command learned of the agents started for Issues. */
export type IssueAgentsRead = typeof IssueAgentsRead.Type

/**
 * Reads the agents started for Issues by their numbers, such as [2303]. It
 * never fails: agents that cannot be read are `UnavailableIssueAgents` with
 * the reason.
 */
export type IssueAgentsReader = (
  issueNumbers: ReadonlyArray<number>,
) => Effect.Effect<IssueAgentsRead>

/** Scribe answered: the Issues a recording's lines mention. */
export const FoundRecordingIssues = S.TaggedStruct('FoundRecordingIssues', {
  recording: RecordingIssues,
})

/** A recording's Issues could not be read, and why. */
export const UnavailableRecordingIssues = S.TaggedStruct(
  'UnavailableRecordingIssues',
  { reason: S.String },
)

/** What a command learned of the Issues a recording's lines mention. */
export const RecordingIssuesRead = S.Union([
  FoundRecordingIssues,
  UnavailableRecordingIssues,
])
/** What a command learned of the Issues a recording's lines mention. */
export type RecordingIssuesRead = typeof RecordingIssuesRead.Type

/**
 * Reads the Issues a recording's lines mention by the recording's id. It never
 * fails: Issues that cannot be read are `UnavailableRecordingIssues` with the
 * reason.
 */
export type RecordingIssuesReader = (
  recordingId: string,
) => Effect.Effect<RecordingIssuesRead>

const unansweredWithin = (timeout: Duration.Duration): string =>
  `Scribe's Instant app did not answer within ${Duration.toSeconds(timeout).toString()} seconds.`

const UNREADABLE_ROWS =
  "Scribe's Instant app answered with rows this command cannot read."

/**
 * Reads the agents started for Issues from Scribe's Instant app with `send`,
 * waiting at most `timeout` (5 seconds, the bound on every wait), then
 * abandoning the request. It never fails, and asks nothing for no Issue.
 */
export const readIssueAgents = (
  send: ScribeQuery,
  issueNumbers: ReadonlyArray<number>,
  timeout: Duration.Duration = buildJobsTimeout,
): Effect.Effect<IssueAgentsRead> =>
  Array.isReadonlyArrayEmpty(issueNumbers)
    ? Effect.succeed(FoundIssueAgents.make({ issues: [] }))
    : Effect.tryPromise({
        try: signal => send(issueAgentsQuery(issueNumbers), signal),
        catch: describeIssueTrackerCause,
      }).pipe(
        Effect.timeoutOption(timeout),
        Effect.map(maybeAnswer =>
          Option.match(maybeAnswer, {
            onNone: () =>
              UnavailableIssueAgents.make({
                reason: unansweredWithin(timeout),
              }),
            onSome: answer =>
              Result.match(
                Result.try(() => issueAgentsOf(issueNumbers, answer)),
                {
                  onFailure: () =>
                    UnavailableIssueAgents.make({ reason: UNREADABLE_ROWS }),
                  onSuccess: issues => FoundIssueAgents.make({ issues }),
                },
              ),
          }),
        ),
        Effect.catch(cause =>
          Effect.succeed(
            UnavailableIssueAgents.make({
              reason: `the agents query to Scribe's Instant app failed: ${oneLine(cause)}`,
            }),
          ),
        ),
      )

/**
 * Reads the Issues a recording's lines mention from Scribe's Instant app with
 * `send`, by the recording's id as the rows hold it (lowercase), waiting at
 * most `timeout`. It never fails.
 */
export const readRecordingIssues = (
  send: ScribeQuery,
  recordingId: string,
  timeout: Duration.Duration = buildJobsTimeout,
): Effect.Effect<RecordingIssuesRead> =>
  Effect.tryPromise({
    try: signal => send(recordingIssuesQuery(recordingId), signal),
    catch: describeIssueTrackerCause,
  }).pipe(
    Effect.timeoutOption(timeout),
    Effect.map(maybeAnswer =>
      Option.match(maybeAnswer, {
        onNone: () =>
          UnavailableRecordingIssues.make({
            reason: unansweredWithin(timeout),
          }),
        onSome: answer =>
          Result.match(
            Result.try(() =>
              recordingIssuesOf(recordingId.toLowerCase(), answer),
            ),
            {
              onFailure: () =>
                UnavailableRecordingIssues.make({ reason: UNREADABLE_ROWS }),
              onSuccess: recording => FoundRecordingIssues.make({ recording }),
            },
          ),
      }),
    ),
    Effect.catch(cause =>
      Effect.succeed(
        UnavailableRecordingIssues.make({
          reason: `the recording's Issues query to Scribe's Instant app failed: ${oneLine(cause)}`,
        }),
      ),
    ),
  )

// TEXT

const SEPARATOR = '  ·  '

const counted = (count: number, word: string): string =>
  `${count.toString()} ${word}${count === 1 ? '' : 's'}`

const stateText = (
  state: string,
  maybeStartedAtMs: Option.Option<number>,
  maybeEndedAtMs: Option.Option<number>,
  timeZone: string,
): string =>
  Option.match(maybeStartedAtMs, {
    onNone: () => state,
    onSome: startedAtMs =>
      Option.match(maybeEndedAtMs, {
        onNone: () =>
          `${state}, started ${localClockText(startedAtMs, timeZone)}`,
        onSome: endedAtMs =>
          `${state}, ${localClockText(startedAtMs, timeZone)} to ${localClockText(endedAtMs, timeZone)} (${durationText(endedAtMs - startedAtMs)})`,
      }),
  })

const timesText = (
  maybeStartedAtMs: Option.Option<number>,
  maybeEndedAtMs: Option.Option<number>,
  timeZone: string,
): ReadonlyArray<string> =>
  Option.match(maybeStartedAtMs, {
    onNone: () => [],
    onSome: startedAtMs => [
      Option.match(maybeEndedAtMs, {
        onNone: () => `started ${localClockText(startedAtMs, timeZone)}`,
        onSome: endedAtMs =>
          `${localClockText(startedAtMs, timeZone)} to ${localClockText(endedAtMs, timeZone)}`,
      }),
    ],
  })

const linkLine = (link: IssueAgent['link']): string =>
  M.value(link).pipe(
    M.tagsExhaustive({
      ClaudeLink: ({ url }) => `Claude: ${url}`,
      NoClaudeLink: ({ why }) => `No Claude link: ${why}`,
    }),
  )

const sessionLine = (session: IssueAgentSession, timeZone: string): string =>
  Array.join(
    [
      session.id,
      ...Option.toArray(
        Option.map(session.maybeAccount, account => `account ${account}`),
      ),
      ...timesText(session.maybeStartedAtMs, session.maybeEndedAtMs, timeZone),
      ...Option.toArray(
        Option.map(session.maybeClaudeUrl, url => `Claude: ${url}`),
      ),
    ],
    SEPARATOR,
  )

const subagentLine = (subagent: IssueSubagent, timeZone: string): string =>
  Array.join(
    [
      subagent.name,
      stateText(
        subagent.state,
        subagent.maybeStartedAtMs,
        subagent.maybeEndedAtMs,
        timeZone,
      ),
      ...Option.toArray(subagent.maybeTask),
    ],
    SEPARATOR,
  )

/**
 * One agent's lines: its name, state and times, harness and account; its
 * handle; the run it works in when it is a subagent; its claude.ai link or why
 * it has none; its chat; every session when it has more than one; its
 * subagents.
 */
const agentLines = (
  agent: IssueAgent,
  timeZone: string,
): ReadonlyArray<string> => [
  `  ${Array.join(
    [
      agent.name,
      stateText(
        agent.state,
        agent.maybeStartedAtMs,
        agent.maybeEndedAtMs,
        timeZone,
      ),
      agent.harness,
      ...Option.toArray(
        Option.map(agent.maybeAccount, account => `account ${account}`),
      ),
    ],
    SEPARATOR,
  )}`,
  `    ${agent.handle}`,
  ...Option.toArray(
    Option.map(
      agent.maybeParentName,
      parent => `    A subagent of ${parent}, started for this Issue`,
    ),
  ),
  `    ${linkLine(agent.link)}`,
  ...Option.toArray(
    Option.map(agent.maybeChatLink, chatLink => `    Chat: ${chatLink}`),
  ),
  ...(agent.sessions.length > 1
    ? [
        `    Sessions (${agent.sessions.length.toString()}, newest first):`,
        ...Array.map(
          agent.sessions,
          session => `      ${sessionLine(session, timeZone)}`,
        ),
      ]
    : []),
  ...Array.match(agent.subagents, {
    onEmpty: () => [],
    onNonEmpty: subagents => [
      `    Subagents (${subagents.length.toString()}):`,
      ...Array.map(
        subagents,
        subagent => `      ${subagentLine(subagent, timeZone)}`,
      ),
    ],
  }),
]

const agentsOfIssue = (
  issues: ReadonlyArray<IssueAgents>,
  issueNumber: number,
): Option.Option<ReadonlyArray<IssueAgent>> =>
  Option.map(
    Array.findFirst(issues, found => found.issueNumber === issueNumber),
    found => found.agents,
  )

/**
 * The lines `issues show` prints for the agents started for an Issue: a blank
 * line, the heading with the count, then each agent newest first. One line
 * when none was started for it, or why they could not be read; nothing when
 * the reader asked nothing.
 */
export const issueAgentsSection = (
  read: IssueAgentsRead,
  issueNumber: number,
  timeZone: string,
): ReadonlyArray<string> =>
  M.value(read).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      FoundIssueAgents: ({ issues }) =>
        Option.match(agentsOfIssue(issues, issueNumber), {
          onNone: () => [],
          onSome: agents =>
            Array.match(agents, {
              onEmpty: () => [
                '',
                "Agents: none started for this Issue in Scribe's rows",
              ],
              onNonEmpty: found => [
                '',
                `Agents (${found.length.toString()} started for this Issue, newest first, from Scribe's rows)`,
                ...Array.flatMap(found, agent => agentLines(agent, timeZone)),
              ],
            }),
        }),
      UnavailableIssueAgents: ({ reason }) => [
        '',
        `Agents not shown: ${reason}`,
      ],
    }),
  )

/**
 * What `issues recording` prints: the recording, how many mentions of how
 * many Issues, then each Issue in the order he said it with its agents, or a
 * line that none was started for it.
 */
export const recordingAgentsLines = (
  recording: RecordingIssues,
  read: IssueAgentsRead,
  timeZone: string,
): ReadonlyArray<string> => {
  const heading = `${Option.getOrElse(recording.maybeTitle, () => 'Recording')}  ${recording.recordingId}`
  const mentions = `${counted(recording.mentionCount, 'mention')} of ${counted(recording.issues.length, 'Issue')} in Scribe's rows`
  return M.value(read).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      FoundIssueAgents: ({ issues }) => {
        const withAgents = recordingAgentsOf(recording, issues)
        const started = Array.filter(
          withAgents,
          ({ agents }) => agents.length > 0,
        ).length
        return [
          heading,
          `${mentions}; agents started for ${started.toString()} of them`,
          ...Array.flatMap(withAgents, ({ agents, issue }) => [
            '',
            `#${issue.number.toString()}  ${issue.title}  [${issue.status}]  ${counted(issue.mentionCount, 'mention')}`,
            ...Array.match(agents, {
              onEmpty: () => ['  No agent was started for it.'],
              onNonEmpty: found =>
                Array.flatMap(found, agent => agentLines(agent, timeZone)),
            }),
          ]),
        ]
      },
      UnavailableIssueAgents: ({ reason }) => [
        heading,
        mentions,
        `Agents not shown: ${reason}`,
        ...Array.flatMap(recording.issues, issue => [
          '',
          `#${issue.number.toString()}  ${issue.title}  [${issue.status}]  ${counted(issue.mentionCount, 'mention')}`,
        ]),
      ],
    }),
  )
}

// JSON

/** One session as the commands' --json gives it. */
export type IssueAgentSessionJson = Readonly<{
  account?: string
  claudeLink?: string
  endedAtMs?: number
  id: string
  startedAtMs?: number
}>

/** One subagent as the commands' --json gives it. */
export type IssueSubagentJson = Readonly<{
  chatLink?: string
  claudeLink?: string
  endedAtMs?: number
  handle: string
  name: string
  noClaudeLinkBecause?: string
  startedAtMs?: number
  state: string
  task?: string
}>

/** One agent as the commands' --json gives it: every fact its lines print. */
export type IssueAgentJson = Readonly<{
  account?: string
  chatLink?: string
  claudeLink?: string
  endedAtMs?: number
  handle: string
  harness: string
  kind?: string
  name: string
  noClaudeLinkBecause?: string
  parent?: string
  sessions: ReadonlyArray<IssueAgentSessionJson>
  startedAtMs?: number
  state: string
  subagents: ReadonlyArray<IssueSubagentJson>
}>

const optional = <A, B extends object>(
  maybeValue: Option.Option<A>,
  field: (value: A) => B,
): B | Record<never, never> =>
  Option.match(maybeValue, { onNone: () => ({}), onSome: field })

const linkJson = (
  link: IssueAgent['link'],
): Readonly<{ claudeLink?: string; noClaudeLinkBecause?: string }> =>
  M.value(link).pipe(
    M.withReturnType<
      Readonly<{ claudeLink?: string; noClaudeLinkBecause?: string }>
    >(),
    M.tagsExhaustive({
      ClaudeLink: ({ url }) => ({ claudeLink: url }),
      NoClaudeLink: ({ why }) => ({ noClaudeLinkBecause: why }),
    }),
  )

const agentJson = (agent: IssueAgent): IssueAgentJson => ({
  name: agent.name,
  handle: agent.handle,
  harness: agent.harness,
  ...optional(agent.maybeKind, kind => ({ kind })),
  state: agent.state,
  ...optional(agent.maybeAccount, account => ({ account })),
  ...optional(agent.maybeStartedAtMs, startedAtMs => ({ startedAtMs })),
  ...optional(agent.maybeEndedAtMs, endedAtMs => ({ endedAtMs })),
  ...linkJson(agent.link),
  ...optional(agent.maybeChatLink, chatLink => ({ chatLink })),
  ...optional(agent.maybeParentName, parent => ({ parent })),
  sessions: Array.map(agent.sessions, session => ({
    id: session.id,
    ...optional(session.maybeAccount, account => ({ account })),
    ...optional(session.maybeStartedAtMs, startedAtMs => ({ startedAtMs })),
    ...optional(session.maybeEndedAtMs, endedAtMs => ({ endedAtMs })),
    ...optional(session.maybeClaudeUrl, claudeLink => ({ claudeLink })),
  })),
  subagents: Array.map(agent.subagents, subagent => ({
    name: subagent.name,
    handle: subagent.handle,
    state: subagent.state,
    ...optional(subagent.maybeTask, task => ({ task })),
    ...optional(subagent.maybeStartedAtMs, startedAtMs => ({ startedAtMs })),
    ...optional(subagent.maybeEndedAtMs, endedAtMs => ({ endedAtMs })),
    ...linkJson(subagent.link),
    ...optional(subagent.maybeChatLink, chatLink => ({ chatLink })),
  })),
})

/**
 * The keys `issues show --json` adds to the Issue: `agents`, each with every
 * fact its lines print, or `agentsNotShown`, why they could not be read.
 */
export const issueAgentsJson = (
  read: IssueAgentsRead,
  issueNumber: number,
): Readonly<{
  agents?: ReadonlyArray<IssueAgentJson>
  agentsNotShown?: string
}> =>
  M.value(read).pipe(
    M.withReturnType<
      Readonly<{
        agents?: ReadonlyArray<IssueAgentJson>
        agentsNotShown?: string
      }>
    >(),
    M.tagsExhaustive({
      FoundIssueAgents: ({ issues }) =>
        Option.match(agentsOfIssue(issues, issueNumber), {
          onNone: () => ({}),
          onSome: agents => ({ agents: Array.map(agents, agentJson) }),
        }),
      UnavailableIssueAgents: ({ reason }) => ({ agentsNotShown: reason }),
    }),
  )

/** One Issue of a recording as `issues recording --json` gives it. */
export type RecordingIssueJson = Readonly<{
  agents?: ReadonlyArray<IssueAgentJson>
  mentionCount: number
  number: number
  status: string
  title: string
}>

/** What `issues recording --json` prints. */
export type RecordingAgentsJson = Readonly<{
  agentsNotShown?: string
  issues: ReadonlyArray<RecordingIssueJson>
  mentionCount: number
  recording: Readonly<{ id: string; title?: string }>
}>

/**
 * What `issues recording --json` prints: the recording, its mention count, and
 * each Issue with its count and agents, or `agentsNotShown` when they could
 * not be read.
 */
export const recordingAgentsJson = (
  recording: RecordingIssues,
  read: IssueAgentsRead,
): RecordingAgentsJson => {
  const base = {
    recording: {
      id: recording.recordingId,
      ...optional(recording.maybeTitle, title => ({ title })),
    },
    mentionCount: recording.mentionCount,
  }
  const issueJson = (issue: RecordingIssue): RecordingIssueJson => ({
    number: issue.number,
    title: issue.title,
    status: issue.status,
    mentionCount: issue.mentionCount,
  })
  return M.value(read).pipe(
    M.withReturnType<RecordingAgentsJson>(),
    M.tagsExhaustive({
      FoundIssueAgents: ({ issues }) => ({
        ...base,
        issues: Array.map(recordingAgentsOf(recording, issues), withAgents => ({
          ...issueJson(withAgents.issue),
          agents: Array.map(withAgents.agents, agentJson),
        })),
      }),
      UnavailableIssueAgents: ({ reason }) => ({
        ...base,
        issues: Array.map(recording.issues, issueJson),
        agentsNotShown: reason,
      }),
    }),
  )
}

/** A reader for hosts with no Scribe app: it asks nothing and says nothing. */
export const noIssueAgentsReader: IssueAgentsReader = () =>
  Effect.succeed(FoundIssueAgents.make({ issues: [] }))

/** A reader for hosts with no Scribe app: it says so. */
export const noRecordingIssuesReader: RecordingIssuesReader = () =>
  Effect.succeed(
    UnavailableRecordingIssues.make({
      reason: 'this host reads no Scribe rows.',
    }),
  )
