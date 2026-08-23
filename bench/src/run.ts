import { Array, Console, Effect, FileSystem, Option, Path, Ref } from 'effect'
import { chromium } from 'playwright'

import { type RequestConfig, decodeRequestConfigJson } from './config.js'
import {
  gradeActionMenuAbstraction,
  gradeCountVisible,
  gradeDecrementLowers,
  gradeGlobalSync,
  gradeIncrementRaises,
  gradeInstantSettlesLive,
  gradeOfflineWorks,
  gradeSameScreenMirrored,
} from './counter.js'
import { BenchError } from './error.js'
import { unchangedLoc } from './loc.js'
import {
  COUNTER_ASSERT_NAMES,
  type CounterAssertName,
  type NamedAssert,
  type RungFile,
  decodeCatalogYaml,
  decodeRungYaml,
} from './maestro.js'
import { ensureProofOrigin } from './origin.js'
import { watchInstant } from './page.js'
import {
  defaultConfigPath,
  lastRunPath,
  liveCounterRungPath,
  rungCatalogPath,
} from './paths.js'
import { PROOF_HOST } from './proof.js'
import { stepTimeoutMs } from './timeout.js'
import { zeroTokens } from './tokens.js'
import { type AssertResult, type Trace, writeTrace } from './trace.js'

const ruleFor = (
  rung: RungFile,
  name: CounterAssertName,
): Option.Option<NamedAssert> =>
  Array.findFirst(rung.asserts, rule => rule.name === name)

const missingRule = (name: CounterAssertName): AssertResult => ({
  name,
  passed: false,
  detail: `Maestro rule ${name} missing from the live rung file.`,
})

const loadConfig = (
  configPath: string,
): Effect.Effect<RequestConfig, BenchError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const text = yield* fs.readFileString(configPath).pipe(
      Effect.mapError(
        error =>
          new BenchError({
            detail: `read config ${configPath}: ${error.message}`,
          }),
      ),
    )
    return yield* decodeRequestConfigJson(text).pipe(
      Effect.mapError(
        error =>
          new BenchError({
            detail: `config Schema decode failed: ${String(error)}`,
          }),
      ),
    )
  })

const loadRung = (
  rungPath: string,
): Effect.Effect<RungFile, BenchError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const text = yield* fs.readFileString(rungPath).pipe(
      Effect.mapError(
        error =>
          new BenchError({
            detail: `read rung ${rungPath}: ${error.message}`,
          }),
      ),
    )
    return yield* decodeRungYaml(text)
  })

const printSummary = (trace: Trace): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Console.log(`proofHost ${trace.proofHost}`)
    yield* Console.log(`rung ${trace.rung}`)
    yield* Console.log(`wallClockMs ${trace.wallClockMs}`)
    yield* Console.log(
      `tokens input=${trace.tokens.input} output=${trace.tokens.output} total=${trace.tokens.total}`,
    )
    yield* Console.log(
      `loc added=${trace.loc.added} removed=${trace.loc.removed} changed=${trace.loc.changed}`,
    )
    yield* Console.log(`trace ${trace.tracePath}`)
    yield* Effect.forEach(trace.asserts, result => {
      const mark = result.passed ? 'pass' : 'fail'
      return Console.log(`${mark} ${result.name} ${result.detail}`)
    })
  })

const copyLastRun = (
  trace: Trace,
): Effect.Effect<void, BenchError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs
      .makeDirectory(path.dirname(lastRunPath), { recursive: true })
      .pipe(
        Effect.mapError(
          error =>
            new BenchError({
              detail: `mkdir ${path.dirname(lastRunPath)}: ${error.message}`,
            }),
        ),
      )
    const json = yield* fs.readFileString(trace.tracePath).pipe(
      Effect.mapError(
        error =>
          new BenchError({
            detail: `read ${trace.tracePath}: ${error.message}`,
          }),
      ),
    )
    yield* fs.writeFileString(lastRunPath, json).pipe(
      Effect.mapError(
        error =>
          new BenchError({
            detail: `write ${lastRunPath}: ${error.message}`,
          }),
      ),
    )
  })

export type RunOptions = Readonly<{
  configPath: string
}>

/**
 * One command: load config, grade live Counter on the proof host, write a trace.
 */
export const runBench = (
  options?: RunOptions,
): Effect.Effect<Trace, BenchError, FileSystem.FileSystem | Path.Path> =>
  Effect.scoped(
    Effect.gen(function* () {
      const startedAt = new Date().toISOString()
      const startedMs = Date.now()
      const configPath =
        options === undefined ? defaultConfigPath : options.configPath
      const config = yield* loadConfig(configPath)
      const rung = yield* loadRung(liveCounterRungPath)
      const fs = yield* FileSystem.FileSystem
      const catalogText = yield* fs.readFileString(rungCatalogPath).pipe(
        Effect.mapError(
          error =>
            new BenchError({
              detail: `read catalog ${rungCatalogPath}: ${error.message}`,
            }),
        ),
      )
      const catalog = yield* decodeCatalogYaml(catalogText)
      const stubIds = Array.map(
        Array.filter(catalog.rungs, entry => entry.status === 'stub'),
        entry => entry.id,
      )
      yield* Console.log(
        `live rung ${rung.name}; stub rungs ${stubIds.join(', ')} (not graded)`,
      )
      yield* ensureProofOrigin()
      const browser = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => chromium.launch({ headless: true }),
          catch: cause =>
            new BenchError({
              detail: `chromium.launch failed: ${String(cause)}`,
            }),
        }),
        browserHandle => Effect.promise(() => browserHandle.close()),
      )
      const context = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => browser.newContext(),
          catch: cause =>
            new BenchError({
              detail: `newContext failed: ${String(cause)}`,
            }),
        }),
        contextHandle => Effect.promise(() => contextHandle.close()),
      )
      const page = yield* Effect.tryPromise({
        try: () => context.newPage(),
        catch: cause =>
          new BenchError({
            detail: `newPage failed: ${String(cause)}`,
          }),
      })
      page.setDefaultTimeout(stepTimeoutMs(config.timeout))
      const watch = watchInstant(page)
      yield* Effect.tryPromise({
        try: () => page.goto(PROOF_HOST, { waitUntil: 'domcontentloaded' }),
        catch: cause =>
          new BenchError({
            detail: `goto ${PROOF_HOST} failed: ${String(cause)}`,
          }),
      })
      const results = yield* Ref.make<ReadonlyArray<AssertResult>>([])
      const gradeNamed = (
        name: CounterAssertName,
      ): Effect.Effect<AssertResult, BenchError> => {
        const maybeRule = ruleFor(rung, name)
        if (Option.isNone(maybeRule)) {
          return Effect.succeed(missingRule(name))
        }
        const rule = maybeRule.value
        if (name === 'instantSettlesLive') {
          return gradeInstantSettlesLive(page, watch, rule)
        }
        if (name === 'countVisible') {
          return gradeCountVisible(page, rule)
        }
        if (name === 'incrementRaises') {
          return gradeIncrementRaises(page, rule)
        }
        if (name === 'decrementLowers') {
          return gradeDecrementLowers(page, rule)
        }
        if (name === 'actionMenuAbstraction') {
          return gradeActionMenuAbstraction(page, rule)
        }
        if (name === 'sameScreenMirrored') {
          return gradeSameScreenMirrored(browser, rule)
        }
        if (name === 'globalSync') {
          return gradeGlobalSync(browser, page, rule)
        }
        return gradeOfflineWorks(context, page, rule)
      }
      yield* Effect.forEach(
        COUNTER_ASSERT_NAMES,
        name =>
          gradeNamed(name).pipe(
            Effect.catchTag('BenchError', error =>
              Effect.succeed({
                name,
                passed: false,
                detail: error.detail,
              }),
            ),
            Effect.flatMap(result =>
              Ref.update(results, current => Array.append(current, result)),
            ),
          ),
        { concurrency: 1 },
      )
      const asserts = yield* Ref.get(results)
      const finishedAt = new Date().toISOString()
      const trace = yield* writeTrace({
        startedAt,
        finishedAt,
        wallClockMs: Date.now() - startedMs,
        tokens: zeroTokens,
        loc: unchangedLoc,
        config,
        rung: rung.name,
        proofHost: PROOF_HOST,
        asserts,
        modelCall: false,
      })
      yield* copyLastRun(trace)
      yield* printSummary(trace)
      if (Array.some(asserts, result => !result.passed)) {
        yield* Effect.sync(() => {
          process.exitCode = 1
        })
      }
      return trace
    }),
  )
