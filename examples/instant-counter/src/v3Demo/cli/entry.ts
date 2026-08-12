#!/usr/bin/env node
import { Effect } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import {
  runMultipleCountersV3CliActions,
  runMultipleCountersV3CliFollow,
  runMultipleCountersV3CliLogin,
  runMultipleCountersV3CliLogout,
  runMultipleCountersV3CliMode,
  runMultipleCountersV3CliShow,
} from './host.js'

const subjectArgument = Argument.string('subject').pipe(
  Argument.withDescription('Debug Instant subject: alice or bob'),
)

const actionsArgument = Argument.string('action').pipe(
  Argument.variadic({ min: 1 }),
)

const modeArgument = Argument.string('mode').pipe(
  Argument.variadic({ min: 1 }),
  Argument.withDescription(
    'independent, mirror, or follow <leader> <follower> observe|remote',
  ),
)

const leaderFlag = Flag.string('leader').pipe(
  Flag.withDescription('Leader Processor id to follow'),
)

const followerFlag = Flag.string('follower').pipe(
  Flag.withDescription('Follower Processor id. Defaults to this CLI Processor'),
  Flag.optional,
)

const controlFlag = Flag.string('control').pipe(
  Flag.withDescription('observe or remote'),
)

const login = Command.make('login', { subject: subjectArgument }, ({ subject }) =>
  runMultipleCountersV3CliLogin(subject),
).pipe(Command.withDescription('Sign in as Alice or Bob through debug login'))

const logout = Command.make('logout', {}, () =>
  runMultipleCountersV3CliLogout(),
).pipe(Command.withDescription('Sign out this CLI Instant Client'))

const show = Command.make('show', {}, () =>
  runMultipleCountersV3CliShow(),
).pipe(
  Command.withDescription(
    'Print session chrome and the current Multiple Counters screen',
  ),
)

const run = Command.make(
  'run',
  { actions: actionsArgument },
  ({ actions }) => runMultipleCountersV3CliActions(actions),
).pipe(
  Command.withDescription(
    'Run valid Program actions on the authenticated Processor',
  ),
)

const mode = Command.make('mode', { mode: modeArgument }, ({ mode }) =>
  runMultipleCountersV3CliMode(mode),
).pipe(
  Command.withDescription(
    'Request Independent, Mirror, or Follow from the session authority',
  ),
)

const follow = Command.make(
  'follow',
  {
    control: controlFlag,
    follower: followerFlag,
    leader: leaderFlag,
  },
  ({ control, follower, leader }) =>
    runMultipleCountersV3CliFollow(leader, follower, control),
).pipe(
  Command.withDescription(
    'Follow another Processor with observe or remote control',
  ),
)

const counters = Command.make('foldkit-instant-counters').pipe(
  Command.withSubcommands([login, logout, show, run, mode, follow]),
)

Command.run(counters, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
