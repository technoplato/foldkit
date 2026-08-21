#!/usr/bin/env node
import { Effect, Option } from 'effect'
import { Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCliOperation } from './host.js'

const slugFlag = Flag.string('slug').pipe(
  Flag.optional,
  Flag.withDescription('Job slug or video id to show'),
)

const list = Command.make('list', {}, () =>
  runCliOperation('List', Option.none()),
).pipe(Command.withDescription('Print every Knophy transcribe job'))

const show = Command.make('show', { maybeSlug: slugFlag }, ({ maybeSlug }) =>
  runCliOperation('Show', maybeSlug),
).pipe(Command.withDescription('Print one job by slug or video id'))

const transcribe = Command.make('foldkit-transcribe').pipe(
  Command.withSubcommands([list, show]),
)

Command.run(transcribe, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
