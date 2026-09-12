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

const sha1Hex = (value: string): string => {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0')
  return `${hex}${hex}${hex}`
}

/** Instant count row for one owned subject. Deterministic UUID. */
export const ownedCountId = (subject: string): string =>
  `c0a7c001-0000-4000-8000-${sha1Hex(subject).slice(0, 12)}`

/** Instant count row for this Processor. Public uses {@link COUNT_UUID}. */
export const activeCountId = (): string => {
  const explicit = process.env['COUNTER_COUNT_ID']
  if (explicit !== undefined && explicit !== '') {
    return explicit
  }
  const audience = process.env['COUNTER_AUDIENCE']
  const subject = process.env['COUNTER_SUBJECT']
  if (audience === 'mine' && subject !== undefined && subject !== '') {
    return ownedCountId(subject)
  }
  return COUNT_UUID
}

/** Instant count row. `asOf` and `at` are filled at write time. */
export const CountRow = S.Struct({
  id: S.String,
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
        id: activeCountId(),
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
