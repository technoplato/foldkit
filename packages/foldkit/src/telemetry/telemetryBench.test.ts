/// <reference types="node" />
import {
  Array,
  Effect,
  Layer,
  Match as M,
  Option,
  Order,
  Predicate,
  Schema as S,
} from 'effect'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'

import * as Command from '../command/index.js'
import { m } from '../message/index.js'
import { make } from '../program/program.js'
import {
  type ProgramRuntimeObserver,
  makeProgramRuntime,
} from '../runtime/programRuntime.js'
import { observer } from './attach.js'
import { fileSink } from './node.js'
import { makeMemorySink } from './sink.js'

/**
 * Telemetry overhead benchmark. Skipped by default to keep CI runs lean.
 * Run with:
 *
 *   RUN_RUNTIME_BENCH=1 pnpm vitest run src/telemetry/telemetryBench.test.ts
 *
 * Sends a burst of Messages into a Program runtime with telemetry off and
 * on, with every Message processed in one synchronous drain, and reports
 * the time per Message. The Command variant returns one Command per
 * Message, so it also measures the Command tracer.
 */

// NOTE: reads process.env through globalThis, as dispatchBench.test.ts
// does, so the flag reads the same under every vitest environment.
const readBenchFlag = (): unknown => {
  const nodeProcess: unknown = Reflect.get(globalThis, 'process')
  if (!Predicate.hasProperty(nodeProcess, 'env')) {
    return undefined
  }
  const env = nodeProcess.env
  if (!Predicate.hasProperty(env, 'RUN_RUNTIME_BENCH')) {
    return undefined
  }
  return env.RUN_RUNTIME_BENCH
}

const isBenchEnabled = readBenchFlag() === '1'

const Model = S.Struct({ count: S.Number, completed: S.Number })
type Model = typeof Model.Type

const Incremented = m('Incremented', { by: S.Number })
const IncrementedWithCommand = m('IncrementedWithCommand', { by: S.Number })
const CompletedNote = m('CompletedNote')
const Message = S.Union([Incremented, IncrementedWithCommand, CompletedNote])
type Message = typeof Message.Type

const Note = Command.define(
  'Note',
  { by: S.Number },
  CompletedNote,
)(() => Effect.succeed(CompletedNote()))

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const BenchProgram = make({
  id: 'telemetry-benchmark',
  version: 1,
  Model,
  Message,
  init: () => [{ count: 0, completed: 0 }, []],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<UpdateReturn>(),
      M.tagsExhaustive({
        Incremented: ({ by }) => [{ ...model, count: model.count + by }, []],
        IncrementedWithCommand: ({ by }) => [
          { ...model, count: model.count + by },
          [Note({ by })],
        ],
        CompletedNote: () => [{ ...model, completed: model.completed + 1 }, []],
      }),
    ),
})

const unlimitedSynchronousWork = {
  now: () => performance.now(),
  defer: (resume: () => void) => {
    const timeout = setTimeout(resume, 0)
    return () => clearTimeout(timeout)
  },
  synchronousWorkBudgetMs: Number.POSITIVE_INFINITY,
}

type Variant = Readonly<{
  label: string
  observers: () => Effect.Effect<
    ReadonlyArray<ProgramRuntimeObserver<Model, Message>>,
    never,
    never
  >
  isWithCommands: boolean
  isIncludingShutdown?: boolean
}>

const runOnce = (variant: Variant, messageCount: number): Promise<number> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const startedAt = performance.now()
      const dispatchMs = yield* Effect.scoped(
        Effect.gen(function* () {
          const observers = yield* variant.observers()
          const runtime = yield* makeProgramRuntime({
            program: BenchProgram,
            resources: Layer.empty,
            scheduling: unlimitedSynchronousWork,
            observers,
          })
          yield* runtime.initialization
          const sendingStartedAt = performance.now()
          for (let index = 0; index < messageCount; index++) {
            runtime.send(
              variant.isWithCommands
                ? IncrementedWithCommand({ by: 1 })
                : Incremented({ by: 1 }),
            )
          }
          const elapsed = performance.now() - sendingStartedAt
          if (runtime.readModel().count !== messageCount) {
            throw new Error('The benchmark did not process every Message')
          }
          return elapsed
        }),
      )
      return variant.isIncludingShutdown === true
        ? performance.now() - startedAt
        : dispatchMs
    }),
  )

const summarize = (
  label: string,
  messageCount: number,
  samples: ReadonlyArray<number>,
): number => {
  const sorted = Array.sort(samples, Order.Number)
  const medianMs = Option.getOrElse(
    Array.get(sorted, Math.floor(sorted.length / 2)),
    () => 0,
  )
  const microsPerMessage = (medianMs * 1000) / messageCount
  console.log(
    `[bench] ${label}: median=${medianMs.toFixed(2)}ms (n=${samples.length}, ${messageCount} msgs/run) | ${microsPerMessage.toFixed(3)}µs/msg`,
  )
  return microsPerMessage
}

const warmupRounds = 3

const measuredRounds = 21

/**
 * Measures every variant in rounds, one sample of each per round, so a
 * machine that slows down or speeds up mid-run moves every variant alike
 * instead of only the one being measured at the time.
 */
const measureInterleaved = async (
  variants: ReadonlyArray<Variant>,
  messageCount: number,
): Promise<ReadonlyArray<number>> => {
  for (let round = 0; round < warmupRounds; round++) {
    for (const variant of variants) {
      await runOnce(variant, messageCount)
    }
  }
  const samples = Array.map(variants, (): Array<number> => [])
  for (let round = 0; round < measuredRounds; round++) {
    for (const [index, variant] of variants.entries()) {
      const elapsed = await runOnce(variant, messageCount)
      Option.map(Array.get(samples, index), variantSamples => {
        variantSamples.push(elapsed)
      })
    }
  }
  return Array.map(variants, (variant, index) =>
    summarize(
      variant.label,
      messageCount,
      Option.getOrElse(Array.get(samples, index), () => []),
    ),
  )
}

const noObservers = () => Effect.succeed([])

const memoryTelemetry = () =>
  Effect.succeed([
    observer<Model, Message>({
      app: 'bench',
      host: 'headless',
      sink: makeMemorySink().layer,
    }),
  ])

describe.skipIf(!isBenchEnabled)('telemetry overhead', () => {
  it(
    'measures dispatch with telemetry off and on',
    { timeout: 300_000 },
    async () => {
      const messageCount = 5_000
      const directory = await mkdtemp(
        join(tmpdir(), 'foldkit-telemetry-bench-'),
      )
      const fileTelemetry = () =>
        Effect.succeed([
          observer<Model, Message>({
            app: 'bench',
            host: 'headless',
            sink: fileSink({ directory }),
          }),
        ])
      const [
        off = 0,
        onMemory = 0,
        onFile = 0,
        commandsOff = 0,
        commandsOn = 0,
        offWithShutdown = 0,
        onFileWithShutdown = 0,
      ] = await measureInterleaved(
        [
          {
            label: 'Messages, telemetry off',
            observers: noObservers,
            isWithCommands: false,
          },
          {
            label: 'Messages, telemetry on, memory sink',
            observers: memoryTelemetry,
            isWithCommands: false,
          },
          {
            label: 'Messages, telemetry on, file sink',
            observers: fileTelemetry,
            isWithCommands: false,
          },
          {
            label: 'Messages with a Command, telemetry off',
            observers: noObservers,
            isWithCommands: true,
          },
          {
            label: 'Messages with a Command, telemetry on, file sink',
            observers: fileTelemetry,
            isWithCommands: true,
          },
          {
            label: 'Messages, telemetry off, through shutdown',
            observers: noObservers,
            isWithCommands: false,
            isIncludingShutdown: true,
          },
          {
            label: 'Messages, telemetry on, file sink, through the last write',
            observers: fileTelemetry,
            isWithCommands: false,
            isIncludingShutdown: true,
          },
        ],
        messageCount,
      )
      console.log(
        `[bench] overhead per Message: memory sink +${(onMemory - off).toFixed(3)}µs, file sink +${(onFile - off).toFixed(3)}µs, with a Command +${(commandsOn - commandsOff).toFixed(3)}µs, file sink through the last write +${(onFileWithShutdown - offWithShutdown).toFixed(3)}µs`,
      )
      await rm(directory, { recursive: true, force: true })
    },
  )
})
