import { Effect, FileSystem, Path, Schema as S } from 'effect'

import { RequestConfig } from './config.js'
import { BenchError } from './error.js'
import { Loc } from './loc.js'
import { tracesDirectory } from './paths.js'
import { Tokens } from './tokens.js'

/**
 * One named assert outcome.
 */
export const AssertResult = S.Struct({
  name: S.String,
  passed: S.Boolean,
  detail: S.String,
})
/** One named assert outcome. */
export type AssertResult = typeof AssertResult.Type

/**
 * One round trace. Tokens may be zero when no model ran.
 */
export const Trace = S.Struct({
  startedAt: S.String,
  finishedAt: S.String,
  wallClockMs: S.Number,
  tokens: Tokens,
  loc: Loc,
  config: RequestConfig,
  rung: S.String,
  proofHost: S.String,
  asserts: S.Array(AssertResult),
  modelCall: S.Boolean,
  tracePath: S.String,
})
/** One round trace. */
export type Trace = typeof Trace.Type

/** Writes one trace JSON under bench/traces/. */
export const writeTrace = (
  trace: Omit<Trace, 'tracePath'>,
): Effect.Effect<Trace, BenchError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(tracesDirectory, { recursive: true }).pipe(
      Effect.mapError(
        error =>
          new BenchError({
            detail: `mkdir ${tracesDirectory}: ${error.message}`,
          }),
      ),
    )
    const stamp = trace.startedAt.replaceAll(':', '-')
    const fileName = `${stamp}-rung-${trace.rung}.json`
    const tracePath = path.join(tracesDirectory, fileName)
    const withPath = { ...trace, tracePath }
    const encoded = S.encodeUnknownSync(Trace)(withPath)
    const json = `${JSON.stringify(encoded, null, 2)}\n`
    yield* fs.writeFileString(tracePath, json).pipe(
      Effect.mapError(
        error =>
          new BenchError({
            detail: `write ${tracePath}: ${error.message}`,
          }),
      ),
    )
    return withPath
  })
