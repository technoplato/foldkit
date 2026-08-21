#!/usr/bin/env node
/**
 * One-shot Instant seed/upsert for knophyReminders.
 * Run from ideas-core so @instantdb/admin resolves.
 * Never prints tokens.
 */
import { readFileSync } from 'node:fs'

import { init } from '@instantdb/admin'

const DATA =
  process.env.KNOPHY_REMINDERS_JSON ??
  `${process.env.HOME}/.local/share/knophy-reminders/reminders.json`
const META_ID = '00000000-0000-4000-8000-000000000001'

const appId = process.env.INSTANT_APP_ID
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN

if (!appId) {
  console.log('instant-seed: skip (no INSTANT_APP_ID)')
  process.exit(0)
}
if (!adminToken) {
  console.log('instant-seed: skip (no admin token; expected for LaunchAgent)')
  process.exit(0)
}

const doc = JSON.parse(readFileSync(DATA, 'utf8'))
const db = init({ appId, adminToken })
const ops = []
for (const reminder of doc.reminders ?? []) {
  ops.push(
    db.tx.knophyReminders[reminder.id].update({
      body: reminder.body,
      status: reminder.status,
      triggersJson: JSON.stringify(reminder.triggers ?? []),
      createdAt: reminder.createdAt ?? '',
    }),
  )
}
if (doc.lastWakeAt) {
  ops.push(
    db.tx.knophyRemindersMeta[META_ID].update({
      lastWakeAt: doc.lastWakeAt,
    }),
  )
}

if (ops.length === 0) {
  console.log('instant-seed: nothing to write')
  process.exit(0)
}

try {
  await db.transact(ops)
  console.log(
    `instant-seed: ok knophyReminders count=${String((doc.reminders ?? []).length)}`,
  )
} catch (error) {
  const name = error instanceof Error ? error.name : 'Error'
  console.log(`instant-seed: failed (${name}); JSON remains source of truth`)
  process.exit(0)
}
