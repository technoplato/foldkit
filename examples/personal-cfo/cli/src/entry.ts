#!/usr/bin/env node
import { Console, Effect } from 'effect'

import { CfoCliError, executeParsed } from './host.js'
import { cfoUsage, parseCfoArgv } from './parseArgv.js'
import { runProve } from './prove.js'

const parsed = parseCfoArgv(process.argv.slice(2))

const program =
  parsed._tag === 'Help'
    ? Console.log(cfoUsage)
    : parsed._tag === 'Prove'
      ? runProve().pipe(Effect.flatMap(text => Console.log(text)))
      : executeParsed(parsed).pipe(Effect.flatMap(text => Console.log(text)))

const main = program.pipe(
  Effect.catchTag('CfoCliError', (error: CfoCliError) =>
    Effect.sync(() => {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = error.exitCode
    }),
  ),
)

Effect.runPromise(main).catch((cause: unknown) => {
  const message = cause instanceof Error ? cause.message : 'cfo failed.'
  process.stderr.write(`${message}\n`)
  process.exitCode =
    process.exitCode === 0 || process.exitCode === undefined
      ? 1
      : process.exitCode
})
