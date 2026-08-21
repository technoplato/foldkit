#!/usr/bin/env node
import { Effect, Option } from 'effect'
import { Command, Flag } from 'effect/unstable/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { runCliOperation } from './host.js'

const participantFlag = Flag.string('participant').pipe(
  Flag.optional,
  Flag.withDescription('Participant id to admit'),
)

const list = Command.make('list', {}, () =>
  runCliOperation('List', Option.none()),
).pipe(Command.withDescription('Print today meetings and waiting counts'))

const waiting = Command.make('waiting', {}, () =>
  runCliOperation('Waiting', Option.none()),
).pipe(Command.withDescription('Print people currently in waiting rooms'))

const admit = Command.make(
  'admit',
  { maybeParticipantId: participantFlag },
  ({ maybeParticipantId }) => runCliOperation('Admit', maybeParticipantId),
).pipe(Command.withDescription('Admit one waiting participant'))

const advocacy = Command.make('foldkit-advocacy').pipe(
  Command.withSubcommands([list, waiting, admit]),
)

Command.run(advocacy, { version: '0.0.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
