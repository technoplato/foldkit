import { Match as M, Option, Schema as S, SchemaTransformation } from 'effect'
import { Program } from 'foldkit'
import { Device } from 'foldkit/renderers/devices'

import { type AppMessage, type AppModel } from './app.js'
import { Decrement, Increment, OpenedNavigation, Reset, SharedNamedCounter } from './message.js'
import { Model } from './model.js'
import { COUNT_UUID, namedCountId, ownedCountId, resolveCountIdFromRows } from './share.js'

export { COUNT_UUID, namedCountId, ownedCountId, resolveCountIdFromRows }

const AppSnapshot = S.Struct({
  product: S.Struct({
    count: S.Number,
    maybeDevice: S.Option(Device),
    maybePath: S.Option(S.String),
    maybeShareName: S.Option(S.String),
    maybeOwner: S.Option(S.String),
    maybeGranted: S.Option(S.String),
  }),
  actionMenu: Program.ActionMenuModel,
})

const AppMessageSchema = S.Union([
  Increment,
  Decrement,
  Reset,
  OpenedNavigation,
  SharedNamedCounter,
  Program.ActionMenuCommandTriggered,
  Program.ActionMenuDismissed,
  Program.ActionMenuFocusMoved,
  Program.ActionCommandMenuSelectionMade,
  Program.ActionMenuQueryChanged,
])

/**
 * Instant count row for this Processor. Public uses {@link COUNT_UUID}.
 * Named shares resolve through {@link resolveCountIdFromRows}.
 */
export const activeCountId = (): string => resolveCountIdFromRows([])

/**
 * Instant count row. `asOf` and `at` are filled at write time.
 * `device` and `path` are occupancy. `name`, `owner`, and `granted`
 * are named-share ACL. Old rows without them decode as none.
 * Example: kitchen is `/counter/kitchen` with owner alice and granted bob.
 */
export const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
  device: S.optionalKey(Device),
  path: S.optionalKey(S.String),
  name: S.optionalKey(S.String),
  owner: S.optionalKey(S.String),
  granted: S.optionalKey(S.String),
})
/** Instant count row. `asOf` and `at` are filled at write time. */
export type CountRow = typeof CountRow.Type

/**
 * Door from an Instant count row to the App Model.
 * Count and navigation live in the snapshot. Menu Open is a Message,
 * so boot is Closed.
 */
export const CountProjection = CountRow.pipe(
  S.decodeTo(
    AppSnapshot,
    SchemaTransformation.transform({
      decode: (row): AppModel => ({
        product: Model.make({
          count: row.value,
          maybeDevice: Option.fromNullishOr(row.device),
          maybePath: Option.fromNullishOr(row.path),
          maybeShareName: Option.fromNullishOr(row.name),
          maybeOwner: Option.fromNullishOr(row.owner),
          maybeGranted: Option.fromNullishOr(row.granted),
        }),
        actionMenu: Program.Closed(),
      }),
      encode: (model: AppModel) => ({
        id: activeCountId(),
        value: model.product.count,
        asOf: '',
        at: 0,
        ...(Option.isSome(model.product.maybeDevice)
          ? { device: model.product.maybeDevice.value }
          : {}),
        ...(Option.isSome(model.product.maybePath)
          ? { path: model.product.maybePath.value }
          : {}),
        ...(Option.isSome(model.product.maybeShareName)
          ? { name: model.product.maybeShareName.value }
          : {}),
        ...(Option.isSome(model.product.maybeOwner)
          ? { owner: model.product.maybeOwner.value }
          : {}),
        ...(Option.isSome(model.product.maybeGranted)
          ? { granted: model.product.maybeGranted.value }
          : {}),
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
const openedNavigationPrefix = 'OpenedNavigation:'
const sharedNamedCounterPrefix = 'SharedNamedCounter:'

const tagFromMessage = (message: AppMessage): string =>
  M.value(message).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Increment: () => 'Increment',
      Decrement: () => 'Decrement',
      Reset: () => 'Reset',
      OpenedNavigation: ({ device, path }) =>
        `${openedNavigationPrefix}${JSON.stringify({
          ...(device === undefined ? {} : { device }),
          ...(path === undefined ? {} : { path }),
        })}`,
      SharedNamedCounter: ({ name, owner, grantedTo }) =>
        `${sharedNamedCounterPrefix}${JSON.stringify({
          name,
          owner,
          grantedTo,
        })}`,
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
  if (tag.startsWith(openedNavigationPrefix)) {
    const raw = tag.slice(openedNavigationPrefix.length)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return OpenedNavigation({})
    }
    const maybePayload = S.decodeUnknownOption(
      S.Struct({
        device: S.optionalKey(Device),
        path: S.optionalKey(S.String),
      }),
    )(parsed)
    if (Option.isNone(maybePayload)) {
      return OpenedNavigation({})
    }
    return OpenedNavigation(maybePayload.value)
  }
  if (tag.startsWith(sharedNamedCounterPrefix)) {
    const raw = tag.slice(sharedNamedCounterPrefix.length)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return SharedNamedCounter({ name: '', owner: '', grantedTo: '' })
    }
    const maybePayload = S.decodeUnknownOption(
      S.Struct({
        name: S.String,
        owner: S.String,
        grantedTo: S.String,
      }),
    )(parsed)
    if (Option.isNone(maybePayload)) {
      return SharedNamedCounter({ name: '', owner: '', grantedTo: '' })
    }
    return SharedNamedCounter(maybePayload.value)
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
