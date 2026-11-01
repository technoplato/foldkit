import { Array, Option, Order } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

import { type TimelineStep, TimelineStepName, timelineOf } from './timeline.js'

const SLOWEST_SHOWN = 5

/**
 * Past this share of the catalog changed at once, such as on the first read,
 * the asks are gathered afresh rather than one changed Issue at a time.
 */
const FRESH_READ_SHARE = 0.25

/** One ask's time on one step: #1395 took 5 h to claim. */
export type SlowAsk = Readonly<{ issueId: string; tookMs: number }>

/**
 * How long one step of an ask takes across the catalog: how many Issues
 * reached it with a time, the median, and the slowest asks, the slowest first.
 */
export type AskFlowStep = Readonly<{
  name: TimelineStepName
  count: number
  medianMs: number
  slowest: ReadonlyArray<SlowAsk>
}>

const stepsByIssue = new WeakMap<Issue, ReadonlyArray<TimelineStep>>()

const stepsOf = (issue: Issue): ReadonlyArray<TimelineStep> =>
  Option.getOrElse(Option.fromUndefinedOr(stepsByIssue.get(issue)), () => {
    const steps = timelineOf(issue)
    stepsByIssue.set(issue, steps)
    return steps
  })

/** One Issue's time on each step it reached with one, its first of each. */
const asksOf = (
  issue: Issue,
): ReadonlyMap<TimelineStepName, SlowAsk> => {
  const asks = new Map<TimelineStepName, SlowAsk>()
  for (const step of stepsOf(issue)) {
    if (!asks.has(step.name)) {
      Option.map(step.maybeTookMs, tookMs => {
        asks.set(step.name, { issueId: issue.id, tookMs })
      })
    }
  }
  return asks
}

const quickestFirst: Order.Order<SlowAsk> = Order.combine(
  Order.mapInput(Order.Number, (ask: SlowAsk) => ask.tookMs),
  Order.mapInput(Order.String, (ask: SlowAsk) => ask.issueId),
)

/** Where `ask` belongs in `asks`, quickest first. */
const placeOf = (asks: ReadonlyArray<SlowAsk>, ask: SlowAsk): number => {
  let low = 0
  let high = asks.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const isBefore = Option.match(Array.get(asks, middle), {
      onNone: () => false,
      onSome: held => quickestFirst(held, ask) < 0,
    })
    if (isBefore) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

const middleOf = (quickestFirst: ReadonlyArray<SlowAsk>): number => {
  const count = quickestFirst.length
  const upperMiddle = Math.floor(count / 2)
  const tookMsAt = (position: number): number =>
    Option.match(Array.get(quickestFirst, position), {
      onNone: () => 0,
      onSome: ask => ask.tookMs,
    })
  return count % 2 === 1
    ? tookMsAt(upperMiddle)
    : (tookMsAt(upperMiddle - 1) + tookMsAt(upperMiddle)) / 2
}

/**
 * Each step's asks, quickest first, for the Issues they were read from: what
 * a later snapshot changes one Issue at a time.
 */
type FlowState = Readonly<{
  asksByStep: ReadonlyMap<TimelineStepName, ReadonlyArray<SlowAsk>>
  flow: ReadonlyArray<AskFlowStep>
  issuesById: ReadonlyMap<string, Issue>
}>

const flowOf = (
  asksByStep: ReadonlyMap<TimelineStepName, ReadonlyArray<SlowAsk>>,
): ReadonlyArray<AskFlowStep> =>
  Array.getSomes(
    Array.map(TimelineStepName.literals, name =>
      Option.flatMap(Option.fromUndefinedOr(asksByStep.get(name)), asks =>
        Array.match(asks, {
          onEmpty: () => Option.none<AskFlowStep>(),
          onNonEmpty: found =>
            Option.some({
              name,
              count: found.length,
              medianMs: middleOf(found),
              slowest: Array.reverse(Array.takeRight(found, SLOWEST_SHOWN)),
            }),
        }),
      ),
    ),
  )

const freshStateOf = (
  issues: ReadonlyArray<Issue>,
  issuesById: ReadonlyMap<string, Issue>,
): FlowState => {
  const gathered = new Map<TimelineStepName, Array<SlowAsk>>()
  for (const issue of issues) {
    for (const [name, ask] of asksOf(issue)) {
      Option.match(Option.fromUndefinedOr(gathered.get(name)), {
        onNone: () => {
          gathered.set(name, [ask])
        },
        onSome: asks => {
          asks.push(ask)
        },
      })
    }
  }
  const asksByStep = new Map(
    Array.map(Array.fromIterable(gathered), ([name, asks]) => [
      name,
      Array.sort(asks, quickestFirst),
    ]),
  )
  return { asksByStep, flow: flowOf(asksByStep), issuesById }
}

/** The ids of Issues added, removed or changed between two snapshots. */
const changedIdsOf = (
  before: ReadonlyMap<string, Issue>,
  after: ReadonlyMap<string, Issue>,
): ReadonlyArray<string> => [
  ...Array.filter(
    Array.fromIterable(after.keys()),
    issueId => before.get(issueId) !== after.get(issueId),
  ),
  ...Array.filter(
    Array.fromIterable(before.keys()),
    issueId => !after.has(issueId),
  ),
]

const changedStateOf = (
  latest: FlowState,
  changedIds: ReadonlyArray<string>,
  issuesById: ReadonlyMap<string, Issue>,
): FlowState => {
  const asksByStep = new Map(
    Array.map(Array.fromIterable(latest.asksByStep), ([name, asks]) => [
      name,
      [...asks],
    ]),
  )
  const asksAt = (name: TimelineStepName): Array<SlowAsk> =>
    Option.getOrElse(Option.fromUndefinedOr(asksByStep.get(name)), () => {
      const asks: Array<SlowAsk> = []
      asksByStep.set(name, asks)
      return asks
    })
  for (const issueId of changedIds) {
    Option.map(Option.fromUndefinedOr(latest.issuesById.get(issueId)), before => {
      for (const [name, ask] of asksOf(before)) {
        const asks = asksAt(name)
        const place = placeOf(asks, ask)
        const isHeld = Option.exists(
          Array.get(asks, place),
          held => quickestFirst(held, ask) === 0,
        )
        if (isHeld) {
          asks.splice(place, 1)
        }
      }
    })
    Option.map(Option.fromUndefinedOr(issuesById.get(issueId)), after => {
      for (const [name, ask] of asksOf(after)) {
        const asks = asksAt(name)
        asks.splice(placeOf(asks, ask), 0, ask)
      }
    })
  }
  return { asksByStep, flow: flowOf(asksByStep), issuesById }
}

const stateByCatalog = new WeakMap<ReadonlyArray<Issue>, FlowState>()

let maybeLatestState = Option.none<FlowState>()

const flowStateOf = (issues: ReadonlyArray<Issue>): FlowState =>
  Option.getOrElse(Option.fromUndefinedOr(stateByCatalog.get(issues)), () => {
    const issuesById = new Map(Array.map(issues, issue => [issue.id, issue]))
    const state = Option.match(maybeLatestState, {
      onNone: () => freshStateOf(issues, issuesById),
      onSome: latest => {
        const changedIds = changedIdsOf(latest.issuesById, issuesById)
        return changedIds.length > issues.length * FRESH_READ_SHARE
          ? freshStateOf(issues, issuesById)
          : changedStateOf(latest, changedIds, issuesById)
      },
    })
    stateByCatalog.set(issues, state)
    maybeLatestState = Option.some(state)
    return state
  })

/**
 * How long asks take: each step of the timeline, in order, with its median and
 * slowest asks, read from the catalog's mentions and work logs. A step no
 * Issue reached is left out. Read once per snapshot; a live change reads only
 * the Issues it changed, against the snapshot read before it: one Issue of
 * 1,500 costs one Issue's steps, not 1,500.
 */
export const askFlowOf = (
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<AskFlowStep> => flowStateOf(issues).flow
