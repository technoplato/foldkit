import { Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  Decrement,
  Increment,
  Model,
  OpenedNavigation,
  Reset,
  init,
  initialCount,
  restore,
  update,
} from './index.js'

const initialModel = Model.make({ count: initialCount })

describe('update', () => {
  test('init uses the canonical initial count and produces no Commands', () => {
    const [model, commands] = init()

    expect(model).toEqual(Model.make({ count: initialCount }))
    expect(commands).toEqual([])
  })

  test('restore preserves the canonical Model and produces no Commands', () => {
    const model = Model.make({ count: 42 })

    expect(restore(model)).toStrictEqual([model, []])
  })

  test('Increment adds one to the count', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(Increment()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.count).toBe(1)
      }),
    )
  })

  test('Decrement subtracts one from the count', () => {
    Story.story(
      update,
      Story.with(Model.make({ count: 5 })),
      Story.message(Decrement()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.count).toBe(4)
      }),
    )
  })

  test('Decrement past zero produces a negative count', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(Decrement()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.count).toBe(-1)
      }),
    )
  })

  test('Reset from a non-zero count sets the count to zero', () => {
    Story.story(
      update,
      Story.with(Model.make({ count: 99 })),
      Story.message(Reset()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.count).toBe(0)
      }),
    )
  })

  test('Reset at 0 does not change the count', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(Reset()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.count).toBe(0)
      }),
    )
  })

  test('successive Messages accumulate as expected', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(Increment()),
      Story.Command.expectNone(),
      Story.message(Increment()),
      Story.Command.expectNone(),
      Story.message(Increment()),
      Story.Command.expectNone(),
      Story.message(Decrement()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.count).toBe(2)
      }),
      Story.message(Reset()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.count).toBe(0)
      }),
    )
  })

  test('OpenedNavigation occupies device and path without changing count', () => {
    Story.story(
      update,
      Story.with(Model.make({ count: 3 })),
      Story.message(
        OpenedNavigation({ device: 'phone', path: 'counter.increment' }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.count).toBe(3)
        expect(model.maybeDevice).toEqual(Option.some('phone'))
        expect(model.maybePath).toEqual(Option.some('counter.increment'))
      }),
    )
  })

  test('OpenedNavigation occupies home /counter', () => {
    Story.story(
      update,
      Story.with(Model.make({ count: 0 })),
      Story.message(OpenedNavigation({ path: 'counter' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.count).toBe(0)
        expect(model.maybePath).toEqual(Option.some('counter'))
      }),
    )
  })

  test('Increment keeps occupancy', () => {
    Story.story(
      update,
      Story.with(
        Model.make({
          count: 1,
          maybeDevice: Option.some('phone'),
          maybePath: Option.some('counter.increment'),
        }),
      ),
      Story.message(Increment()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.count).toBe(2)
        expect(model.maybeDevice).toEqual(Option.some('phone'))
        expect(model.maybePath).toEqual(Option.some('counter.increment'))
      }),
    )
  })
})
