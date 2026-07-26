import * as Calculator from 'calculator-core-example'
import * as Counter from 'counter-core-example'
import * as Counters from 'counters-core-example'
import { Effect, Layer, Match as M, Option, Schema as S } from 'effect'
import * as Fact from 'fact-core-example'
import { Program, Runtime } from 'foldkit'

import {
  defaultCalculatorMessages,
  defaultCounterMessages,
} from './manifest.js'

/** The Programs available in the replayability example. */
export const ReplayProgramId = S.Literals([
  'Counters',
  'Counter',
  'Calculator',
  'Fact',
])
/** A Program identifier available in the replayability example. */
export type ReplayProgramId = typeof ReplayProgramId.Type

const CounterRouter = Program.makeRouter(Counter.CounterProgram)
const CountersRouter = Program.makeRouter(Counters.MultipleCountersProgram)
const CalculatorRouter = Program.makeRouter(Calculator.CalculatorProgram)
const FactRouter = Program.makeRouter(Fact.FactProgram)
const [initialCountersModel] = Counters.init()

/** A parsed Counter destination with its fully typed route. */
export const CounterDestination = S.TaggedStruct('Counter', {
  route: CounterRouter.Route,
})
/** A parsed Counter destination. */
export type CounterDestination = typeof CounterDestination.Type

/** A parsed Multiple Counters destination with its fully typed route. */
export const CountersDestination = S.TaggedStruct('Counters', {
  route: CountersRouter.Route,
})
/** A parsed Multiple Counters destination. */
export type CountersDestination = typeof CountersDestination.Type

/** A parsed Calculator destination with its fully typed route. */
export const CalculatorDestination = S.TaggedStruct('Calculator', {
  route: CalculatorRouter.Route,
})
/** A parsed Calculator destination. */
export type CalculatorDestination = typeof CalculatorDestination.Type

/** A parsed Fact destination with its fully typed route. */
export const FactDestination = S.TaggedStruct('Fact', {
  route: FactRouter.Route,
})
/** A parsed Fact destination. */
export type FactDestination = typeof FactDestination.Type

/** A typed portable destination for one registered Program. */
export const ReplayDestination = S.Union([
  CountersDestination,
  CounterDestination,
  CalculatorDestination,
  FactDestination,
])
/** A typed portable destination for one registered Program. */
export type ReplayDestination = typeof ReplayDestination.Type

/**
 * The engine-owned parser-printer shared by every replayability client.
 */
export const replayDestinationRouter =
  Program.makeDestinationRouter<ReplayDestination>(
    Program.routeCase<
      ReplayDestination,
      Counters.Model,
      Counters.Message,
      Counters.CounterFactClient
    >(Counters.MultipleCountersProgram, {
      embed: route => CountersDestination.make({ route }),
      extract: destination =>
        destination._tag === 'Counters'
          ? Option.some(destination.route)
          : Option.none(),
    }),
    Program.routeCase<ReplayDestination, Counter.Model, Counter.Message, never>(
      Counter.CounterProgram,
      {
        embed: route => CounterDestination.make({ route }),
        extract: destination =>
          destination._tag === 'Counter'
            ? Option.some(destination.route)
            : Option.none(),
      },
    ),
    Program.routeCase<
      ReplayDestination,
      Calculator.Model,
      Calculator.Message,
      never
    >(Calculator.CalculatorProgram, {
      embed: route => CalculatorDestination.make({ route }),
      extract: destination =>
        destination._tag === 'Calculator'
          ? Option.some(destination.route)
          : Option.none(),
    }),
    Program.routeCase<
      ReplayDestination,
      Fact.Model,
      Fact.Message,
      Fact.FactClient
    >(Fact.FactProgram, {
      embed: route => FactDestination.make({ route }),
      extract: destination =>
        destination._tag === 'Fact'
          ? Option.some(destination.route)
          : Option.none(),
    }),
  )

/** Parses one canonical relative Program destination. */
export const parseReplayDestination = replayDestinationRouter.parse

/** Prints a destination through the shared engine parser-printer. */
export const printReplayDestination = replayDestinationRouter.print

/** Canonicalizes one accepted relative Program destination. */
export const canonicalizeReplayDestination =
  replayDestinationRouter.canonicalize

/** Records the default real-Message tape for one registered Program. */
export const defaultReplayDestination = (
  programId: ReplayProgramId,
): Effect.Effect<ReplayDestination> =>
  M.value(programId).pipe(
    M.withReturnType<Effect.Effect<ReplayDestination>>(),
    M.when('Counters', () =>
      Effect.succeed(
        CountersDestination.make({
          route: Program.state(initialCountersModel),
        }),
      ),
    ),
    M.when('Counter', () =>
      Effect.scoped(
        Runtime.recordReplayTape(
          Counter.CounterProgram,
          Layer.empty,
          defaultCounterMessages,
        ).pipe(
          Effect.orDie,
          Effect.map(tape =>
            CounterDestination.make({
              route: Program.replay(tape, 0),
            }),
          ),
        ),
      ),
    ),
    M.when('Calculator', () =>
      Effect.scoped(
        Runtime.recordReplayTape(
          Calculator.CalculatorProgram,
          Layer.empty,
          defaultCalculatorMessages,
        ).pipe(
          Effect.orDie,
          Effect.map(tape =>
            CalculatorDestination.make({
              route: Program.replay(tape, 0),
            }),
          ),
        ),
      ),
    ),
    M.when('Fact', () =>
      Effect.succeed(
        FactDestination.make({
          route: Program.state(Fact.initialModel),
        }),
      ),
    ),
    M.exhaustive,
  )
