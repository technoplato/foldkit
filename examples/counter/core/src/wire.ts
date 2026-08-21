import { Match as M, Schema as S, SchemaTransformation } from 'effect'
import { Program } from 'foldkit'

import { type AppMessage, type AppModel } from './app.js'
import { Decrement, Increment, Reset } from './message.js'
import { Model } from './model.js'

const AppSnapshot = S.Struct({
  product: Model,
  actionMenu: Program.ActionMenuModel,
})

const AppMessageSchema = S.Union([
  Increment,
  Decrement,
  Reset,
  Program.ActionMenuCommandTriggered,
  Program.ActionMenuDismissed,
  Program.ActionMenuFocusMoved,
  Program.ActionCommandMenuSelectionMade,
  Program.ActionMenuQueryChanged,
])

/**
 * Instant entity id for the one count snapshot row.
 * Instant requires a UUID. This constant is that one row.
 */
export const COUNT_UUID = 'c0a7c001-0000-4000-8000-000000000001'

/** Instant count row. `asOf` and `at` are filled at write time. */
export const CountRow = S.Struct({
  id: S.Literal(COUNT_UUID),
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})
/** Instant count row. `asOf` and `at` are filled at write time. */
export type CountRow = typeof CountRow.Type

/**
 * Door from an Instant count row to the App Model.
 * Count lives in the snapshot. Menu Open is a Message, so boot is Closed.
 */
export const CountProjection = CountRow.pipe(
  S.decodeTo(
    AppSnapshot,
    SchemaTransformation.transform({
      decode: (row): AppModel => ({
        product: Model.make({ count: row.value }),
        actionMenu: Program.Closed(),
      }),
      encode: (model: AppModel) => ({
        id: COUNT_UUID,
        value: model.product.count,
        asOf: '',
        at: 0,
      }),
    }),
  ),
)

/** Instant Message row. `id`, `from`, and `createdAtMs` are filled at write time. */
export const MessageRow = S.Struct({
  id: S.String,
  tag: S.String,
  from: S.String,
  createdAtMs: S.Number,
})
/** Instant Message row. `id`, `from`, and `createdAtMs` are filled at write time. */
export type MessageRow = typeof MessageRow.Type

const focusMovedPrefix = 'ActionMenuFocusMoved:'
const selectionPrefix = 'ActionCommandMenuSelectionMade:'
const queryPrefix = 'ActionMenuQueryChanged:'

const tagFromMessage = (message: AppMessage): string =>
  M.value(message).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Increment: () => 'Increment',
      Decrement: () => 'Decrement',
      Reset: () => 'Reset',
      ActionMenuCommandTriggered: () => 'ActionMenuCommandTriggered',
      ActionMenuDismissed: () => 'ActionMenuDismissed',
      ActionMenuFocusMoved: ({ direction }) =>
        `${focusMovedPrefix}${direction}`,
      ActionCommandMenuSelectionMade: ({ token }) =>
        `${selectionPrefix}${token}`,
      ActionMenuQueryChanged: ({ query }) => `${queryPrefix}${query}`,
    }),
  )

const messageFromTag = (tag: string): AppMessage => {
  if (tag === 'Increment') {
    return Increment()
  }
  if (tag === 'Decrement') {
    return Decrement()
  }
  if (tag === 'Reset') {
    return Reset()
  }
  if (tag === 'ActionMenuCommandTriggered') {
    return Program.ActionMenuCommandTriggered()
  }
  if (tag === 'ActionMenuDismissed') {
    return Program.ActionMenuDismissed()
  }
  if (tag.startsWith(focusMovedPrefix)) {
    const direction =
      tag.slice(focusMovedPrefix.length) === 'Up' ? 'Up' : 'Down'
    return Program.ActionMenuFocusMoved({ direction })
  }
  if (tag.startsWith(selectionPrefix)) {
    return Program.ActionCommandMenuSelectionMade({
      token: tag.slice(selectionPrefix.length),
    })
  }
  if (tag.startsWith(queryPrefix)) {
    return Program.ActionMenuQueryChanged({
      query: tag.slice(queryPrefix.length),
    })
  }
  return Increment()
}

/** Door from an Instant Message row to an App Message. */
export const MessageWire = MessageRow.pipe(
  S.decodeTo(
    AppMessageSchema,
    SchemaTransformation.transform({
      decode: (row): AppMessage => messageFromTag(row.tag),
      encode: (message: AppMessage) => ({
        id: '',
        tag: tagFromMessage(message),
        from: '',
        createdAtMs: 0,
      }),
    }),
  ),
)
