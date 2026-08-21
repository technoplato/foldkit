/**
 * Map chrome as a portable mini-Program so Program.compose can nest it
 * next to product demos (one Model tree, one tape).
 */
import { Match as M, Schema as S } from 'effect'
import type * as Command from 'foldkit/command'
import { m } from 'foldkit/message'
import * as Program from 'foldkit/program'

/** Which map window is focused. */
export const FocusedSlot = S.Literals([
  'chrome',
  'single',
  'multi',
  'calc',
  'list',
])
export type FocusedSlot = typeof FocusedSlot.Type

export const Model = S.Struct({
  x: S.Number,
  y: S.Number,
  scale: S.Number,
  focusedSlot: FocusedSlot,
  showSingle: S.Boolean,
  showMulti: S.Boolean,
  showCalc: S.Boolean,
  showList: S.Boolean,
})
export type Model = typeof Model.Type

export const CanvasChanged = m('CanvasChanged', {
  x: S.Number,
  y: S.Number,
  scale: S.Number,
})
export const FocusedSlotChanged = m('FocusedSlotChanged', {
  slot: FocusedSlot,
})
export const ToggledShowSingle = m('ToggledShowSingle')
export const ToggledShowMulti = m('ToggledShowMulti')
export const ToggledShowCalc = m('ToggledShowCalc')
export const ToggledShowList = m('ToggledShowList')

export const Message = S.Union([
  CanvasChanged,
  FocusedSlotChanged,
  ToggledShowSingle,
  ToggledShowMulti,
  ToggledShowCalc,
  ToggledShowList,
])
export type Message = typeof Message.Type

export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [
  {
    x: 40,
    y: 40,
    scale: 0.72,
    focusedSlot: 'chrome',
    showSingle: true,
    showMulti: true,
    showCalc: true,
    showList: true,
  },
  [],
]

export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [Model, ReadonlyArray<Command.Command<Message>>]
    >(),
    M.tagsExhaustive({
      CanvasChanged: ({ x, y, scale }) => [{ ...model, x, y, scale }, []],
      FocusedSlotChanged: ({ slot }) => [{ ...model, focusedSlot: slot }, []],
      ToggledShowSingle: () => [
        { ...model, showSingle: !model.showSingle },
        [],
      ],
      ToggledShowMulti: () => [{ ...model, showMulti: !model.showMulti }, []],
      ToggledShowCalc: () => [{ ...model, showCalc: !model.showCalc }, []],
      ToggledShowList: () => [{ ...model, showList: !model.showList }, []],
    }),
  )

export const ChromeProgram = Program.make({
  id: 'pis-chrome',
  version: 1,
  Model,
  Message,
  init,
  update,
})
