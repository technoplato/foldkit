#!/usr/bin/env node
import {
  Array as Array_,
  Console,
  Effect,
  Match as M,
  Option,
  pipe,
} from 'effect'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import {
  runReplayAction,
  runReplayLink,
  runReplayUri,
  runSavedAutoplayReplayLink,
  runSavedReplayLink,
  runStateLink,
} from './host.js'

const usage = `Usage:
  foldkit-replay run <state-or-replay-uri>
  foldkit-replay action <action-id> <state-or-replay-uri>
  foldkit-replay state-link <state-or-replay-uri>
  foldkit-replay replay-link <state-or-replay-uri>
  foldkit-replay save-link <state-or-replay-uri>
  foldkit-replay save-play-link <state-or-replay-uri>`

const arguments_ = pipe(
  Array_.drop(process.argv, 2),
  Array_.dropWhile(argument => argument === '--'),
)
const maybeOperation = Array_.head(arguments_)
const maybeUri = Array_.get(arguments_, 1)
const maybeActionUri = Array_.get(arguments_, 2)

const program = Option.all({
  operation: maybeOperation,
  uri: maybeUri,
}).pipe(
  Option.match({
    onNone: () => Console.log(usage),
    onSome: ({ operation, uri }) =>
      M.value(operation).pipe(
        M.when('run', () => runReplayUri(uri)),
        M.when('action', () =>
          Option.match(maybeActionUri, {
            onNone: () => Console.log(usage),
            onSome: actionUri => runReplayAction(uri, actionUri),
          }),
        ),
        M.when('state-link', () => runStateLink(uri)),
        M.when('replay-link', () => runReplayLink(uri)),
        M.when('save-link', () => runSavedReplayLink(uri)),
        M.when('save-play-link', () => runSavedAutoplayReplayLink(uri)),
        M.orElse(() => Console.log(usage)),
      ),
  }),
)

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
