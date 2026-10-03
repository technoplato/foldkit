import { Increment } from 'counter-core-example'
import { Option } from 'effect'
import { Navigation } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { CounterId } from './counterId.js'
import { ConfirmDelete, CounterList, type Destination } from './destination.js'
import { ConfirmDeleteCounter, GotCounterMessage } from './message.js'
import { CounterRow } from './model.js'

const three = CounterId.make(3)

const confirmThree = ConfirmDelete({ counterId: three })

describe('states the types rule out', () => {
  it('does not compile any of them', () => {
    const rejected: ReadonlyArray<() => unknown> = [
      () =>
        // @ts-expect-error a count is not a counter's identity
        GotCounterMessage({ counterId: 5, message: Increment() }),
      () =>
        GotCounterMessage({
          counterId: three,
          // @ts-expect-error a counter has no such Action
          message: { _tag: 'Explode' },
        }),
      () =>
        // @ts-expect-error the delete question must name its counter
        ConfirmDelete(),
      () =>
        // @ts-expect-error confirming must name the counter it deletes
        ConfirmDeleteCounter(),
      () =>
        // @ts-expect-error a counter in the list always has a count
        CounterRow.make({ counterId: three }),
      (): Navigation.NavigationStack<Destination> => ({
        root: CounterList(),
        pages: [],
        // @ts-expect-error at most one modal: there is no list of them
        maybeModal: Option.some([
          { destination: confirmThree, style: Navigation.Dialog() },
          { destination: confirmThree, style: Navigation.Dialog() },
        ]),
      }),
      (): Navigation.NavigationStack<Destination> => ({
        root: CounterList(),
        pages: [],
        // @ts-expect-error a pushed page is not a modal
        maybeModal: Option.some({
          destination: confirmThree,
          style: Navigation.Push(),
        }),
      }),
      (): Navigation.NavigationStack<Destination> => ({
        root: CounterList(),
        // @ts-expect-error no screen exists that the Destination does not name
        pages: [{ _tag: 'CounterEditor', counterId: three }],
        maybeModal: Option.none(),
      }),
    ]
    expect(rejected).toHaveLength(8)
  })
})
