import { Program } from 'foldkit'

import { App } from './app.js'
import { Model, demoModel, uriOf } from './model.js'
import { type ReplicateStep } from './replicate.js'
import { MessageWire, TapeProjection } from './wire.js'

/**
 * App Program wrapped for Instant I/O.
 * Instant has no Model. Runtime.start uses the two Schemas.
 * Menu Open syncs as an Instant Message.
 */
export const SyncedPuzzle = Program.compose.sync({
  of: App,
  snapshot: TapeProjection,
  message: MessageWire,
})

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

/**
 * Product Model on Ready. After compose.actionMenu it lives on `product`.
 * Starting and Failed have none. Never read `snapshot.value`.
 */
export const productOfReady = (model: unknown): Model | undefined => {
  if (!isRecord(model)) {
    return undefined
  }
  if (
    (isRecord(model['tape']) || globalThis.Array.isArray(model['tape'])) &&
    isRecord(model['prompt'])
  ) {
    return model as Model
  }
  return productOfReady(model['product'])
}

/**
 * Printed tape on Ready. After compose.actionMenu it lives on `product`.
 * Starting and Failed have no tape. Never read `snapshot.value`.
 */
export const tapeOfReady = (model: unknown): string | undefined => {
  const product = productOfReady(model)
  if (product === undefined) {
    return undefined
  }
  return uriOf(product)
}

/** Ready tape length. Starting and Failed have none. */
export const tapeLengthOfReady = (model: unknown): number | undefined => {
  const product = productOfReady(model)
  if (product === undefined) {
    return undefined
  }
  return product.tape.length
}

/** Ready App at a tape, menu Closed. Tests and host chrome use this. */
export const readyPuzzle = (
  product: Model = demoModel(),
  actionMenu: Program.ActionMenuModelValue = Program.Closed(),
) =>
  SyncedPuzzle.Ready({
    product,
    actionMenu,
  })

/** ReplicateStep on Ready. Starting and Failed have none. */
export const replicateOfReady = (model: unknown): ReplicateStep | undefined => {
  if (!isRecord(model)) {
    return undefined
  }
  const prompt = model['prompt']
  if (isRecord(prompt) && prompt['_tag'] === 'ReplicateStep') {
    return prompt as ReplicateStep
  }
  return replicateOfReady(model['product'])
}
