#!/usr/bin/env node
import { Effect, Option } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'
import { pathToNavigation } from 'issues-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runIssues } from './host.js'

const verboseFlag = Flag.boolean('verbose').pipe(
  Flag.withDescription('Print Messages valid in the final state'),
)
const uriFlag = Flag.string('uri').pipe(
  Flag.withDescription('Portable Issue Tracker route to open'),
  Flag.optional,
)
const actionsArgument = Argument.string('action').pipe(
  Argument.variadic({ min: 1 }),
)

const show = Command.make(
  'show',
  { isVerbose: verboseFlag, uri: uriFlag },
  ({ isVerbose, uri }) =>
    runIssues([], isVerbose, Option.map(uri, pathToNavigation)),
)
const run = Command.make(
  'run',
  { actions: actionsArgument, isVerbose: verboseFlag, uri: uriFlag },
  ({ actions, isVerbose, uri }) =>
    runIssues(actions, isVerbose, Option.map(uri, pathToNavigation)),
)
const issues = Command.make('foldkit-issues').pipe(
  Command.withSubcommands([show, run]),
)

Command.run(issues, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
