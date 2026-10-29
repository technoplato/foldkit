import { Array, Match as M, Option, Order, Schema as S, String } from 'effect'

import {
  EndedAgent,
  Issue,
  IssueAgentPresence,
  type IssueAgentRun,
  type IssueStatus,
  type IssueTouchedFile,
  IssueTouchedFiles,
  type IssueWorkInProgress,
  IssueWorkLogEntry,
  RunningAgent,
  StaleAgent,
} from '@foldkit/instant-tools/issues'

/** The agent id `issues working sync` writes its work-log entries under. */
export const workingSyncAgent = 'issues/working-sync'

const HOUR_MS = 3_600_000
const STALE_AFTER_HOURS = 12

/**
 * How long a claim whose agent nothing shows running may stay quiet before
 * it reads as stale: twelve hours.
 */
export const staleAfterMs = STALE_AFTER_HOURS * HOUR_MS

/**
 * One agent `tools/agent-progress-check` saw running:
 * `claude-code/issue-wip-1374@max` on Issue 1374, its branch and
 * worktree.
 */
export const LiveAgent = S.Struct({
  account: S.Option(S.String),
  agentId: S.String,
  branch: S.Option(S.String),
  harness: S.Option(S.String),
  issueId: S.Option(S.String),
  name: S.String,
  startedAtMs: S.Option(S.Number),
  worktree: S.Option(S.String),
})
/** One agent the Mac saw running. */
export type LiveAgent = typeof LiveAgent.Type

/**
 * One agent run that ended, such as `sweep-1201` on Issue 1201, `done` at
 * 17:00, or a run still marked running whose process is gone (`exit 143`).
 */
export const EndedRun = S.Struct({
  endedAtMs: S.Option(S.Number),
  how: S.String,
  issueId: S.Option(S.String),
  name: S.String,
})
/** One agent run that ended. */
export type EndedRun = typeof EndedRun.Type

/** What the Mac saw of its agents at one moment. */
export const AgentSurvey = S.Struct({
  ended: S.Array(EndedRun),
  live: S.Array(LiveAgent),
  observedAtMs: S.Number,
})
/** What the Mac saw of its agents at one moment. */
export type AgentSurvey = typeof AgentSurvey.Type

/**
 * The agent's own name inside a full agent id:
 * `claude-code/issue-wip-1374@max` is `issue-wip-1374`, and
 * `claude-code/claude/sweep-1201` is `sweep-1201`.
 */
export const agentNameOf = (agentId: string): string => {
  const withoutAccount = Option.getOrElse(
    Array.head(String.split(agentId, '@')),
    () => agentId,
  )
  return Option.getOrElse(
    Array.last(String.split(withoutAccount, '/')),
    () => withoutAccount,
  )
}

const accountOf = (agentId: string): Option.Option<string> =>
  Option.filter(
    Array.get(String.split(agentId, '@'), 1),
    account => account !== '',
  )

const isoTimeOf = (timeMs: number): string => new Date(timeMs).toISOString()

const newestStartedFirst: Order.Order<LiveAgent> = Order.mapInput(
  Order.flip(Order.Number),
  (agent: LiveAgent) => Option.getOrElse(agent.startedAtMs, () => 0),
)

const liveAgentsOn = (
  issue: Issue,
  survey: AgentSurvey,
): ReadonlyArray<LiveAgent> => {
  const maybeClaimantName = Option.map(issue.claimantId, agentNameOf)
  return Array.filter(
    survey.live,
    agent =>
      Option.contains(agent.issueId, issue.id) ||
      Option.contains(maybeClaimantName, agent.name),
  )
}

const workingAgentOf = (
  issue: Issue,
  survey: AgentSurvey,
): Option.Option<LiveAgent> => {
  const candidates = liveAgentsOn(issue, survey)
  const named = (maybeName: Option.Option<string>) =>
    Option.flatMap(maybeName, name =>
      Array.findFirst(candidates, agent => agent.name === name),
    )
  return Option.orElse(
    Option.orElse(named(Option.map(issue.claimantId, agentNameOf)), () =>
      named(
        Option.map(issue.agentPresence, presence =>
          agentNameOf(presence.agentId),
        ),
      ),
    ),
    () => Array.head(Array.sort(candidates, newestStartedFirst)),
  )
}

const latestEndedRunOf = (
  survey: AgentSurvey,
  name: string,
): Option.Option<EndedRun> =>
  Array.reduce(
    Array.filter(survey.ended, run => run.name === name),
    Option.none<EndedRun>(),
    (maybeLatest, run) =>
      Option.match(maybeLatest, {
        onNone: () => Option.some(run),
        onSome: latest =>
          Option.isNone(latest.endedAtMs) ||
          (Option.isSome(run.endedAtMs) &&
            run.endedAtMs.value <= latest.endedAtMs.value)
            ? Option.some(latest)
            : Option.some(run),
      }),
  )

const isRunningNamed = (survey: AgentSurvey, name: string): boolean =>
  Array.some(survey.live, agent => agent.name === name)

const sameFiles = (left: IssueTouchedFiles, right: IssueTouchedFiles) =>
  left.base === right.base &&
  left.fileCount === right.fileCount &&
  JSON.stringify(
    S.encodeSync(IssueTouchedFiles)({ ...left, checkedAtMs: 0 }),
  ) ===
    JSON.stringify(
      S.encodeSync(IssueTouchedFiles)({ ...right, checkedAtMs: 0 }),
    )

const keptTouchedFiles = (
  maybeStored: Option.Option<IssueTouchedFiles>,
  maybeFresh: Option.Option<IssueTouchedFiles>,
): Option.Option<IssueTouchedFiles> =>
  Option.match(maybeFresh, {
    onNone: () => maybeStored,
    onSome: fresh =>
      Option.exists(maybeStored, stored => sameFiles(stored, fresh))
        ? maybeStored
        : maybeFresh,
  })

const presenceFor = (
  issue: Issue,
  agentId: string,
): Option.Option<IssueAgentPresence> =>
  Option.filter(issue.agentPresence, presence => presence.agentId === agentId)

const runningPresence = (
  issue: Issue,
  agent: LiveAgent,
  survey: AgentSurvey,
  maybeTouchedFiles: Option.Option<IssueTouchedFiles>,
): IssueAgentPresence => {
  const maybeCurrent = presenceFor(issue, agent.agentId)
  const run = Option.getOrElse(
    Option.filter(
      Option.map(maybeCurrent, current => current.run),
      current => current._tag === 'Running',
    ),
    (): IssueAgentRun => RunningAgent.make({ sinceMs: survey.observedAtMs }),
  )
  return IssueAgentPresence.make({
    account: agent.account,
    agentId: agent.agentId,
    branch: agent.branch,
    harness: agent.harness,
    run,
    startedAtMs: agent.startedAtMs,
    touchedFiles: keptTouchedFiles(
      Option.flatMap(maybeCurrent, current => current.touchedFiles),
      maybeTouchedFiles,
    ),
    worktree: agent.worktree,
  })
}

const presenceWithRun = (
  maybePresence: Option.Option<IssueAgentPresence>,
  agentId: string,
  run: IssueAgentRun,
): IssueAgentPresence =>
  Option.match(maybePresence, {
    onNone: () =>
      IssueAgentPresence.make({
        account: accountOf(agentId),
        agentId,
        branch: Option.none(),
        harness: Option.none(),
        run,
        startedAtMs: Option.none(),
        touchedFiles: Option.none(),
        worktree: Option.none(),
      }),
    onSome: presence => IssueAgentPresence.make({ ...presence, run }),
  })

const endedWhenGone = (
  issue: Issue,
  survey: AgentSurvey,
): Option.Option<IssueAgentPresence> =>
  Option.map(issue.agentPresence, presence =>
    presence.run._tag === 'Running'
      ? IssueAgentPresence.make({
          ...presence,
          run: EndedAgent.make({
            how: Option.match(
              latestEndedRunOf(survey, agentNameOf(presence.agentId)),
              {
                onNone: () => 'no longer running',
                onSome: run => run.how,
              },
            ),
            sinceMs: survey.observedAtMs,
          }),
        })
      : presence,
  )

const nextUpdatedAtMs = (issue: Issue, nowMs: number): number =>
  Math.max(nowMs, issue.updatedAtMs + 1)

const lastActivityMs = (issue: Issue): number =>
  Math.max(
    issue.updatedAtMs,
    ...Array.map(
      Option.toArray(issue.workInProgress),
      work => work.updatedAtMs,
    ),
    ...Array.map(issue.workLog, entry => entry.occurredAtMs),
  )

const releasedClaim = (
  issue: Issue,
  claimant: string,
  run: EndedRun,
  survey: AgentSurvey,
): Issue =>
  Issue.make({
    ...issue,
    agentPresence: Option.some(
      presenceWithRun(
        presenceFor(issue, claimant),
        claimant,
        Option.getOrElse(
          Option.filter(
            Option.map(presenceFor(issue, claimant), presence => presence.run),
            current => current._tag === 'Ended',
          ),
          (): IssueAgentRun =>
            EndedAgent.make({ how: run.how, sinceMs: survey.observedAtMs }),
        ),
      ),
    ),
    claimantId: Option.none(),
    updatedAtMs: nextUpdatedAtMs(issue, survey.observedAtMs),
    workLog: [
      ...issue.workLog,
      IssueWorkLogEntry.make({
        agentId: Option.some(workingSyncAgent),
        commitSha: Option.none(),
        durationSeconds: Option.none(),
        id: `work-${issue.id}-released-${survey.observedAtMs.toString()}`,
        occurredAtMs: survey.observedAtMs,
        state: Option.some('released'),
        summary: `Released the claim of ${claimant}: its run ended (${run.how}) and no agent is running on #${issue.id}.`,
      }),
    ],
  })

const staleClaim = (
  issue: Issue,
  claimant: string,
  survey: AgentSurvey,
): Issue => {
  const isAlreadyStale = Option.exists(
    presenceFor(issue, claimant),
    presence => presence.run._tag === 'Stale',
  )
  if (isAlreadyStale) {
    return issue
  }
  return Issue.make({
    ...issue,
    agentPresence: Option.some(
      presenceWithRun(
        presenceFor(issue, claimant),
        claimant,
        StaleAgent.make({
          reason: `no agent named ${agentNameOf(claimant)} is running, and nothing changed on the Issue since ${isoTimeOf(lastActivityMs(issue))}`,
          sinceMs: survey.observedAtMs,
        }),
      ),
    ),
  })
}

const withClaimObserved = (issue: Issue, survey: AgentSurvey): Issue =>
  Option.match(issue.claimantId, {
    onNone: () => issue,
    onSome: claimant => {
      const name = agentNameOf(claimant)
      if (isRunningNamed(survey, name)) {
        return issue
      }
      return Option.match(latestEndedRunOf(survey, name), {
        onSome: run => releasedClaim(issue, claimant, run, survey),
        onNone: () =>
          survey.observedAtMs - lastActivityMs(issue) > staleAfterMs
            ? staleClaim(issue, claimant, survey)
            : issue,
      })
    },
  })

const statusesThatFollowLanding: ReadonlyArray<IssueStatus> = [
  'InProgress',
  'Addressing',
]

const landedStates: ReadonlyArray<IssueWorkInProgress['landingState']> = [
  'Merged',
  'Shipped',
]

const whereItLanded = (work: IssueWorkInProgress): string =>
  Option.match(work.branch, {
    onNone: () =>
      Option.match(work.commitSha, {
        onNone: () => '',
        onSome: commit => ` (at ${commit})`,
      }),
    onSome: branch =>
      Option.match(work.commitSha, {
        onNone: () => ` (${branch})`,
        onSome: commit => ` (${branch} at ${commit})`,
      }),
  })

const statusEntryPrefix = (issue: Issue): string => `work-${issue.id}-status-`

/**
 * The Issue with its status following its work: InProgress or Addressing
 * work recorded Merged or Shipped moves to VerificationNeeded once per
 * recording of the work, with a work-log entry that says so. A person who
 * sets the status back keeps it until the work is recorded again.
 */
export const statusFollowingLanding = (
  issue: Issue,
  nowMs: number,
  agentId: string,
): Issue =>
  Option.match(issue.workInProgress, {
    onNone: () => issue,
    onSome: work => {
      const isMovedSinceRecorded = Array.some(
        issue.workLog,
        entry =>
          entry.id.startsWith(statusEntryPrefix(issue)) &&
          entry.occurredAtMs >= work.updatedAtMs,
      )
      if (
        !Array.contains(landedStates, work.landingState) ||
        !Array.contains(statusesThatFollowLanding, issue.status) ||
        isMovedSinceRecorded
      ) {
        return issue
      }
      return Issue.make({
        ...issue,
        status: 'VerificationNeeded',
        updatedAtMs: nextUpdatedAtMs(issue, nowMs),
        workLog: [
          ...issue.workLog,
          IssueWorkLogEntry.make({
            agentId: Option.some(agentId),
            commitSha: work.commitSha,
            durationSeconds: Option.none(),
            id: `${statusEntryPrefix(issue)}${nowMs.toString()}`,
            occurredAtMs: nowMs,
            state: Option.some('status'),
            summary: `Status ${issue.status} → VerificationNeeded: the work is ${work.landingState}${whereItLanded(work)}; verify it.`,
          }),
        ],
      })
    },
  })

/**
 * The Issue after one look at the Mac's agents. A running agent on it (its
 * claimant first) is named with its account, branch, worktree, and touched
 * files; an agent no longer running reads as ended; the claim of a run that
 * ended is released with a work-log entry; a claim nothing shows running and
 * that stayed quiet for twelve hours reads as stale but is kept; and work
 * recorded Merged or Shipped moves the Issue to VerificationNeeded. Observing
 * the same survey again changes nothing.
 */
export const observedIssue = (
  issue: Issue,
  survey: AgentSurvey,
  maybeTouchedFiles: Option.Option<IssueTouchedFiles>,
): Issue => {
  const withPresence = Issue.make({
    ...issue,
    agentPresence: Option.match(workingAgentOf(issue, survey), {
      onNone: () => endedWhenGone(issue, survey),
      onSome: agent =>
        Option.some(runningPresence(issue, agent, survey, maybeTouchedFiles)),
    }),
  })
  return statusFollowingLanding(
    withClaimObserved(withPresence, survey),
    survey.observedAtMs,
    workingSyncAgent,
  )
}

/**
 * Where to count the files an Issue's running agent touches: the worktree
 * its work in progress records, else the running agent's own. None while no
 * agent runs on it.
 */
export const worktreeToCount = (
  issue: Issue,
  survey: AgentSurvey,
): Option.Option<string> =>
  Option.flatMap(workingAgentOf(issue, survey), agent =>
    Option.orElse(
      Option.flatMap(issue.workInProgress, work => work.worktree),
      () => agent.worktree,
    ),
  )

const runLine = (presence: IssueAgentPresence): string =>
  M.value(presence.run).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Running: ({ sinceMs }) =>
        Option.match(presence.startedAtMs, {
          onNone: () => `Running: yes, seen since ${isoTimeOf(sinceMs)}`,
          onSome: startedAtMs =>
            `Running: yes, seen since ${isoTimeOf(sinceMs)} (started ${isoTimeOf(startedAtMs)})`,
        }),
      Ended: ({ how, sinceMs }) =>
        `Running: no, its run ended (${how}); seen ${isoTimeOf(sinceMs)}`,
      Stale: ({ reason, sinceMs }) =>
        `Running: unknown, stale since ${isoTimeOf(sinceMs)}: ${reason}`,
    }),
  )

const touchedFileLine = (file: IssueTouchedFile): string =>
  M.value(file).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Changed: ({ deletions, insertions, path }) =>
        `  ${path}  +${insertions.toString()} -${deletions.toString()}`,
      Binary: ({ path }) => `  ${path}  binary`,
      Untracked: ({ path }) => `  ${path}  new, not yet added`,
    }),
  )

const touchedFilesLines = (
  touchedFiles: IssueTouchedFiles,
): ReadonlyArray<string> => {
  const hiddenCount = touchedFiles.fileCount - touchedFiles.files.length
  return [
    `Files: ${touchedFiles.fileCount.toString()} touched against ${touchedFiles.base} (counted ${isoTimeOf(touchedFiles.checkedAtMs)})`,
    ...Array.map(touchedFiles.files, touchedFileLine),
    ...(hiddenCount > 0 ? [`  and ${hiddenCount.toString()} more`] : []),
  ]
}

const placeLines = (issue: Issue): ReadonlyArray<string> => {
  const maybeWork = issue.workInProgress
  const maybePresence = issue.agentPresence
  const maybeBranch = Option.orElse(
    Option.flatMap(maybeWork, work => work.branch),
    () => Option.flatMap(maybePresence, presence => presence.branch),
  )
  const maybeRepository = Option.flatMap(maybeWork, work => work.repository)
  const maybeWorktree = Option.orElse(
    Option.flatMap(maybeWork, work => work.worktree),
    () => Option.flatMap(maybePresence, presence => presence.worktree),
  )
  return [
    ...Option.toArray(
      Option.map(maybeBranch, branch =>
        Option.match(maybeRepository, {
          onNone: () => `Branch: ${branch}`,
          onSome: repository => `Branch: ${branch} in ${repository}`,
        }),
      ),
    ),
    ...Option.toArray(
      Option.map(maybeWorktree, worktree => `Worktree: ${worktree}`),
    ),
  ]
}

type Step = Readonly<{ atMs: number; text: string }>

const newestStep = (issue: Issue): Option.Option<Step> => {
  const fromWork = Option.flatMap(issue.workInProgress, work =>
    Option.map(work.lastStep, text => ({ atMs: work.updatedAtMs, text })),
  )
  const fromLog = Array.map(
    Array.filter(
      issue.workLog,
      entry => !Option.contains(entry.agentId, workingSyncAgent),
    ),
    entry => ({ atMs: entry.occurredAtMs, text: entry.summary }),
  )
  return Array.head(
    Array.sort(
      [...Option.toArray(fromWork), ...fromLog],
      Order.mapInput(Order.flip(Order.Number), (step: Step) => step.atMs),
    ),
  )
}

/**
 * The Now working block, one line each: the agent and its account, whether
 * it runs, its branch and worktree, the files it touches, and the last step
 * with its time. Empty while nobody claims the Issue and no agent was seen
 * on it.
 */
export const nowWorkingLines = (issue: Issue): ReadonlyArray<string> => {
  const maybeAgentLines = Option.match(issue.agentPresence, {
    onNone: () =>
      Option.map(issue.claimantId, claimant => [
        `Agent: ${claimant}`,
        'Running: not checked yet',
      ]),
    onSome: presence =>
      Option.some([
        Option.match(presence.account, {
          onNone: () => `Agent: ${presence.agentId}`,
          onSome: account => `Agent: ${presence.agentId} (account ${account})`,
        }),
        runLine(presence),
      ]),
  })
  return Option.match(maybeAgentLines, {
    onNone: () => [],
    onSome: agentLines => [
      ...agentLines,
      ...placeLines(issue),
      ...Option.match(
        Option.flatMap(issue.agentPresence, presence => presence.touchedFiles),
        { onNone: () => [], onSome: touchedFilesLines },
      ),
      ...Option.toArray(
        Option.map(
          newestStep(issue),
          step => `Last step: ${step.text} (${isoTimeOf(step.atMs)})`,
        ),
      ),
    ],
  })
}
