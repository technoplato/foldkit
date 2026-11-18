import { Array, Option, Order, Schema as S, pipe } from 'effect'

import { OptionalNumber, OptionalText, listOf, manyOf } from './storedRows.js'

// An Issue's agents, and a recording's (Scribe #2303). Every agent run started
// for an Issue names it (`agentRuns.issueNumber`, from tools/agent-run's
// --issue); its sessions and its subagents are rows linked to it. One query
// reads them for any Issues, and a recording reaches them through the Issues
// its lines mention (`issueMentions.recordingID`, Scribe #2248). Nothing is
// kept beside the rows: a subagent's Issue is its run's, and why a run has no
// claude.ai link is read from its own row.

// MODEL

/** A run's claude.ai link: it opens the run in the Claude app, signed in to the account that made it. */
export const ClaudeLink = S.TaggedStruct('ClaudeLink', { url: S.String })
/** Why a run has no claude.ai link, such as `this session has no Remote Control`. */
export const NoClaudeLink = S.TaggedStruct('NoClaudeLink', { why: S.String })
/** A run's claude.ai link, or why it has none. */
export const AgentClaudeLink = S.Union([ClaudeLink, NoClaudeLink])
/** A run's claude.ai link, or why it has none. */
export type AgentClaudeLink = typeof AgentClaudeLink.Type

/** One session of a run, such as one account's part of a run on a chain of accounts. */
export const IssueAgentSession = S.Struct({
  id: S.String,
  maybeAccount: S.Option(S.String),
  maybeClaudeUrl: S.Option(S.String),
  maybeEndedAtMs: S.Option(S.Number),
  maybeStartedAtMs: S.Option(S.Number),
})
/** One session of a run. */
export type IssueAgentSession = typeof IssueAgentSession.Type

/**
 * A subagent a run started with Claude Code's Agent tool, such as
 * `issue-agents-2303:ab73110a`: it works inside its run's session, so its
 * chat is its run's.
 */
export const IssueSubagent = S.Struct({
  handle: S.String,
  id: S.String,
  link: AgentClaudeLink,
  maybeChatLink: S.Option(S.String),
  maybeEndedAtMs: S.Option(S.Number),
  maybeStartedAtMs: S.Option(S.Number),
  maybeTask: S.Option(S.String),
  name: S.String,
  state: S.String,
})
/** A subagent a run started. */
export type IssueSubagent = typeof IssueSubagent.Type

/**
 * One agent run started for an Issue: its name and handle, how and where it
 * ran, its state and times, its claude.ai link or why it has none, the app
 * link that opens its chat, its sessions and its subagents. A subagent started
 * for an Issue of its own names the run it works in.
 */
export const IssueAgent = S.Struct({
  handle: S.String,
  harness: S.String,
  id: S.String,
  link: AgentClaudeLink,
  maybeAccount: S.Option(S.String),
  maybeChatLink: S.Option(S.String),
  maybeEndedAtMs: S.Option(S.Number),
  maybeKind: S.Option(S.String),
  maybeParentName: S.Option(S.String),
  maybeStartedAtMs: S.Option(S.Number),
  name: S.String,
  sessions: S.Array(IssueAgentSession),
  state: S.String,
  subagents: S.Array(IssueSubagent),
})
/** One agent run started for an Issue. */
export type IssueAgent = typeof IssueAgent.Type

/** The agents started for one Issue, newest first. */
export const IssueAgents = S.Struct({
  agents: S.Array(IssueAgent),
  issueNumber: S.Number,
})
/** The agents started for one Issue. */
export type IssueAgents = typeof IssueAgents.Type

/** An Issue his lines in a recording mention, with how many times. */
export const RecordingIssue = S.Struct({
  mentionCount: S.Number,
  number: S.Number,
  status: S.String,
  title: S.String,
})
/** An Issue a recording's lines mention. */
export type RecordingIssue = typeof RecordingIssue.Type

/**
 * The Issues his lines in one recording mention, in the order he first said
 * them, and how many mentions they come from together.
 */
export const RecordingIssues = S.Struct({
  issues: S.Array(RecordingIssue),
  maybeTitle: S.Option(S.String),
  mentionCount: S.Number,
  recordingId: S.String,
})
/** The Issues a recording's lines mention. */
export type RecordingIssues = typeof RecordingIssues.Type

/** An Issue a recording's lines mention, with the agents started for it. */
export type RecordingIssueAgents = Readonly<{
  agents: ReadonlyArray<IssueAgent>
  issue: RecordingIssue
}>

/**
 * When tools/agent-run began asking Claude Code for each Claude run's
 * claude.ai link: 2026-11-12 07:39:50 EST, its install (Scribe #2137). A run
 * started before then never had one.
 */
export const agentRunAskedForLinksFromMs = Date.UTC(2026, 10, 12, 12, 39, 50)

const CHAT_LINK_PREFIX = 'scribe-shared://agent/'
const AGENT_RUN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const CLAUDE_CODE = 'claude-code'

/**
 * The app link that opens a run's chat in Scribe, such as
 * `scribe-shared://agent/issue-agents-2303`, for a name the app's link
 * accepts: a letter or digit, then letters, digits, dots, underscores and
 * dashes, at most 128.
 */
export const agentChatLink = (name: string): Option.Option<string> =>
  AGENT_RUN_NAME.test(name)
    ? Option.some(`${CHAT_LINK_PREFIX}${name}`)
    : Option.none()

// QUERY

const AGENT_RUN_FIELDS = [
  'name',
  'agentID',
  'harness',
  'account',
  'kind',
  'status',
  'startedAtMs',
  'endedAtMs',
  'remoteURL',
  'issueNumber',
]

const AGENT_SESSION_FIELDS = [
  'hostSessionID',
  'account',
  'remoteURL',
  'startedAtMs',
  'endedAtMs',
]

const SUBAGENT_FIELDS = [
  'name',
  'agentID',
  'account',
  'status',
  'startedAtMs',
  'endedAtMs',
  'task',
]

/**
 * What to ask Scribe's app for the agents started for Issues, by their
 * numbers: every run whose `issueNumber` is one of them, newest first, with
 * its sessions, its subagents that name no Issue of their own, and the run it
 * works in when it is a subagent itself. #2303 asks `agentRuns` where
 * `issueNumber` is in [2303].
 */
export const issueAgentsQuery = (issueNumbers: ReadonlyArray<number>) => ({
  agentRuns: {
    $: {
      where: { issueNumber: { $in: [...issueNumbers] } },
      order: { startedAtMs: 'desc' as const },
      fields: AGENT_RUN_FIELDS,
    },
    sessions: {
      $: {
        order: { startedAtMs: 'desc' as const },
        fields: AGENT_SESSION_FIELDS,
      },
    },
    children: {
      $: {
        where: { kind: 'subagent', issueNumber: { $isNull: true } },
        order: { startedAtMs: 'desc' as const },
        fields: SUBAGENT_FIELDS,
      },
    },
    parent: { $: { fields: ['name'] } },
  },
})

/**
 * What to ask Scribe's app for the Issues a recording's lines mention: each
 * of its mentions, by the recording's id as the rows hold it (lowercase), with
 * the Issue it names and its recording.
 */
export const recordingIssuesQuery = (recordingId: string) => ({
  issueMentions: {
    $: {
      where: { recordingID: recordingId.toLowerCase() },
      fields: ['id', 'capturedAtMs'],
    },
    issue: { $: { fields: ['number', 'title', 'status'] } },
    recording: { $: { fields: ['id', 'title', 'startedAtMs'] } },
  },
})

// STORED

const StoredSession = S.Struct({
  account: OptionalText,
  endedAtMs: OptionalNumber,
  hostSessionID: S.String,
  remoteURL: OptionalText,
  startedAtMs: OptionalNumber,
})

const StoredSubagent = S.Struct({
  account: OptionalText,
  agentID: S.String,
  endedAtMs: OptionalNumber,
  id: S.String,
  name: S.String,
  startedAtMs: OptionalNumber,
  status: S.String,
  task: OptionalText,
})

const StoredParent = S.Struct({ id: S.optionalKey(S.String), name: S.String })

const StoredRun = S.Struct({
  account: OptionalText,
  agentID: S.String,
  children: S.optionalKey(S.NullOr(S.Array(StoredSubagent))),
  endedAtMs: OptionalNumber,
  harness: S.String,
  id: S.String,
  issueNumber: OptionalNumber,
  kind: OptionalText,
  name: S.String,
  parent: manyOf(StoredParent),
  remoteURL: OptionalText,
  sessions: S.optionalKey(S.NullOr(S.Array(StoredSession))),
  startedAtMs: OptionalNumber,
  status: S.String,
})

const StoredRuns = S.Struct({ agentRuns: S.Array(StoredRun) })

const StoredIssue = S.Struct({
  number: S.Number,
  status: S.String,
  title: S.String,
})

const StoredRecording = S.Struct({
  id: S.String,
  startedAtMs: OptionalNumber,
  title: S.String,
})

const StoredMention = S.Struct({
  capturedAtMs: OptionalNumber,
  id: S.String,
  issue: manyOf(StoredIssue),
  recording: manyOf(StoredRecording),
})

const StoredMentions = S.Struct({ issueMentions: S.Array(StoredMention) })

type SaidIssue = Readonly<{ atMs: number; issue: typeof StoredIssue.Type }>

type StoredRun = typeof StoredRun.Type
type StoredSession = typeof StoredSession.Type

const firstOf = <A>(
  value: A | ReadonlyArray<A> | null | undefined,
): Option.Option<A> => Array.head(listOf(value))

const nonEmpty = (value: string | null | undefined): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(value), text => text.trim() !== '')

// DERIVED

const CLAIMANT = 'claimant'
const SUBAGENT = 'subagent'
const INTERACTIVE = 'interactive'

const insideSessionOf = (runName: string): NoClaudeLink =>
  NoClaudeLink.make({ why: `it runs inside ${runName}’s session` })

type NoClaudeLink = typeof NoClaudeLink.Type

/** The newest session link a run's sessions hold: an interactive session records its own. */
const sessionUrlOf = (
  sessions: ReadonlyArray<IssueAgentSession>,
): Option.Option<string> =>
  Array.findFirst(sessions, session => session.maybeClaudeUrl)

const linkOf = (
  stored: StoredRun,
  sessions: ReadonlyArray<IssueAgentSession>,
  maybeParentName: Option.Option<string>,
): AgentClaudeLink =>
  Option.match(
    Option.orElse(nonEmpty(stored.remoteURL), () => sessionUrlOf(sessions)),
    {
      onSome: url => ClaudeLink.make({ url }),
      onNone: () => whyNoLinkOf(stored, maybeParentName),
    },
  )

const whyNoLinkOf = (
  stored: StoredRun,
  maybeParentName: Option.Option<string>,
): AgentClaudeLink => {
  if (stored.kind === SUBAGENT) {
    return insideSessionOf(
      Option.getOrElse(maybeParentName, () => 'its parent run'),
    )
  } else if (stored.harness !== CLAUDE_CODE) {
    return NoClaudeLink.make({
      why: `a ${stored.harness} run has no claude.ai link`,
    })
  } else if (stored.kind === INTERACTIVE) {
    return NoClaudeLink.make({ why: 'this session has no Remote Control' })
  } else if ((stored.startedAtMs ?? 0) < agentRunAskedForLinksFromMs) {
    return NoClaudeLink.make({
      why: 'it started before agent-run asked Claude Code for its link',
    })
  } else {
    return NoClaudeLink.make({ why: 'no claude.ai link was recorded for it' })
  }
}

const newestStartFirst = <
  A extends Readonly<{ maybeStartedAtMs: Option.Option<number> }>,
>(): Order.Order<A> =>
  Order.flip(
    Order.mapInput(Order.Number, (item: A) =>
      Option.getOrElse(item.maybeStartedAtMs, () => 0),
    ),
  )

const sessionOf = (stored: StoredSession): IssueAgentSession =>
  IssueAgentSession.make({
    id: stored.hostSessionID,
    maybeAccount: nonEmpty(stored.account),
    maybeClaudeUrl: nonEmpty(stored.remoteURL),
    maybeEndedAtMs: Option.fromNullishOr(stored.endedAtMs),
    maybeStartedAtMs: Option.fromNullishOr(stored.startedAtMs),
  })

const agentOf = (stored: StoredRun): IssueAgent => {
  const maybeParentName = Option.map(
    firstOf(stored.parent),
    parent => parent.name,
  )
  const sessions = Array.sort(
    Array.map(stored.sessions ?? [], sessionOf),
    newestStartFirst<IssueAgentSession>(),
  )
  const maybeChatLink = agentChatLink(
    stored.kind === SUBAGENT
      ? Option.getOrElse(maybeParentName, () => stored.name)
      : stored.name,
  )
  return IssueAgent.make({
    handle: stored.agentID,
    harness: stored.harness,
    id: stored.id,
    link: linkOf(stored, sessions, maybeParentName),
    maybeAccount: nonEmpty(stored.account),
    maybeChatLink,
    maybeEndedAtMs: Option.fromNullishOr(stored.endedAtMs),
    maybeKind: nonEmpty(stored.kind),
    maybeParentName: stored.kind === SUBAGENT ? maybeParentName : Option.none(),
    maybeStartedAtMs: Option.fromNullishOr(stored.startedAtMs),
    name: stored.name,
    sessions,
    state: stored.status,
    subagents: Array.sort(
      Array.map(stored.children ?? [], child =>
        IssueSubagent.make({
          handle: child.agentID,
          id: child.id,
          link: insideSessionOf(stored.name),
          maybeChatLink,
          maybeEndedAtMs: Option.fromNullishOr(child.endedAtMs),
          maybeStartedAtMs: Option.fromNullishOr(child.startedAtMs),
          maybeTask: nonEmpty(child.task),
          name: child.name,
          state: child.status,
        }),
      ),
      newestStartFirst<IssueSubagent>(),
    ),
  })
}

/**
 * The agents started for each Issue asked for, in the order asked, from the
 * rows Instant answers `issueAgentsQuery` with: each Issue's runs newest
 * first, an Issue with none included. A tracker name with no run behind it (a
 * claimant) is left out.
 */
export const issueAgentsOf = (
  issueNumbers: ReadonlyArray<number>,
  data: unknown,
): ReadonlyArray<IssueAgents> => {
  const runs = pipe(
    S.decodeUnknownSync(StoredRuns)(data).agentRuns,
    Array.filter(run => run.kind !== CLAIMANT),
  )
  return Array.map(issueNumbers, issueNumber =>
    IssueAgents.make({
      agents: pipe(
        runs,
        Array.filter(run => run.issueNumber === issueNumber),
        Array.map(agentOf),
        Array.sort(newestStartFirst<IssueAgent>()),
      ),
      issueNumber,
    }),
  )
}

/**
 * The Issues his lines in a recording mention, from the rows Instant answers
 * `recordingIssuesQuery` with: in the order he first said them (the tracker's
 * time for each mention), each with how many times; a mention whose Issue is
 * not a row is counted and names none. The title is the recording row's, when
 * it is one.
 */
export const recordingIssuesOf = (
  recordingId: string,
  data: unknown,
): RecordingIssues => {
  const mentions = S.decodeUnknownSync(StoredMentions)(data).issueMentions
  const said = pipe(
    mentions,
    Array.flatMap(
      (mention): ReadonlyArray<SaidIssue> =>
        Option.toArray(
          Option.map(firstOf(mention.issue), issue => ({
            atMs: mention.capturedAtMs ?? Number.MAX_SAFE_INTEGER,
            issue,
          })),
        ),
    ),
    Array.sort(
      Order.mapInput(Order.Number, (mention: SaidIssue) => mention.atMs),
    ),
  )
  const numbers = Array.dedupe(Array.map(said, ({ issue }) => issue.number))
  return RecordingIssues.make({
    issues: Array.flatMap(
      numbers,
      (number): ReadonlyArray<RecordingIssue> =>
        Option.toArray(
          Option.map(
            Array.findFirst(said, ({ issue }) => issue.number === number),
            ({ issue }) =>
              RecordingIssue.make({
                mentionCount: Array.filter(
                  said,
                  mention => mention.issue.number === number,
                ).length,
                number,
                status: issue.status,
                title: issue.title,
              }),
          ),
        ),
    ),
    maybeTitle: Array.findFirst(mentions, mention =>
      Option.map(firstOf(mention.recording), recording => recording.title),
    ),
    mentionCount: mentions.length,
    recordingId: recordingId.toLowerCase(),
  })
}

/** Each Issue a recording's lines mention, in the same order, with the agents started for it. */
export const recordingAgentsOf = (
  recording: RecordingIssues,
  issues: ReadonlyArray<IssueAgents>,
): ReadonlyArray<RecordingIssueAgents> =>
  Array.map(recording.issues, issue => ({
    agents: Option.getOrElse(
      Option.map(
        Array.findFirst(issues, agents => agents.issueNumber === issue.number),
        agents => agents.agents,
      ),
      () => [],
    ),
    issue,
  }))
