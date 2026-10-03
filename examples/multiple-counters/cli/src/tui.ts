#!/usr/bin/env node
/**
 * The Multiple Counters as a live terminal UI. The generic Foldkit TUI
 * paints the Program and routes keys: `a` adds a counter, `?` opens the
 * action menu, a counter's page counts with `+` and `-`, `d` asks before
 * deleting, `y` and `n` answer, and `q` quits. It reads the same file
 * tape as the `counters` CLI.
 */
import { Effect } from 'effect'
import { Processor } from 'foldkit'
import { runProgramTui } from 'foldkit/cli'
import {
  bindCounters,
  countersTapeOf,
  newProcessorInstance,
  startCounters,
} from 'multiple-counters-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

const bound = bindCounters(
  startCounters({
    host: Processor.Host.Tui(),
    instance: newProcessorInstance(),
    tape: countersTapeOf(process.env),
  }),
)

runProgramTui(bound, 'counters').pipe(
  Effect.ensuring(Effect.promise(bound.stop)),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
