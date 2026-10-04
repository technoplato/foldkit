#!/usr/bin/env node
/**
 * Reminders as a live terminal UI. The generic Foldkit TUI paints the
 * Program and routes keys: the arrows move between rows and a reminder's
 * box, Enter opens a row or ticks the box, `x` ticks the highlighted
 * reminder, `f` flags it, `d` and `p` choose its due date and priority, `c`
 * copies a link to the page, `?` opens the action menu, and `q` quits. It
 * signs in as your Cloudflare Access login; run it through
 * `scripts/with-reminders-access`.
 */
import { Effect } from 'effect'
import { Processor } from 'foldkit'
import { runProgramTui } from 'foldkit/cli'
import {
  bindReminders,
  newProcessorInstance,
  startReminders,
} from 'reminders-core-example'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { signedInOrExit } from './signIn.js'

const signedIn = await signedInOrExit()

const bound = bindReminders(
  startReminders(signedIn, {
    host: Processor.Host.Tui(),
    instance: newProcessorInstance(),
  }),
)

runProgramTui(bound, 'reminders').pipe(
  Effect.ensuring(Effect.promise(bound.stop)),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
