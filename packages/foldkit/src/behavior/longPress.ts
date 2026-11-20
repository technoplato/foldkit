import { Match as M, Option, Schema as S, String } from 'effect'

import * as Command from '../command/index.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { Block } from './block.js'
import { Device, type Sync } from './pace.js'

// NOTE: this is the one place that decides what a hold is, for every
// platform that has no recognizer of its own. Its state is a field of the
// Model and its waits are Commands, so no painter keeps a timer: a painter
// tells that a finger went down, moved off the spot, or lifted, and
// nothing else. When a hold completes the Model says so on the screen
// tree, and the painter that told the press sends the hold's press the
// ordinary way, so it is logged and checked like a hold a phone
// recognized. A platform that recognizes a hold itself, as a phone does,
// never tells this rule anything.

// STATE

/** No finger is down. `pressCount` is how many presses there have been. */
export const Idle = ts('Idle', { pressCount: S.Number })

/**
 * A finger is down and has not moved off the spot. `press` is what a
 * completed hold sends, `ShowTitleMenu:salt-road`.
 */
export const Pressing = ts('Pressing', {
  press: S.String,
  pressCount: S.Number,
})

/** The hold completed and the finger is still down. */
export const Held = ts('Held', { press: S.String, pressCount: S.Number })

/**
 * The finger lifted after a hold. The tap a browser sends for that lift
 * is swallowed, so it does not also press what is under the finger.
 */
export const Swallowing = ts('Swallowing', { pressCount: S.Number })

/**
 * Where a press stands. It lives in the Model of the device being
 * touched, and is never logged.
 *
 * @example
 * ```typescript
 * const Model = S.Struct({ hold: LongPress.State })
 * ```
 */
export const State = S.Union([Idle, Pressing, Held, Swallowing])
/** Where a press stands. */
export type State = typeof State.Type

/**
 * A press before anything has happened.
 *
 * @example
 * ```typescript
 * const init = (): Model => ({ hold: LongPress.initial })
 * ```
 */
export const initial: State = Idle({ pressCount: 0 })

// MESSAGE

/** A finger or a pen went down on something a hold can ask of. */
export const PressedDown = m('PressedDown', { press: S.String })

/** The finger moved farther from where it went down than a hold allows. */
export const MovedPointerAway = m('MovedPointerAway')

/** The finger lifted, or the platform took the touch away, as for a scroll. */
export const ReleasedPointer = m('ReleasedPointer')

/** The wait for a hold ended, for the press numbered `pressCount`. */
export const ElapsedHold = m('ElapsedHold', { pressCount: S.Number })

/** The moment a tap is swallowed for ended, for the press numbered `pressCount`. */
export const ElapsedSwallow = m('ElapsedSwallow', { pressCount: S.Number })

/** The tap that ended a hold arrived, and a painter stopped it. */
export const SwallowedPress = m('SwallowedPress')

/**
 * Everything the hold's rule is told.
 *
 * @example
 * ```typescript
 * const fact: Message = PressedDown({ press: 'ShowTitleMenu:salt-road' })
 * ```
 */
export const Message = S.Union([
  PressedDown,
  MovedPointerAway,
  ReleasedPointer,
  ElapsedHold,
  ElapsedSwallow,
  SwallowedPress,
])
/** Everything the hold's rule is told. */
export type Message = typeof Message.Type

/** True for a Message of the hold's rule. */
export const isMessage = S.is(Message)

// COMMAND

/** How long a finger rests before a press is a hold. */
export const holdMs = 500

/** How long after a hold's finger lifts its tap is still swallowed. */
export const swallowMs = 250

/** Waits out a hold and answers `ElapsedHold` for the press it waited for. */
export const WaitForHold = Command.define(
  'WaitForHold',
  { pressCount: S.Number, afterMs: S.Number },
  ElapsedHold,
)(({ pressCount, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedHold({ pressCount })),
)

/** Waits out the swallowed tap and answers `ElapsedSwallow`. */
export const WaitToStopSwallowing = Command.define(
  'WaitToStopSwallowing',
  { pressCount: S.Number, afterMs: S.Number },
  ElapsedSwallow,
)(({ pressCount, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedSwallow({ pressCount })),
)

// CHART

const pressed = ({
  state,
  message,
}: Readonly<{ state: State; message: typeof PressedDown.Type }>) => {
  const pressCount = state.pressCount + 1
  return {
    model: Pressing({ press: message.press, pressCount }),
    commands: [WaitForHold({ pressCount, afterMs: holdMs })],
  }
}

/**
 * The hold's chart: every state, and what each Message does in it.
 *
 * @example
 * ```typescript
 * chart.transition(LongPress.initial, PressedDown({ press: 'ShowTitleMenu:salt-road' }))
 * // [Pressing({ press: 'ShowTitleMenu:salt-road', pressCount: 1 }), [WaitForHold({ pressCount: 1, afterMs: 500 })]]
 * ```
 */
export const chart = define({ state: State, message: Message })({
  initial,
  states: {
    Idle: { on: { PressedDown: to('Pressing', pressed) } },
    Pressing: {
      on: {
        PressedDown: to('Pressing', pressed),
        MovedPointerAway: to('Idle', ({ state }) =>
          Idle({ pressCount: state.pressCount }),
        ),
        ReleasedPointer: to('Idle', ({ state }) =>
          Idle({ pressCount: state.pressCount }),
        ),
        ElapsedHold: [
          when(
            (state, message) => state.pressCount === message.pressCount,
            'Held',
            ({ state }) =>
              Held({ press: state.press, pressCount: state.pressCount }),
          ),
          ignore(),
        ],
      },
    },
    Held: {
      on: {
        PressedDown: to('Pressing', pressed),
        SwallowedPress: to('Idle', ({ state }) =>
          Idle({ pressCount: state.pressCount }),
        ),
        ReleasedPointer: to('Swallowing', ({ state }) => ({
          model: Swallowing({ pressCount: state.pressCount }),
          commands: [
            WaitToStopSwallowing({
              pressCount: state.pressCount,
              afterMs: swallowMs,
            }),
          ],
        })),
      },
    },
    Swallowing: {
      on: {
        PressedDown: to('Pressing', pressed),
        SwallowedPress: to('Idle', ({ state }) =>
          Idle({ pressCount: state.pressCount }),
        ),
        ElapsedSwallow: [
          when(
            (state, message) => state.pressCount === message.pressCount,
            'Idle',
            ({ state }) => Idle({ pressCount: state.pressCount }),
          ),
          ignore(),
        ],
      },
    },
  },
})

const downPrefix = 'fk-hold-down:'

const awayToken = 'fk-hold-away'

const upToken = 'fk-hold-up'

const swallowedToken = 'fk-hold-swallowed'

/** The press a painter sends when it stopped the tap that ended a hold. */
export const swallowedPress: string = swallowedToken

const inProgress: Sync = Device({ because: 'InputInProgress' })

/**
 * How each of the hold's Messages syncs: none does. A finger on this
 * glass is this device's, and what the hold leads to is sent as its own
 * Message.
 */
export const sync: Readonly<Record<Message['_tag'], Sync>> = {
  PressedDown: inProgress,
  MovedPointerAway: inProgress,
  ReleasedPointer: inProgress,
  ElapsedHold: inProgress,
  ElapsedSwallow: inProgress,
  SwallowedPress: inProgress,
}

/**
 * What a restart opens on: no finger down, with the count kept.
 *
 * @example
 * ```typescript
 * atRest(Pressing({ press: 'ShowTitleMenu:salt-road', pressCount: 4 })) // Idle({ pressCount: 4 })
 * ```
 */
export const atRest = (state: State): State =>
  Idle({ pressCount: state.pressCount })

/**
 * The hold as a block a part leans on: its state, its Messages, its
 * chart, how each Message syncs, and what it rests at.
 */
export const block: Block<State, Message> = {
  name: 'LongPress',
  State,
  Message,
  chart,
  sync,
  atRest,
}

// SIGNAL

/**
 * What a hold says on the screen tree while it is `Held` or `Swallowing`:
 * the press numbered `pressCount` completed. While the finger is still
 * down it carries the `press` to send, once; while it is there at all, the
 * next tap is the hold's own and is stopped.
 *
 * @example
 * ```typescript
 * const held: Signal = { press: 'ShowTitleMenu:salt-road', pressCount: 3 }
 * const lifted: Signal = { pressCount: 3 }
 * ```
 */
export type Signal = Readonly<{ press?: string; pressCount: number }>

/**
 * What a press says on the screen tree, or none while nothing is held.
 * This is the whole of what a painter is told about a hold.
 *
 * @example
 * ```typescript
 * signalOf(Held({ press: 'ShowTitleMenu:salt-road', pressCount: 3 }))
 * // Some({ press: 'ShowTitleMenu:salt-road', pressCount: 3 })
 * signalOf(Swallowing({ pressCount: 3 })) // Some({ pressCount: 3 })
 * signalOf(LongPress.initial) // None
 * ```
 */
export const signalOf = (state: State): Option.Option<Signal> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<Signal>>(),
    M.tagsExhaustive({
      Idle: () => Option.none(),
      Pressing: () => Option.none(),
      Held: ({ press, pressCount }) => Option.some({ press, pressCount }),
      Swallowing: ({ pressCount }) => Option.some({ pressCount }),
    }),
  )

// TOKEN

/** The four Messages a painter tells a hold with. */
export type Told =
  | typeof PressedDown.Type
  | typeof MovedPointerAway.Type
  | typeof ReleasedPointer.Type
  | typeof SwallowedPress.Type

/**
 * The press a painter sends to tell the hold's rule one thing. It is
 * printed here and read back by `messageOfToken`, so a painter copies the
 * string and never builds or splits it.
 *
 * @example
 * ```typescript
 * tokenOf(PressedDown({ press: 'ShowTitleMenu:salt-road' })) // 'fk-hold-down:ShowTitleMenu:salt-road'
 * tokenOf(ReleasedPointer()) // 'fk-hold-up'
 * ```
 */
export const tokenOf = (told: Told): string => {
  if (told._tag === 'PressedDown') {
    return `${downPrefix}${told.press}`
  } else if (told._tag === 'MovedPointerAway') {
    return awayToken
  } else if (told._tag === 'ReleasedPointer') {
    return upToken
  } else {
    return swallowedToken
  }
}

/**
 * The Message a press tells the hold's rule, or none for a press that is
 * not a hold's.
 *
 * @example
 * ```typescript
 * messageOfToken('fk-hold-down:ShowTitleMenu:salt-road') // Some(PressedDown({ press: 'ShowTitleMenu:salt-road' }))
 * messageOfToken('ShowTitleMenu:salt-road') // None
 * ```
 */
export const messageOfToken = (token: string): Option.Option<Told> => {
  if (token === awayToken) {
    return Option.some(MovedPointerAway())
  } else if (token === upToken) {
    return Option.some(ReleasedPointer())
  } else if (token === swallowedToken) {
    return Option.some(SwallowedPress())
  } else if (String.startsWith(downPrefix)(token)) {
    const press = token.slice(downPrefix.length)
    return String.isEmpty(press)
      ? Option.none()
      : Option.some(PressedDown({ press }))
  } else {
    return Option.none()
  }
}
