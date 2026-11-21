import { Effect, Match as M, Option, Schema as S } from 'effect'
import { Presence } from 'foldkit/behavior'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import * as Render from 'foldkit/render'
import { evo } from 'foldkit/struct'

import { idSelector } from '../internal/selectors.js'
import {
  AdvancedAnimationFrame,
  EndedAnimation,
  type Message,
  type Model,
  type OutMessage,
  StartedLeaveAnimating,
  TransitionedOut,
} from './schema.js'

// UPDATE

const elementSelector = (id: string): string => idSelector(id)

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
  Option.Option<OutMessage>,
]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

/** Advances the enter/leave lifecycle by waiting a double-rAF. */
export const RequestFrame = Command.define(
  'RequestFrame',
  AdvancedAnimationFrame,
)(Render.afterPaint.pipe(Effect.as(AdvancedAnimationFrame())))
/** Waits for all CSS animations on the element to settle. Covers both CSS transitions and CSS keyframe animations. */
export const WaitForAnimationSettled = Command.define(
  'WaitForAnimationSettled',
  { id: S.String },
  EndedAnimation,
)(({ id }) =>
  Dom.waitForAnimationSettled(elementSelector(id)).pipe(
    Effect.as(EndedAnimation()),
  ),
)

const stepPresence = (
  model: Model,
  presenceMessage: Presence.Message,
): Option.Option<Presence.State> => {
  const current = Presence.fromAnimation({
    isShowing: model.isShowing,
    transitionPhase: model.transitionState,
  })
  const stepped = Presence.chart.step(current, presenceMessage, {
    isAnimated: true,
  })
  return stepped._tag === 'Transitioned'
    ? Option.some(stepped.state)
    : Option.none()
}

const applyPresence = (model: Model, nextPresence: Presence.State): Model => {
  const projected = Presence.toAnimation(nextPresence)
  return evo(model, {
    isShowing: () => projected.isShowing,
    transitionState: () => projected.transitionPhase,
  })
}

/** Processes an animation message and returns the next model, commands, and optional OutMessage. */
export const update = (model: Model, message: Message): UpdateReturn => {
  const maybeNextFrame = RequestFrame()

  return M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      Showed: () =>
        Option.match(stepPresence(model, Presence.Show()), {
          onNone: () => [model, [], Option.none()],
          onSome: nextPresence => [
            applyPresence(model, nextPresence),
            [maybeNextFrame],
            Option.none(),
          ],
        }),

      Hid: () =>
        Option.match(stepPresence(model, Presence.Hide()), {
          onNone: () => [model, [], Option.none()],
          onSome: nextPresence => [
            applyPresence(model, nextPresence),
            [maybeNextFrame],
            Option.none(),
          ],
        }),

      AdvancedAnimationFrame: () =>
        Option.match(stepPresence(model, Presence.AdvanceFrame()), {
          onNone: () => [model, [], Option.none()],
          onSome: nextPresence => {
            if (nextPresence._tag === 'EnterAnimating') {
              return [
                applyPresence(model, nextPresence),
                [WaitForAnimationSettled({ id: model.id })],
                Option.none(),
              ]
            } else if (nextPresence._tag === 'LeaveAnimating') {
              return [
                applyPresence(model, nextPresence),
                [],
                Option.some(StartedLeaveAnimating()),
              ]
            } else {
              return [model, [], Option.none()]
            }
          },
        }),

      EndedAnimation: () =>
        Option.match(stepPresence(model, Presence.EndAnimation()), {
          onNone: () => [model, [], Option.none()],
          onSome: nextPresence => {
            if (nextPresence._tag === 'Open') {
              return [applyPresence(model, nextPresence), [], Option.none()]
            } else if (nextPresence._tag === 'Closed') {
              return [
                applyPresence(model, nextPresence),
                [],
                Option.some(TransitionedOut()),
              ]
            } else {
              return [model, [], Option.none()]
            }
          },
        }),
    }),
  )
}

/** Creates the standard leave-phase command that waits for CSS animations on the element to settle. Use this when handling the `StartedLeaveAnimating` OutMessage for components that don't need custom leave behavior. */
export const defaultLeaveCommand = (model: Model): Command.Command<Message> =>
  WaitForAnimationSettled({ id: model.id })
