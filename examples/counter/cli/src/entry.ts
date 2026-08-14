#!/usr/bin/env node
/**
 * Counter one-shot CLI.
 *
 * Run the built binary:
 *   node dist/entry.js show
 *   node dist/entry.js do increment
 *
 * Domain: one integer count. Messages: increment, decrement, reset.
 * Reset is invalid when count is 0. Chrome hides reset then.
 * `show` is not a Message. `do` sends a token, then auto-shows.
 * The first CLI is in-memory. Each process starts at count 0.
 *
 * Examples:
 *   counter show --targets watch,phone,tablet,laptop,tv
 *   counter show --path counter.increment
 *   counter do increment
 *   counter do decrement
 *   counter do reset
 */
import { Array, Effect, Option } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runDo, runShow } from './host.js'

const targetsFlag = Flag.string('targets').pipe(
  Flag.optional,
  Flag.withDescription(
    'Comma list of form factors: watch,phone,tablet,laptop,tv',
  ),
)

const pathFlag = Flag.string('path').pipe(
  Flag.optional,
  Flag.withDescription('Print one path, for example counter.increment'),
)

const tokensArgument = Argument.string('token').pipe(
  Argument.variadic({ min: 1 }),
  Argument.withDescription('increment, decrement, or reset'),
)

const show = Command.make(
  'show',
  { maybeTargets: targetsFlag, maybePath: pathFlag },
  ({ maybeTargets, maybePath }) =>
    runShow(
      Option.getOrUndefined(maybeTargets),
      Option.getOrUndefined(maybePath),
    ),
).pipe(
  Command.withDescription(
    'Print IDENTITY, ACESS, and device chrome. This is not a Message.',
  ),
)

const doCommand = Command.make(
  'do',
  { tokens: tokensArgument },
  ({ tokens }) => {
    if (Option.isSome(Array.get(tokens, 1))) {
      return Effect.fail(
        new Error(
          `Send one token. Got ${tokens.join(' ')}. Use increment, decrement, or reset.`,
        ),
      )
    }
    const maybeToken = Array.head(tokens)
    if (Option.isNone(maybeToken)) {
      return Effect.fail(new Error('Send increment, decrement, or reset.'))
    }
    return runDo(maybeToken.value)
  },
).pipe(
  Command.withDescription(
    'Send increment, decrement, or reset, then auto-show',
  ),
)

const counter = Command.make('counter').pipe(
  Command.withSubcommands([show, doCommand]),
)

Command.run(counter, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
