import { Program } from 'foldkit'

import { App } from './app.js'
import { Model } from './model.js'
import { CountProjection, MessageWire } from './wire.js'

/**
 * App Program wrapped for Instant I/O.
 * Instant has no Model. Runtime.start uses the two Schemas.
 * Menu Open syncs as an Instant Message.
 */
export const SyncedCounter = Program.compose.sync({
  of: App,
  snapshot: CountProjection,
  message: MessageWire,
})

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

/**
 * Count on Ready. After compose.actionMenu it lives on `product`.
 * Starting and Failed have no count. Never read `snapshot.count`.
 */
export const countOfReady = (model: unknown): number | undefined => {
  if (!isRecord(model)) {
    return undefined
  }
  if (typeof model['count'] === 'number') {
    return model['count']
  }
  return countOfReady(model['product'])
}

/** Ready App at a count, menu Closed. Tests and host chrome use this. */
export const readyCounter = (
  count: number,
  actionMenu: Program.ActionMenuModelValue = Program.Closed(),
) =>
  SyncedCounter.Ready({
    product: Model.make({ count }),
    actionMenu,
  })
