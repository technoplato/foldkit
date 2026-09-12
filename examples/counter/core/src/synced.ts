import { Option, Schema as S } from 'effect'
import { Program } from 'foldkit'
import { type Device } from 'foldkit/renderers/devices'

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

/** Occupancy on a Ready Model. Starting and Failed have none. */
export type ReadyNavigation = Readonly<{
  readonly device?: Device
  readonly path?: string
}>

/**
 * Product Model on Ready. After compose.actionMenu it lives on `product`.
 * Starting and Failed have none. Use this when occupancy must survive a
 * host read. Example: phone chrome after `show --device phone`.
 */
export const modelOfReady = (model: unknown): Model | undefined => {
  if (!isRecord(model)) {
    return undefined
  }
  const product = isRecord(model['product']) ? model['product'] : model
  const maybeModel = S.decodeUnknownOption(Model)(product)
  if (Option.isNone(maybeModel)) {
    return undefined
  }
  return maybeModel.value
}

/** Device and path on Ready. After compose.actionMenu they live on `product`. */
export const navigationOfReady = (model: unknown): ReadyNavigation => {
  const product = modelOfReady(model)
  if (product === undefined) {
    return {}
  }
  const device = Option.isSome(product.maybeDevice)
    ? product.maybeDevice.value
    : undefined
  const path = Option.isSome(product.maybePath)
    ? product.maybePath.value
    : undefined
  return {
    ...(device === undefined ? {} : { device }),
    ...(path === undefined ? {} : { path }),
  }
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
