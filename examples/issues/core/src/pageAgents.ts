import { Array, Match as M, Option, Order, pipe } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

import {
  type Backlink,
  type PageEntity,
  backlinksOf,
  linksOfIssue,
} from './entityGraph.js'
import {
  type AgentFinding,
  type AgentRunChip,
  type AgentRunPage,
  agentNameOfHandle,
  harnessOfHandle,
} from './graphFacts.js'
import { loadedIssuesIn } from './listing.js'
import { type Model } from './model.js'
import { readTextReferences } from './textReferences.js'

const SHORT_SHA_LENGTH = 7

const handlesOfIssueMemo = new WeakMap<Issue, ReadonlyArray<string>>()

const handlesOfIssue = (issue: Issue): ReadonlyArray<string> =>
  Option.getOrElse(
    Option.fromUndefinedOr(handlesOfIssueMemo.get(issue)),
    () => {
      const handles = pipe(
        linksOfIssue(issue),
        Array.flatMap(link =>
          link.target._tag === 'AgentEntity' ? [link.target.agentId] : [],
        ),
        Array.dedupe,
      )
      handlesOfIssueMemo.set(issue, handles)
      return handles
    },
  )

const handlesInText = (text: string): ReadonlyArray<string> =>
  Array.flatMap(readTextReferences(text), piece =>
    piece._tag === 'Referenced' && piece.reference._tag === 'AgentName'
      ? [piece.reference.agentId]
      : [],
  )

const LINKS_SHOWN_PER_ISSUE = 3
const RECENT_DAYS = 7
const DAY_MS = 86_400_000

const newestByHandleMemo = new WeakMap<Issue, ReadonlyMap<string, number>>()

const newestByHandleOf = (issue: Issue): ReadonlyMap<string, number> =>
  Option.getOrElse(
    Option.fromUndefinedOr(newestByHandleMemo.get(issue)),
    () => {
      const newest = new Map<string, number>()
      for (const entry of issue.workLog) {
        if (Option.isSome(entry.agentId)) {
          const held = newest.get(entry.agentId.value) ?? 0
          newest.set(entry.agentId.value, Math.max(held, entry.occurredAtMs))
        }
      }
      newestByHandleMemo.set(issue, newest)
      return newest
    },
  )

/** One agent and the last time it wrote on a product's Issues. */
export type RecentAgent = Readonly<{ agentId: string; lastAtMs: number }>

const newestAgentFirst: Order.Order<RecentAgent> = Order.flip(
  Order.mapInput(Order.Number, (agent: RecentAgent) => agent.lastAtMs),
)

const agentsOfProductMemo = new WeakMap<
  ReadonlyArray<Issue>,
  Map<string, ReadonlyArray<RecentAgent>>
>()

const agentsOfProduct = (
  issues: ReadonlyArray<Issue>,
  productId: string,
): ReadonlyArray<RecentAgent> => {
  const byProduct = Option.getOrElse(
    Option.fromUndefinedOr(agentsOfProductMemo.get(issues)),
    () => {
      const fresh = new Map<string, ReadonlyArray<RecentAgent>>()
      agentsOfProductMemo.set(issues, fresh)
      return fresh
    },
  )
  return Option.getOrElse(
    Option.fromUndefinedOr(byProduct.get(productId)),
    () => {
      const newest = new Map<string, number>()
      for (const issue of issues) {
        if (issue.product.id === productId) {
          for (const [agentId, atMs] of newestByHandleOf(issue)) {
            newest.set(agentId, Math.max(newest.get(agentId) ?? 0, atMs))
          }
        }
      }
      const agents = pipe(
        [...newest],
        Array.filter(([agentId]) => Option.isSome(harnessOfHandle(agentId))),
        Array.map(([agentId, lastAtMs]) => ({ agentId, lastAtMs })),
        Array.sort(newestAgentFirst),
      )
      byProduct.set(productId, agents)
      return agents
    },
  )
}

const recentMemo = new WeakMap<
  ReadonlyArray<RecentAgent>,
  Readonly<{ nowMs: number; recent: ReadonlyArray<RecentAgent> }>
>()

/**
 * The agents that wrote on a product's Issues in the last week, the most recent
 * first. The work log says who, so it costs no read of Scribe's rows, and an
 * Issue's agents are read once while it is unchanged.
 */
export const recentAgentsOf = (
  issues: ReadonlyArray<Issue>,
  productId: string,
  nowMs: number,
): ReadonlyArray<RecentAgent> => {
  if (nowMs === 0) {
    return []
  }
  const agents = agentsOfProduct(issues, productId)
  return Option.getOrElse(
    Option.map(
      Option.filter(
        Option.fromUndefinedOr(recentMemo.get(agents)),
        remembered => remembered.nowMs === nowMs,
      ),
      remembered => remembered.recent,
    ),
    () => {
      const recent = Array.filter(
        agents,
        ({ lastAtMs }) => lastAtMs >= nowMs - RECENT_DAYS * DAY_MS,
      )
      recentMemo.set(agents, { nowMs, recent })
      return recent
    },
  )
}

const handlesOfBacklinksMemo = new WeakMap<
  ReadonlyArray<Backlink>,
  ReadonlyArray<string>
>()

const handlesOfBacklinks = (
  backlinks: ReadonlyArray<Backlink>,
): ReadonlyArray<string> =>
  Option.getOrElse(
    Option.fromUndefinedOr(handlesOfBacklinksMemo.get(backlinks)),
    () => {
      const handles = pipe(
        backlinks,
        Array.flatMap(({ links }) => Array.take(links, LINKS_SHOWN_PER_ISSUE)),
        Array.flatMap(link => handlesInText(link.excerpt)),
        Array.dedupe,
      )
      handlesOfBacklinksMemo.set(backlinks, handles)
      return handles
    },
  )

const uniqueStrings = (words: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(words),
]

const handlesOfFindingsMemo = new WeakMap<
  ReadonlyArray<AgentFinding>,
  ReadonlyArray<string>
>()

const handlesOfFindings = (
  findings: ReadonlyArray<AgentFinding>,
): ReadonlyArray<string> =>
  Option.getOrElse(
    Option.fromUndefinedOr(handlesOfFindingsMemo.get(findings)),
    () => {
      const handles = uniqueStrings(
        Array.flatMap(findings, finding =>
          Option.toArray(finding.maybeAgentId),
        ),
      )
      handlesOfFindingsMemo.set(findings, handles)
      return handles
    },
  )

const handlesOfEntityPage = (
  model: Model,
  entity: PageEntity,
): ReadonlyArray<string> => {
  const issues = loadedIssuesIn(model)
  return entity._tag === 'ProductEntity'
    ? Array.map(
        recentAgentsOf(issues, entity.productId, model.clock.nowMs),
        agent => agent.agentId,
      )
    : handlesOfBacklinks(backlinksOf(issues, entity))
}

const openIssueOf = (model: Model): ReadonlyArray<Issue> =>
  model.issueDetail._tag === 'LoadedIssue'
    ? Option.toArray(model.issueDetail.issue)
    : []

const peekedIssueOf = (model: Model): ReadonlyArray<Issue> =>
  M.value(model.layer).pipe(
    M.withReturnType<ReadonlyArray<Issue>>(),
    M.tag('PeekLayer', ({ issueId }) =>
      Array.filter(loadedIssuesIn(model), issue => issue.id === issueId),
    ),
    M.orElse(() => []),
  )

/**
 * Every handle the open page's chips name, so a page reads the runs it shows
 * and no others: an Issue's claimant, its work log's agents and every agent
 * its words name; on an entity's page, those in the words it quotes. Each
 * Issue's handles are read once, so a live change costs the Issue it changed.
 */
export const agentHandlesOfPage = (model: Model): ReadonlyArray<string> => {
  const onPage = M.value(model.navigation).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tag('IssueDetail', () =>
      Array.flatMap(openIssueOf(model), handlesOfIssue),
    ),
    M.tag('EntityPage', ({ entity }) => handlesOfEntityPage(model, entity)),
    M.tag('Findings', () =>
      model.findingsList._tag === 'LoadedFindings'
        ? handlesOfFindings(model.findingsList.findings)
        : [],
    ),
    M.orElse(() => []),
  )
  const peeked = peekedIssueOf(model)
  return Array.isReadonlyArrayEmpty(peeked)
    ? onPage
    : uniqueStrings([...onPage, ...Array.flatMap(peeked, handlesOfIssue)])
}

/** The open Issue's number, when it has one, for the runs started for it. */
export const issueNumberOfPage = (model: Model): Option.Option<number> =>
  model.navigation._tag === 'IssueDetail'
    ? Option.liftPredicate(
        Number(model.navigation.issueId),
        Number.isSafeInteger,
      )
    : Option.none()

const NAME_SLACK_MS = 600_000

const timesByNameMemo = new WeakMap<
  Issue,
  ReadonlyMap<string, ReadonlyArray<number>>
>()

const timesByNameOf = (
  issue: Issue,
): ReadonlyMap<string, ReadonlyArray<number>> =>
  Option.getOrElse(Option.fromUndefinedOr(timesByNameMemo.get(issue)), () => {
    const times = new Map<string, ReadonlyArray<number>>()
    const wrote = (handle: string, atMs: number): void => {
      for (const key of [handle, agentNameOfHandle(handle)]) {
        times.set(key, [...(times.get(key) ?? []), atMs])
      }
    }
    for (const entry of issue.workLog) {
      if (Option.isSome(entry.agentId)) {
        wrote(entry.agentId.value, entry.occurredAtMs)
      }
    }
    if (Option.isSome(issue.claimantId)) {
      wrote(issue.claimantId.value, issue.updatedAtMs)
    }
    timesByNameMemo.set(issue, times)
    return times
  })

const wasRunningAt = (run: AgentRunChip, atMs: number): boolean =>
  Option.match(run.maybeStartedAtMs, {
    onNone: () => false,
    onSome: startedAtMs =>
      atMs >= startedAtMs - NAME_SLACK_MS &&
      Option.match(run.maybeEndedAtMs, {
        onNone: () => true,
        onSome: endedAtMs => atMs <= endedAtMs + NAME_SLACK_MS,
      }),
  })

const newestRunFirst: Order.Order<AgentRunChip> = Order.flip(
  Order.mapInput(Order.Number, (run: AgentRunChip) =>
    Option.getOrElse(run.maybeStartedAtMs, () => 0),
  ),
)

/**
 * The runs that worked on an Issue, the newest first: those started for it, and
 * those running when a handle of theirs wrote on it. A name is reused across
 * days, so a name alone proves nothing, and a claimant is a name with no run.
 */
export const runsOfIssue = (
  issue: Issue,
  runs: ReadonlyArray<AgentRunChip>,
): ReadonlyArray<AgentRunChip> => {
  const times = timesByNameOf(issue)
  return pipe(
    runs,
    Array.filter(run => !Option.contains(run.maybeKind, 'claimant')),
    Array.filter(
      run =>
        Option.contains(run.maybeIssueId, issue.id) ||
        Array.some(
          [...(times.get(run.agentId) ?? []), ...(times.get(run.name) ?? [])],
          atMs => wasRunningAt(run, atMs),
        ),
    ),
    Array.sort(newestRunFirst),
  )
}

const runHandles = (page: AgentRunPage): ReadonlyArray<string> =>
  Array.dedupe([
    page.run.agentId,
    ...Array.flatMap(page.sessions, session =>
      Option.toArray(session.maybeAgentId),
    ),
  ])

/**
 * Every handle the agent page's runs logged from: a run keeps one row, and its
 * sessions name the accounts it moved through.
 */
export const agentHandlesOfFacts = (model: Model): ReadonlyArray<string> =>
  model.pageFacts._tag === 'LoadedPageFacts' &&
  model.pageFacts.facts._tag === 'AgentFacts'
    ? Array.dedupe(Array.flatMap(model.pageFacts.facts.runs, runHandles))
    : []

/**
 * Several entities' backlinks as one list: an Issue that points at two of them
 * shows once with all its links, in the order the lists came.
 */
export const mergedBacklinks = (
  lists: ReadonlyArray<ReadonlyArray<Backlink>>,
): ReadonlyArray<Backlink> => {
  const byIssue = new Map<string, Backlink>()
  for (const backlink of Array.flatten(lists)) {
    const held = byIssue.get(backlink.issue.id)
    byIssue.set(backlink.issue.id, {
      issue: backlink.issue,
      links: [...(held?.links ?? []), ...backlink.links],
    })
  }
  return [...byIssue.values()]
}

const shasOfEntry = (
  structured: Option.Option<string>,
  summary: string,
): ReadonlyArray<string> => [
  ...Option.toArray(structured),
  ...Array.flatMap(readTextReferences(summary), piece =>
    piece._tag === 'Referenced' && piece.reference._tag === 'CommitSha'
      ? [piece.reference.sha]
      : [],
  ),
]

/**
 * The commits a run logged: every commit a work-log entry by one of its handles
 * names, on the Issues the run touched. Scribe's rows do not tie a commit to a
 * run, and a commit names no branch, so the Issue's own work log says.
 */
export const commitsOfRun = (
  page: AgentRunPage,
  issuesById: ReadonlyMap<string, Issue>,
): ReadonlyArray<string> => {
  const handles = runHandles(page)
  return pipe(
    page.run.issueIds,
    Array.flatMap(issueId =>
      Option.toArray(Option.fromUndefinedOr(issuesById.get(issueId))),
    ),
    Array.flatMap(issue => issue.workLog),
    Array.filter(entry =>
      Option.exists(entry.agentId, agentId => Array.contains(handles, agentId)),
    ),
    Array.flatMap(entry => shasOfEntry(entry.commitSha, entry.summary)),
    Array.dedupeWith(
      (left, right) =>
        left.slice(0, SHORT_SHA_LENGTH) === right.slice(0, SHORT_SHA_LENGTH),
    ),
  )
}
