#!/usr/bin/env node
/// <reference types="node" />
/**
 * The `foldkit` command. Today it has one subcommand:
 *
 *   foldkit telemetry books-react --since 30m
 *
 * which summarizes `~/Library/Logs/foldkit/telemetry/books-react.ndjson`
 * for the last 30 minutes. Run `foldkit telemetry` for its usage and the
 * telemetry files on this machine.
 */
import { Array, Effect } from 'effect'

import { runTelemetryCommand } from '../telemetry/node.js'

const usage = Array.join(
  [
    'Usage: foldkit <command>',
    '',
    '  telemetry    summarize Foldkit telemetry files',
  ],
  '\n',
)

const [command, ...commandArguments] = process.argv.slice(2)

if (command === 'telemetry') {
  const result = await Effect.runPromise(runTelemetryCommand(commandArguments))
  process.stdout.write(`${result.stdout}\n`)
  process.exitCode = result.exitCode
} else {
  process.stderr.write(`${usage}\n`)
  process.exitCode = 2
}
