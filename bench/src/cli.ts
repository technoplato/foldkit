#!/usr/bin/env node
import { Effect, Option } from 'effect'
import { Command, Flag } from 'effect/unstable/cli'
import * as NodePath from 'node:path'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { defaultConfigPath } from './paths.js'
import { runBench } from './run.js'

const configFlag = Flag.string('config').pipe(
  Flag.withAlias('c'),
  Flag.withDescription(
    'JSON request config (Vercel AI SDK shape). Default: configs/default.json',
  ),
  Flag.optional,
)

const resolveConfigPath = (maybePath: Option.Option<string>): string =>
  Option.match(maybePath, {
    onNone: () => defaultConfigPath,
    onSome: value =>
      NodePath.isAbsolute(value)
        ? value
        : NodePath.resolve(process.cwd(), value),
  })

const bench = Command.make(
  'foldkit-bench',
  { config: configFlag },
  ({ config }) => runBench({ configPath: resolveConfigPath(config) }),
).pipe(
  Command.withDescription(
    'Grade the live Counter proof at https://counter.knophy.com',
  ),
)

Command.run(bench, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
