#!/usr/bin/env node
/**
 * Counter one-shot CLI.
 *
 * Run the built binary:
 *   node dist/entry.js show
 *   node dist/entry.js show --device phone
 *   node dist/entry.js do increment
 *   node dist/entry.js replay --tape tape.json
 *
 * Domain: one integer count. Messages: increment, decrement, reset.
 * Reset is invalid when count is 0. Chrome hides reset then.
 * `show` is not a Message. `do` sends a token, then auto-shows.
 * `replay` steps a Program tape. Default `show` / `do` is in-memory.
 * COUNTER_TAPE=instant reads the count snapshot, then writes one
 * Message. CLI and React are two Processors of one Instant app.
 *
 * Examples:
 *   counter show
 *   counter show --device phone
 *   counter show --path counter.increment
 *   counter do increment
 *   counter replay --tape tape.json
 */
import { Array, Effect, Option } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runDo, runReplay, runShow } from './host.js'

const deviceFlag = Flag.string('device').pipe(
  Flag.optional,
  Flag.withDescription('Device chrome: watch, phone, tablet, computer, tv'),
)

const pathFlag = Flag.string('path').pipe(
  Flag.optional,
  Flag.withDescription('Print one path, for example counter.increment'),
)

const tapeFlag = Flag.string('tape').pipe(
  Flag.withDescription('Path to a Program replay tape'),
)

const tokensArgument = Argument.string('token').pipe(
  Argument.variadic({ min: 1 }),
  Argument.withDescription('increment, decrement, or reset'),
)

const show = Command.make(
  'show',
  { maybeDevice: deviceFlag, maybePath: pathFlag },
  ({ maybeDevice, maybePath }) =>
    runShow(
      Option.getOrUndefined(maybeDevice),
      Option.getOrUndefined(maybePath),
    ),
).pipe(
  Command.withDescription(
    'Print IDENTITY and ACESS. Optional --device wraps the product tree.',
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

const replay = Command.make('replay', { tape: tapeFlag }, ({ tape }) =>
  runReplay(tape),
).pipe(
  Command.withDescription(
    'Step a Program tape. Print Model, valid, and screen after each frame.',
  ),
)

const counter = Command.make('counter').pipe(
  Command.withSubcommands([show, doCommand, replay]),
)

Command.run(counter, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
