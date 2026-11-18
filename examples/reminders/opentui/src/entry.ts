#!/usr/bin/env bun
/**
 * Reminders on OpenTUI.
 *
 *   bun src/entry.ts
 *
 * It signs in as your Cloudflare Access login through the web Reminders'
 * mint. Click a row, a reminder's box, or a button, or press its key: `x`
 * ticks the highlighted reminder, `f` flags it, `d` and `p` choose its due
 * date and priority, `c` copies a link to the page, `?` opens the action
 * menu, and Escape goes back one screen. Run it through
 * `scripts/with-reminders-access`.
 */
import { Option } from 'effect'
import { Processor } from 'foldkit'
import {
  bindReminders,
  newProcessorInstance,
  noConnectionSentence,
  notSignedInSentence,
  remindersConnectionFromEnv,
  signInToReminders,
  startReminders,
} from 'reminders-core-example'

import { runOpenTui } from '@foldkit/opentui/interaction'
import { createCliRenderer } from '@opentui/core'

const maybeConnection = remindersConnectionFromEnv()
if (Option.isNone(maybeConnection)) {
  process.stderr.write(`${noConnectionSentence}\n`)
  process.exit(1)
}
const maybeSignedIn = await signInToReminders(maybeConnection.value)
if (Option.isNone(maybeSignedIn)) {
  process.stderr.write(`${notSignedInSentence}\n`)
  process.exit(1)
}

const bound = bindReminders(
  startReminders(maybeSignedIn.value, {
    host: Processor.Host.OpenTui(),
    instance: newProcessorInstance(),
  }),
)
const renderer = await createCliRenderer({ exitOnCtrlC: true })

await runOpenTui(bound, renderer)

await bound.stop()
renderer.destroy()
process.exit(0)
