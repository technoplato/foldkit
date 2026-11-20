import { Array, Duration, Effect, Fiber, Option, Ref } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import {
  ElapsedHold,
  ElapsedSwallow,
  Held,
  Idle,
  type Message,
  MovedPointerAway,
  PressedDown,
  Pressing,
  ReleasedPointer,
  type State,
  SwallowedPress,
  Swallowing,
  type Told,
  atRest,
  block,
  chart,
  holdMs,
  initial,
  messageOfToken,
  signalOf,
  swallowMs,
  swallowedPress,
  tokenOf,
} from './longPress.js'

// Made-up presses: nothing here is a real title.

const press = 'ShowTitleMenu:salt-road'

const folded = (
  messages: ReadonlyArray<Message>,
  from: State = initial,
): State =>
  Array.reduce(
    messages,
    from,
    (state, message) => chart.transition(state, message)[0],
  )

const namesOf = (
  commands: ReadonlyArray<Readonly<{ name: string }>>,
): ReadonlyArray<string> => Array.map(commands, command => command.name)

describe('a hold', () => {
  it('starts when a finger goes down, and asks for the wait', () => {
    const [state, commands] = chart.transition(initial, PressedDown({ press }))
    expect(state).toEqual(Pressing({ press, pressCount: 1 }))
    expect(namesOf(commands)).toEqual(['WaitForHold'])
    expect(signalOf(state)).toEqual(Option.none())
  })

  it('completes when the wait ends with the finger still down and still there', () => {
    const pressing = folded([PressedDown({ press })])
    const [state, commands] = chart.transition(
      pressing,
      ElapsedHold({ pressCount: 1 }),
    )
    expect(state).toEqual(Held({ press, pressCount: 1 }))
    expect(commands).toEqual([])
    expect(signalOf(state)).toEqual(Option.some({ press, pressCount: 1 }))
  })

  it('asks for nothing when the finger moves off the spot first', () => {
    const moved = folded([PressedDown({ press }), MovedPointerAway()])
    expect(moved).toEqual(Idle({ pressCount: 1 }))
    expect(folded([ElapsedHold({ pressCount: 1 })], moved)).toEqual(
      Idle({ pressCount: 1 }),
    )
  })

  it('asks for nothing when the finger lifts early', () => {
    const lifted = folded([PressedDown({ press }), ReleasedPointer()])
    expect(lifted).toEqual(Idle({ pressCount: 1 }))
    expect(folded([ElapsedHold({ pressCount: 1 })], lifted)).toEqual(lifted)
  })

  it('ignores the wait of a tap that ended, so a hold begun inside 500 ms of it is not cut short', () => {
    const second = folded([
      PressedDown({ press }),
      ReleasedPointer(),
      PressedDown({ press }),
    ])
    expect(second).toEqual(Pressing({ press, pressCount: 2 }))
    expect(folded([ElapsedHold({ pressCount: 1 })], second)).toEqual(second)
    expect(folded([ElapsedHold({ pressCount: 2 })], second)).toEqual(
      Held({ press, pressCount: 2 }),
    )
  })

  it('says why a late wait did nothing', () => {
    const second = folded([
      PressedDown({ press }),
      ReleasedPointer(),
      PressedDown({ press }),
    ])
    const late = chart.step(second, ElapsedHold({ pressCount: 1 }))
    expect(late._tag === 'Ignored' ? late.reason : late._tag).toBe(
      'ExplicitlyIgnored',
    )
  })
})

describe('the tap that ends a hold', () => {
  const held = folded([PressedDown({ press }), ElapsedHold({ pressCount: 1 })])

  it('is still the hold’s own for a moment after the finger lifts, with no press left to send', () => {
    const [lifted, commands] = chart.transition(held, ReleasedPointer())
    expect(lifted).toEqual(Swallowing({ pressCount: 1 }))
    expect(namesOf(commands)).toEqual(['WaitToStopSwallowing'])
    expect(signalOf(lifted)).toEqual(Option.some({ pressCount: 1 }))
  })

  it('is over once a painter stopped one tap', () => {
    const after = folded([ReleasedPointer(), SwallowedPress()], held)
    expect(after).toEqual(Idle({ pressCount: 1 }))
    expect(signalOf(after)).toEqual(Option.none())
  })

  it('is over after one stopped tap even when the lift was never told', () => {
    expect(folded([SwallowedPress()], held)).toEqual(Idle({ pressCount: 1 }))
  })

  it('is over by itself, so a later tap on a menu item is not eaten', () => {
    const after = folded(
      [ReleasedPointer(), ElapsedSwallow({ pressCount: 1 })],
      held,
    )
    expect(after).toEqual(Idle({ pressCount: 1 }))
  })

  it('gives way to a new press', () => {
    const again = folded([ReleasedPointer(), PressedDown({ press })], held)
    expect(again).toEqual(Pressing({ press, pressCount: 2 }))
  })
})

describe('the waits are Commands, and nothing else keeps time', () => {
  it('waits 500 ms for a hold and answers for the press it waited for', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const [, commands] = chart.transition(initial, PressedDown({ press }))
        const wait = Option.getOrThrow(Array.head(commands))
        const answered = yield* Ref.make(Array.empty<Message>())
        const fiber = yield* Effect.forkChild(
          Effect.tap(wait.effect, message =>
            Ref.update(answered, all => [...all, message]),
          ),
        )
        yield* TestClock.adjust(Duration.millis(holdMs - 1))
        expect(yield* Ref.get(answered)).toEqual([])
        yield* TestClock.adjust(Duration.millis(1))
        expect(yield* Fiber.join(fiber)).toEqual(ElapsedHold({ pressCount: 1 }))
        expect(wait.args).toEqual({ pressCount: 1, afterMs: holdMs })
      }).pipe(Effect.provide(TestClock.layer())),
    ))

  it('holds for 500 ms and swallows for 250', () => {
    expect(holdMs).toBe(500)
    expect(swallowMs).toBe(250)
  })
})

describe('a painter tells a hold with four presses', () => {
  const told: ReadonlyArray<Told> = [
    PressedDown({ press }),
    MovedPointerAway(),
    ReleasedPointer(),
    SwallowedPress(),
  ]

  it('prints and reads each one', () => {
    expect(Array.map(told, tokenOf)).toEqual([
      'fk-hold-down:ShowTitleMenu:salt-road',
      'fk-hold-away',
      'fk-hold-up',
      'fk-hold-swallowed',
    ])
    expect(
      Array.map(told, message => messageOfToken(tokenOf(message))),
    ).toEqual(Array.map(told, message => Option.some(message)))
    expect(swallowedPress).toBe('fk-hold-swallowed')
  })

  it('reads nothing from a press that is not a hold’s', () => {
    expect(messageOfToken('ShowTitleMenu:salt-road')).toEqual(Option.none())
    expect(messageOfToken('fk-hold-down:')).toEqual(Option.none())
  })
})

describe('the chart', () => {
  it('has no state that cannot be reached and no edge that cannot fire', () => {
    expect(chart.unreachableStates()).toEqual([])
    expect(chart.deadTransitions()).toEqual([])
  })

  it('keeps every Message on the device, as input in progress', () => {
    expect(Array.map(Object.values(block.sync), sync => sync._tag)).toEqual(
      Array.makeBy(6, () => 'Device'),
    )
  })

  it('rests at Idle, keeping its count, so a restart opens on no half-made press', () => {
    expect(atRest(Pressing({ press, pressCount: 4 }))).toEqual(
      Idle({ pressCount: 4 }),
    )
    expect(atRest(Held({ press, pressCount: 4 }))).toEqual(
      Idle({ pressCount: 4 }),
    )
  })
})
