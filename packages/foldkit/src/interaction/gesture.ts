import { Match as M, Schema as S } from 'effect'

import { m } from '../schema/index.js'
import type { BoundInteraction } from './bind.js'
import { KeyInput, type ProgramInteraction } from './interaction.js'

/** A person pressed one Action's control, such as the `+` button. */
export const PressedAction = m('PressedAction', { tag: S.String })
/** A person pressed a key. */
export const PressedKey = m('PressedKey', { input: KeyInput })
/** A person asked for the action menu. */
export const OpenedMenu = m('OpenedMenu')
/** A person dismissed the action menu. */
export const DismissedMenu = m('DismissedMenu')
/** A person typed into the action menu filter. */
export const TypedInMenu = m('TypedInMenu', { query: S.String })
/** A person chose one action menu row. */
export const ChoseFromMenu = m('ChoseFromMenu', { tag: S.String })

/**
 * What a Message-based painter reports, such as a Foldkit HTML view. The
 * Client applies each gesture to the bound Program, which turns it into the
 * Program's own Messages: choosing Increment from the menu becomes
 * `Increment` plus the menu's navigation fact.
 */
export const Gesture = S.Union([
  PressedAction,
  PressedKey,
  OpenedMenu,
  DismissedMenu,
  TypedInMenu,
  ChoseFromMenu,
])
/** What a Message-based painter reports. */
export type Gesture = typeof Gesture.Type

/**
 * Applies one gesture to a bound Program and returns whether it sent any
 * Messages.
 *
 * @example
 * ```typescript
 * applyGesture(counter, ChoseFromMenu({ tag: 'Reset' }))
 * ```
 */
export const applyGesture = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  gesture: Gesture,
): boolean =>
  M.value(gesture).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      PressedAction: ({ tag }) => bound.press(tag),
      PressedKey: ({ input }) => bound.pressKey(input),
      OpenedMenu: () => bound.openMenu(),
      DismissedMenu: () => bound.dismissMenu(),
      TypedInMenu: ({ query }) => bound.typeInMenu(query),
      ChoseFromMenu: ({ tag }) => bound.chooseFromMenu(tag),
    }),
  )

/**
 * The Messages one gesture produces against a Model, without sending them.
 * Scene tests and replay use this; a live Client uses {@link applyGesture}.
 *
 * @example
 * ```typescript
 * messagesOfGesture(App.interaction, model, PressedAction({ tag: 'Increment' }))
 * // [Increment()]
 * ```
 */
export const messagesOfGesture = <Model, Message>(
  interaction: ProgramInteraction<Model, Message>,
  model: Model,
  gesture: Gesture,
): ReadonlyArray<Message> =>
  M.value(gesture).pipe(
    M.withReturnType<ReadonlyArray<Message>>(),
    M.tagsExhaustive({
      PressedAction: ({ tag }) => interaction.press(model, tag),
      PressedKey: ({ input }) => interaction.pressKey(model, input),
      OpenedMenu: () => interaction.openMenu(model),
      DismissedMenu: () => interaction.dismissMenu(model),
      TypedInMenu: ({ query }) => interaction.typeInMenu(model, query),
      ChoseFromMenu: ({ tag }) => interaction.chooseFromMenu(model, tag),
    }),
  )
