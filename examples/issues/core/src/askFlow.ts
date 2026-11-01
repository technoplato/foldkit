import { Array, Option, Order, pipe } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

import { type TimelineStep, TimelineStepName, timelineOf } from './timeline.js'

const SLOWEST_SHOWN = 5

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

const slowestFirst: Order.Order<SlowAsk> = Order.mapInput(
  Order.flip(Order.Number),
  (ask: SlowAsk) => ask.tookMs,
)

const middleOf = (ascending: ReadonlyArray<number>): number => {
  const count = ascending.length
  const upperMiddle = Math.floor(count / 2)
  return count % 2 === 1
    ? Option.getOrElse(Array.get(ascending, upperMiddle), () => 0)
    : (Option.getOrElse(Array.get(ascending, upperMiddle - 1), () => 0) +
        Option.getOrElse(Array.get(ascending, upperMiddle), () => 0)) /
        2
}

const flowOfStep = (
  name: TimelineStepName,
  issues: ReadonlyArray<Issue>,
): Option.Option<AskFlowStep> => {
  const asks = Array.flatMap(issues, issue =>
    pipe(
      stepsOf(issue),
      Array.findFirst(step => step.name === name),
      Option.flatMap(step => step.maybeTookMs),
      Option.map(tookMs => ({ issueId: issue.id, tookMs })),
      Option.toArray,
    ),
  )
  return Array.match(asks, {
    onEmpty: () => Option.none(),
    onNonEmpty: found =>
      Option.some({
        name,
        count: found.length,
        medianMs: middleOf(
          Array.sort(
            Array.map(found, ask => ask.tookMs),
            Order.Number,
          ),
        ),
        slowest: Array.take(Array.sort(found, slowestFirst), SLOWEST_SHOWN),
      }),
  })
}

const flowByCatalog = new WeakMap<
  ReadonlyArray<Issue>,
  ReadonlyArray<AskFlowStep>
>()

/**
 * How long asks take: each step of the timeline, in order, with its median and
 * slowest asks, read from the catalog's mentions and work logs. A step no
 * Issue reached is left out. Read once per snapshot, and once per Issue while
 * it is unchanged.
 */
export const askFlowOf = (
  issues: ReadonlyArray<Issue>,
): ReadonlyArray<AskFlowStep> =>
  Option.getOrElse(Option.fromUndefinedOr(flowByCatalog.get(issues)), () => {
    const flow = Array.getSomes(
      Array.map(TimelineStepName.literals, name => flowOfStep(name, issues)),
    )
    flowByCatalog.set(issues, flow)
    return flow
  })
