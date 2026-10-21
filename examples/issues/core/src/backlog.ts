import { Array, Option, Order, Schema as S } from 'effect'

import {
  Issue,
  IssuePriority,
  type IssueStatus,
} from '@foldkit/instant-tools/issues'

const FINISHED_STATUSES: ReadonlyArray<IssueStatus> = [
  'Closed',
  'Fixed',
  'Resolved',
  'Verified',
]

/**
 * How far before the first Issue of a priority, or after the last, a rank
 * lands: one day on the `createdAtMs` axis.
 */
export const RANK_GAP_MS = 86_400_000

/** One upcoming build and the unfinished work that targets it. */
export const BuildLane = S.Struct({
  build: S.String,
  isNext: S.Boolean,
  issues: S.Array(Issue),
})
/** One upcoming build and the unfinished work that targets it. */
export type BuildLane = typeof BuildLane.Type

/** The backlog's Issues of one priority, in rank order. */
export const PrioritySection = S.Struct({
  issues: S.Array(Issue),
  priority: IssuePriority,
})
/** The backlog's Issues of one priority, in rank order. */
export type PrioritySection = typeof PrioritySection.Type

/**
 * The backlog: a lane per upcoming build, the next build first, then each
 * priority from P0 down. Every unfinished Issue appears once.
 */
export const BacklogListing = S.Struct({
  lanes: S.Array(BuildLane),
  sections: S.Array(PrioritySection),
})
/** The backlog: build lanes, then priority sections. */
export type BacklogListing = typeof BacklogListing.Type

/** The rank that puts an Issue in the place asked for. */
export const RankedAt = S.TaggedStruct('RankedAt', { rank: S.Number })
/** A rank orders Issues within one priority, and these two differ. */
export const DifferentPriority = S.TaggedStruct('DifferentPriority', {
  anchorPriority: IssuePriority,
  issuePriority: IssuePriority,
})
/** The two neighbors hold the same place, so nothing fits between them. */
export const NoRoom = S.TaggedStruct('NoRoom', {})
/** An Issue named in the ranking is not in the list. */
export const UnknownIssue = S.TaggedStruct('UnknownIssue', {
  issueId: S.String,
})
/** Where a rank request lands, or why it cannot. */
export const RankPlacement = S.Union([
  RankedAt,
  DifferentPriority,
  NoRoom,
  UnknownIssue,
])
/** Where a rank request lands, or why it cannot. */
export type RankPlacement = typeof RankPlacement.Type

/** True until an Issue is Closed, Fixed, Resolved, or Verified. */
export const isUnfinished = (issue: Issue): boolean =>
  !Array.contains(FINISHED_STATUSES, issue.status)

const isQueuedWork = (issue: Issue): boolean =>
  isUnfinished(issue) && issue.status !== 'VerificationNeeded'

/** An Issue's place within its priority: its rank, or else when it was filed. */
export const backlogPlace = (issue: Issue): number =>
  Option.getOrElse(issue.backlogRank, () => issue.createdAtMs)

/** P0 first, then by place within a priority, then by number. */
export const IssueBacklogOrder: Order.Order<Issue> = Order.combine(
  Order.combine(
    Order.mapInput(Order.String, (issue: Issue) => issue.priority),
    Order.mapInput(Order.Number, backlogPlace),
  ),
  Order.mapInput(Order.String, (issue: Issue) => issue.id),
)

const ShippedState = 'Shipped'

const upcomingBuildOf = (issue: Issue): Option.Option<number> =>
  Option.flatMap(issue.workInProgress, work =>
    work.landingState === ShippedState || work.activity._tag === 'Abandoned'
      ? Option.none()
      : Option.flatMap(work.targetBuild, buildNumber),
  )

const shippedBuildOf = (issue: Issue): Option.Option<number> =>
  Option.flatMap(issue.workInProgress, work =>
    work.landingState === ShippedState
      ? Option.flatMap(work.targetBuild, buildNumber)
      : Option.none(),
  )

const buildNumber = (build: string): Option.Option<number> =>
  /^\d+$/.test(build.trim()) ? Option.some(Number(build.trim())) : Option.none()

const upcomingBuilds = (
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<number> => {
  const shipped = Array.getSomes(Array.map(issues, shippedBuildOf))
  const maybeLastShipped = Array.isReadonlyArrayNonEmpty(shipped)
    ? Option.some(Array.max(shipped, Order.Number))
    : Option.none()
  const pending = Array.getSomes(
    Array.map(Array.filter(issues, isUnfinished), upcomingBuildOf),
  )
  return Array.sort(
    Array.dedupe(
      Array.filter(pending, build =>
        Option.match(maybeLastShipped, {
          onNone: () => true,
          onSome: lastShipped => build > lastShipped,
        }),
      ),
    ),
    Order.Number,
  )
}

/**
 * The build the next unshipped work targets: the lowest target build above
 * every build that shipped work. With 110 shipped and work for 107, 111, and
 * 112 still open, it is `111`; the work for 107 missed its build.
 */
export const nextBuild = (
  issues: ReadonlyArray<Issue>,
): Option.Option<string> =>
  Option.map(Array.head(upcomingBuilds(issues)), String)

/** Lanes, then priority sections, for the unfinished Issues given. */
export const backlogOf = (issues: ReadonlyArray<Issue>): BacklogListing => {
  const builds = upcomingBuilds(issues)
  const sorted = Array.sort(
    Array.filter(issues, isUnfinished),
    IssueBacklogOrder,
  )
  const laneBuildOf = (issue: Issue): Option.Option<number> =>
    Option.filter(upcomingBuildOf(issue), build =>
      Array.contains(builds, build),
    )
  const lanes = Array.map(builds, (build, position) =>
    BuildLane.make({
      build: String(build),
      isNext: position === 0,
      issues: Array.filter(sorted, issue =>
        Option.contains(laneBuildOf(issue), build),
      ),
    }),
  )
  const queued = Array.filter(
    sorted,
    issue => isQueuedWork(issue) && Option.isNone(laneBuildOf(issue)),
  )
  const sections = Array.filter(
    Array.map(IssuePriority.literals, priority =>
      PrioritySection.make({
        issues: Array.filter(queued, issue => issue.priority === priority),
        priority,
      }),
    ),
    section => Array.isReadonlyArrayNonEmpty(section.issues),
  )
  return BacklogListing.make({ lanes, sections })
}

/** Every Issue of the backlog in the order it shows them. */
export const backlogIssues = (
  backlog: BacklogListing,
): ReadonlyArray<Issue> => [
  ...Array.flatMap(backlog.lanes, lane => lane.issues),
  ...Array.flatMap(backlog.sections, section => section.issues),
]

/** `1 Issue`, `3 Issues`. */
export const issueCount = (count: number): string =>
  count === 1 ? '1 Issue' : `${count.toString()} Issues`

/** `Build 111, the next build: 2 Issues` or `Build 112: 1 Issue`. */
export const laneHeading = (lane: BuildLane): string =>
  lane.isNext
    ? `Build ${lane.build}, the next build: ${issueCount(lane.issues.length)}`
    : `Build ${lane.build}: ${issueCount(lane.issues.length)}`

/** `P0: 3 Issues`. */
export const sectionHeading = (section: PrioritySection): string =>
  `${section.priority}: ${issueCount(section.issues.length)}`

/**
 * The unfinished Issues of one priority in backlog order, without the Issue
 * being moved, so a rank lands relative to the others.
 */
const othersOfPriority = (
  issues: ReadonlyArray<Issue>,
  priority: IssuePriority,
  movingId: string,
): ReadonlyArray<Issue> =>
  Array.sort(
    Array.filter(
      issues,
      issue =>
        issue.priority === priority &&
        issue.id !== movingId &&
        isUnfinished(issue),
    ),
    IssueBacklogOrder,
  )

const between = (lower: number, upper: number): RankPlacement => {
  const middle = (lower + upper) / 2
  return middle <= lower || middle >= upper
    ? NoRoom.make({})
    : RankedAt.make({ rank: middle })
}

const findIssue = (
  issues: ReadonlyArray<Issue>,
  issueId: string,
): Option.Option<Issue> =>
  Array.findFirst(issues, issue => issue.id === issueId)

const placeRelative = (
  issues: ReadonlyArray<Issue>,
  issueId: string,
  anchorId: string,
  neighborOffset: number,
): RankPlacement => {
  const maybeIssue = findIssue(issues, issueId)
  const maybeAnchor = findIssue(issues, anchorId)
  if (Option.isNone(maybeIssue)) {
    return UnknownIssue.make({ issueId })
  }
  if (Option.isNone(maybeAnchor)) {
    return UnknownIssue.make({ issueId: anchorId })
  }
  const issue = maybeIssue.value
  const anchor = maybeAnchor.value
  if (issue.priority !== anchor.priority) {
    return DifferentPriority.make({
      anchorPriority: anchor.priority,
      issuePriority: issue.priority,
    })
  }
  const others = othersOfPriority(issues, issue.priority, issue.id)
  const anchorPlace = backlogPlace(anchor)
  const maybeNeighbor = Option.flatMap(
    Array.findFirstIndex(others, other => other.id === anchor.id),
    position => Array.get(others, position + neighborOffset),
  )
  return Option.match(Option.map(maybeNeighbor, backlogPlace), {
    onNone: () =>
      RankedAt.make({ rank: anchorPlace + neighborOffset * RANK_GAP_MS }),
    onSome: neighborPlace =>
      neighborOffset < 0
        ? between(neighborPlace, anchorPlace)
        : between(anchorPlace, neighborPlace),
  })
}

/** The rank that puts `issueId` just before `anchorId` in their priority. */
export const rankBefore = (
  issues: ReadonlyArray<Issue>,
  issueId: string,
  anchorId: string,
): RankPlacement => placeRelative(issues, issueId, anchorId, -1)

/** The rank that puts `issueId` just after `anchorId` in their priority. */
export const rankAfter = (
  issues: ReadonlyArray<Issue>,
  issueId: string,
  anchorId: string,
): RankPlacement => placeRelative(issues, issueId, anchorId, 1)

/** The rank that puts `issueId` first in its priority. */
export const rankTop = (
  issues: ReadonlyArray<Issue>,
  issueId: string,
): RankPlacement =>
  Option.match(findIssue(issues, issueId), {
    onNone: () => UnknownIssue.make({ issueId }),
    onSome: issue =>
      Option.match(
        Array.head(othersOfPriority(issues, issue.priority, issue.id)),
        {
          onNone: () => RankedAt.make({ rank: backlogPlace(issue) }),
          onSome: first =>
            RankedAt.make({ rank: backlogPlace(first) - RANK_GAP_MS }),
        },
      ),
  })

/**
 * Where an Issue sits in the group the backlog shows it in, counting from 1:
 * `2` of `3` in `P0`, or `1` of `2` in `build 111`.
 */
export const placeInBacklog = (
  backlog: BacklogListing,
  issueId: string,
): Option.Option<
  Readonly<{ count: number; group: string; position: number }>
> =>
  Array.findFirst(
    [
      ...Array.map(backlog.lanes, lane => ({
        group: `build ${lane.build}`,
        issues: lane.issues,
      })),
      ...Array.map(backlog.sections, section => ({
        group: section.priority,
        issues: section.issues,
      })),
    ],
    ({ group, issues }) =>
      Option.map(
        Array.findFirstIndex(issues, issue => issue.id === issueId),
        position => ({ count: issues.length, group, position: position + 1 }),
      ),
  )
