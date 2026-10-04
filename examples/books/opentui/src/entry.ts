#!/usr/bin/env bun
/**
 * Books on OpenTUI.
 *
 *   bun src/entry.ts
 *
 * It signs in as your Cloudflare Access login through the reader's mint,
 * plays through ffplay, and shows the words as they play. Click a row or
 * a button, or press its key: `p` plays and pauses, `[` and `]` skip, `?`
 * opens the action menu, and Escape goes back one screen. Run it through
 * `scripts/with-books-access`. It is a player of its own in this
 * process, so it stops when it closes; `books tui` shows the player that
 * keeps playing in the background instead.
 */
import {
  bindBooks,
  booksConnectionFromEnv,
  newProcessorInstance,
  noConnectionSentence,
  notSignedInSentence,
  signInToBooks,
  startBooks,
} from 'books-core-example'
import { Option } from 'effect'
import { Processor } from 'foldkit'

import { runOpenTui } from '@foldkit/opentui/interaction'
import { createCliRenderer } from '@opentui/core'

const maybeConnection = booksConnectionFromEnv()
if (Option.isNone(maybeConnection)) {
  process.stderr.write(`${noConnectionSentence}\n`)
  process.exit(1)
}
const maybeSignedIn = await signInToBooks(maybeConnection.value)
if (Option.isNone(maybeSignedIn)) {
  process.stderr.write(`${notSignedInSentence}\n`)
  process.exit(1)
}

const bound = bindBooks(
  startBooks(maybeSignedIn.value, {
    host: Processor.Host.OpenTui(),
    instance: newProcessorInstance(),
  }),
)
const renderer = await createCliRenderer({ exitOnCtrlC: true })

await runOpenTui(bound, renderer)

await bound.stop()
renderer.destroy()
process.exit(0)
