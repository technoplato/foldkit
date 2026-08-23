import { Match as M, Schema as S, SchemaTransformation } from 'effect'
import { Program } from 'foldkit'

import { type AppMessage, type AppModel } from './app.js'
import {
  FailedOperator,
  GuessedNo,
  GuessedYes,
  ObservedOperator,
  OpenedReplicate,
  PostedOperator,
  RequestedHint,
  ResetTape,
  SucceededOperatorDispatch,
  SucceededOperatorUrls,
  SucceededOperatorVerify,
} from './message.js'
import { Model } from './model.js'
import { Prompt, Step } from './step.js'

const AppSnapshot = S.Struct({
  product: Model,
  actionMenu: Program.ActionMenuModel,
})

const AppMessageSchema = S.Union([
  GuessedYes,
  GuessedNo,
  RequestedHint,
  PostedOperator,
  SucceededOperatorUrls,
  ObservedOperator,
  SucceededOperatorVerify,
  SucceededOperatorDispatch,
  FailedOperator,
  OpenedReplicate,
  ResetTape,
  Program.ActionMenuCommandTriggered,
  Program.ActionMenuDismissed,
  Program.ActionMenuFocusMoved,
  Program.ActionCommandMenuSelectionMade,
  Program.ActionMenuQueryChanged,
])

/**
 * Instant entity id for the one tape snapshot row.
 * Instant requires a UUID. This constant is that one row.
 */
export const TAPE_UUID = 'a11e0001-0000-4000-8000-000000000001'

/**
 * Instant tape row. Steps and prompt are the Puzzle ADT.
 * No count field. `asOf` and `at` are filled at write time.
 */
export const TapeRow = S.Struct({
  id: S.Literal(TAPE_UUID),
  steps: S.Array(Step),
  prompt: Prompt,
  asOf: S.String,
  at: S.Number,
})
/** Instant tape row. Steps and prompt are the Puzzle ADT. */
export type TapeRow = typeof TapeRow.Type

/**
 * Door from an Instant tape row to the App Model.
 * Tape and prompt live in the snapshot. Menu Open is a Message, so boot is Closed.
 */
export const TapeProjection = TapeRow.pipe(
  S.decodeTo(
    AppSnapshot,
    SchemaTransformation.transform({
      decode: (row): AppModel => ({
        product: Model.make({
          tape: row.steps,
          prompt: row.prompt,
        }),
        actionMenu: Program.Closed(),
      }),
      encode: (model: AppModel) => ({
        id: TAPE_UUID,
        steps: model.product.tape,
        prompt: model.product.prompt,
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
      GuessedYes: () => 'GuessedYes',
      GuessedNo: () => 'GuessedNo',
      RequestedHint: () => 'RequestedHint',
      PostedOperator: () => 'PostedOperator',
      SucceededOperatorUrls: () => 'SucceededOperatorUrls',
      ObservedOperator: () => 'ObservedOperator',
      SucceededOperatorVerify: () => 'SucceededOperatorVerify',
      SucceededOperatorDispatch: () => 'SucceededOperatorDispatch',
      FailedOperator: ({ reason }) => `FailedOperator:${reason}`,
      OpenedReplicate: () => 'OpenedReplicate',
      ResetTape: () => 'ResetTape',
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
  if (tag === 'GuessedYes') {
    return GuessedYes()
  }
  if (tag === 'GuessedNo') {
    return GuessedNo()
  }
  if (tag === 'RequestedHint') {
    return RequestedHint()
  }
  if (tag === 'PostedOperator') {
    return PostedOperator()
  }
  if (tag === 'SucceededOperatorUrls') {
    return SucceededOperatorUrls()
  }
  if (tag === 'ObservedOperator') {
    return ObservedOperator()
  }
  if (tag === 'SucceededOperatorVerify') {
    return SucceededOperatorVerify()
  }
  if (tag === 'SucceededOperatorDispatch') {
    return SucceededOperatorDispatch()
  }
  if (tag.startsWith('FailedOperator:')) {
    return FailedOperator({ reason: tag.slice('FailedOperator:'.length) })
  }
  if (tag === 'OpenedReplicate') {
    return OpenedReplicate()
  }
  if (tag === 'ResetTape') {
    return ResetTape()
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
  return GuessedYes()
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
