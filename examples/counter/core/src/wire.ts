import { Schema as S, SchemaTransformation } from 'effect'
import { ActionMenu, Navigation } from 'foldkit'

import {
  countSnapshotId,
  snapshotLogMessageWire,
} from '@foldkit/instant/snapshot-log'

import { App } from './app.js'
import { Counter } from './navigation.js'

const AppDestination = S.Union([Counter, ActionMenu.ActionMenu])
type AppDestination = typeof AppDestination.Type

const AppModel = S.Struct({
  count: S.Number,
  navigation: Navigation.NavigationStack(AppDestination),
})

/**
 * The Instant count row. `asOf` and `at` are filled at write time. Rows
 * written before the canonical Counter may carry extra occupancy columns;
 * decoding ignores them.
 */
export const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})
/** The Instant count row. */
export type CountRow = typeof CountRow.Type

/**
 * Door from the Instant count row to the App Model. Only the count travels.
 * Navigation starts at the Counter page on every Processor, so a device that
 * joins never inherits another device's open menu from a snapshot.
 */
export const CountProjection = CountRow.pipe(
  S.decodeTo(
    AppModel,
    SchemaTransformation.transform({
      decode: (row): typeof AppModel.Encoded => ({
        count: row.value,
        navigation: Navigation.stackAtRoot<AppDestination>(Counter()),
      }),
      encode: model => ({
        id: countSnapshotId,
        value: model.count,
        asOf: '',
        at: 0,
      }),
    }),
  ),
)

/**
 * Door from an Instant Message row to an App Message. `Increment` travels as
 * the bare tag counter-swift reads; menu Messages carry their fields as
 * JSON. An unknown tag fails to decode instead of becoming a guess.
 */
export const MessageWire = snapshotLogMessageWire(App.Message)
