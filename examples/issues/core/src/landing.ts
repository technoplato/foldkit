import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  type Issue,
  type IssueWorkInProgress,
  isCloseToLanding,
  isWorkingNow,
} from '@foldkit/instant-tools/issues'

/** Every Issue, whatever its work in progress. */
export const AllWork = S.TaggedStruct('AllWork', {})
/** Only the Issues whose work is Green or Pushed and not abandoned. */
export const CloseToLanding = S.TaggedStruct('CloseToLanding', {})
/** Only the Issues an agent runs on now, as `issues working sync` last saw it. */
export const WorkingNow = S.TaggedStruct('WorkingNow', {})
/** Which Issues the list shows by their work in progress, owned by the Program. */
export const LandingFilter = S.Union([AllWork, CloseToLanding, WorkingNow])
/** Which Issues the list shows by their work in progress. */
export type LandingFilter = typeof LandingFilter.Type

/** The Issues the landing filter keeps, in their order. */
export const issuesForLandingFilter = (
  issues: ReadonlyArray<Issue>,
  filter: LandingFilter,
): ReadonlyArray<Issue> =>
  M.value(filter).pipe(
    M.withReturnType<ReadonlyArray<Issue>>(),
    M.tagsExhaustive({
      AllWork: () => issues,
      CloseToLanding: () => Array.filter(issues, isCloseToLanding),
      WorkingNow: () => Array.filter(issues, isWorkingNow),
    }),
  )

const stateAndBuild = (work: IssueWorkInProgress): string =>
  Option.match(work.targetBuild, {
    onNone: () => work.landingState,
    onSome: build => `${work.landingState} for build ${build}`,
  })

/**
 * Where the work is in a few words: `Green for build 106`, `Red, stuck`, or
 * `Pushed, abandoned`.
 */
export const landingHeadline = (work: IssueWorkInProgress): string =>
  M.value(work.activity).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Active: () => stateAndBuild(work),
      Stuck: () => `${stateAndBuild(work)}, stuck`,
      Abandoned: () => `${stateAndBuild(work)}, abandoned`,
    }),
  )

/**
 * Where the work is and what holds it: `Green for build 106`, or
 * `Pushed, stuck: Waits on Michael`.
 */
export const landingSummary = (work: IssueWorkInProgress): string =>
  M.value(work.activity).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Active: () => stateAndBuild(work),
      Stuck: ({ reason }) => `${stateAndBuild(work)}, stuck: ${reason}`,
      Abandoned: ({ reason }) => `${stateAndBuild(work)}, abandoned: ${reason}`,
    }),
  )

/** How much of the checklist is done: `1 of 2 done`. */
export const subtaskProgress = (issue: Issue): string => {
  const checkedCount = Array.filter(
    issue.subtasks,
    subtask => subtask.state._tag === 'Checked',
  ).length
  return `${checkedCount.toString()} of ${issue.subtasks.length.toString()} done`
}

const activityLines = (work: IssueWorkInProgress): ReadonlyArray<string> =>
  M.value(work.activity).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      Active: () => [],
      Stuck: ({ reason }) => [`Stuck: ${reason}`],
      Abandoned: ({ reason }) => [`Abandoned: ${reason}`],
    }),
  )

const labeledLine = (
  label: string,
  maybeValue: Option.Option<string>,
): ReadonlyArray<string> =>
  Option.toArray(Option.map(maybeValue, value => `${label}: ${value}`))

const placeLines = (work: IssueWorkInProgress): ReadonlyArray<string> =>
  Option.match(work.branch, {
    onNone: () => labeledLine('Repository', work.repository),
    onSome: branch => [
      Option.match(work.repository, {
        onNone: () => `Branch: ${branch}`,
        onSome: repository => `Branch: ${branch} in ${repository}`,
      }),
    ],
  })

/**
 * Every fact recorded about where the work is, one line each: `State: Green
 * for build 106`, `Stuck: Waits on a review`, `Branch: agent/claude/timeline-804
 * in realtime-voice`, `Worktree: …`, `Commit: …`, `Last step: …`, and
 * `Recorded 2026-10-17T18:00:00.000Z by claude-code/wip-835`.
 */
export const workInProgressLines = (
  work: IssueWorkInProgress,
): ReadonlyArray<string> => {
  const recordedAt = `Recorded ${new Date(work.updatedAtMs).toISOString()}`
  return [
    `State: ${stateAndBuild(work)}`,
    ...activityLines(work),
    ...placeLines(work),
    ...labeledLine('Worktree', work.worktree),
    ...labeledLine('Commit', work.commitSha),
    ...labeledLine('Last step', work.lastStep),
    Option.match(work.agentId, {
      onNone: () => recordedAt,
      onSome: agentId => `${recordedAt} by ${agentId}`,
    }),
  ]
}
