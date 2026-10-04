#!/usr/bin/env node
/**
 * Books as a live terminal UI. The generic Foldkit TUI paints the Program
 * and routes keys: the arrows move between rows, Enter opens one, `p`
 * plays and pauses, `[` and `]` skip, `c` shows the contents, `b` marks a
 * bookmark, `?` opens the action menu, and `q` quits. Audio plays through
 * ffplay, and the words follow along. It signs in as your Cloudflare
 * Access login; run it through `scripts/with-books-access`.
 */
import { bindBooks, newProcessorInstance, startBooks } from 'books-core-example'
import { Effect } from 'effect'
import { Processor } from 'foldkit'
import { runProgramTui } from 'foldkit/cli'

import { NodeRuntime, NodeServices } from '@effect/platform-node'

import { signedInOrExit } from './signIn.js'

const signedIn = await signedInOrExit()

const bound = bindBooks(
  startBooks(signedIn, {
    host: Processor.Host.Tui(),
    instance: newProcessorInstance(),
  }),
)

runProgramTui(bound, 'books').pipe(
  Effect.ensuring(Effect.promise(bound.stop)),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
)
