import * as Counter from 'counter-core-example'
import { Array, Equal, Option, Result, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { init } from './init.js'
import {
  CancelledDeleteCounter,
  ClickedAddCounter,
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  DismissedCounterDetail,
  DismissedCounterFactAlert,
  GotChild,
  type Message,
  SelectedCounter,
} from './message.js'
import { type Model } from './model.js'
import { MultipleCountersProgram } from './program.js'
import { canonicalNavigationUri, navigationFromUri } from './uriProjection.js'

const send = (model: Model, message: Message): Model =>
  MultipleCountersProgram.update(model, message)[0]

const countOf = (model: Model, id: string): Option.Option<number> =>
  Option.map(
    Array.findFirst(model.rows, row => row.id === id),
    row => row.child.count,
  )

describe('forEach adoption parity', () => {
  it('routes GotChild through the public Program update to only its own row', () => {
    const [initial] = MultipleCountersProgram.init()
    const incremented = send(
      initial,
      GotChild({ id: 'counter-1', message: Counter.Increment() }),
    )
    const twiceIncremented = send(
      incremented,
      GotChild({ id: 'counter-1', message: Counter.Increment() }),
    )
    const otherRowIncremented = send(
      twiceIncremented,
      GotChild({ id: 'counter-2', message: Counter.Increment() }),
    )

    expect(countOf(incremented, 'counter-1')).toStrictEqual(Option.some(1))
    expect(countOf(incremented, 'counter-2')).toStrictEqual(
      Option.some(Counter.initialCount),
    )
    expect(countOf(twiceIncremented, 'counter-1')).toStrictEqual(Option.some(2))
    expect(countOf(otherRowIncremented, 'counter-1')).toStrictEqual(
      Option.some(2),
    )
    expect(countOf(otherRowIncremented, 'counter-2')).toStrictEqual(
      Option.some(Counter.initialCount + 1),
    )
  })

  it('keeps sibling fields untouched across row updates', () => {
    const [initial] = MultipleCountersProgram.init()
    const childMessage = GotChild({
      id: 'counter-2',
      message: Counter.Increment(),
    })
    const [afterChildMessage] = MultipleCountersProgram.update(
      initial,
      childMessage,
    )
    const [afterAddedRow] = MultipleCountersProgram.update(
      afterChildMessage,
      ClickedAddCounter({ counterId: 'counter-added-1' }),
    )

    expect(Equal.equals(initial.navigation, afterChildMessage.navigation)).toBe(
      true,
    )
    expect(
      Equal.equals(
        initial.retiredCounterIds,
        afterChildMessage.retiredCounterIds,
      ),
    ).toBe(true)
    expect(Equal.equals(initial.navigation, afterAddedRow.navigation)).toBe(
      true,
    )
    expect(
      Equal.equals(initial.retiredCounterIds, afterAddedRow.retiredCounterIds),
    ).toBe(true)
    expect(Array.length(afterAddedRow.rows)).toBe(
      Array.length(initial.rows) + 1,
    )
  })

  it('ignores GotChild for an unknown row id and returns an Equal Model', () => {
    const [initial] = MultipleCountersProgram.init()
    const [next] = MultipleCountersProgram.update(
      initial,
      GotChild({ id: 'counter-unknown-9', message: Counter.Reset() }),
    )

    expect(Equal.equals(next, initial)).toBe(true)
  })

  it('round trips a GotChild value through the exported Message Schema', () => {
    const value = GotChild({ id: 'counter-1', message: Counter.Reset() })

    const encoded = S.encodeSync(MultipleCountersProgram.Message)(value)
    const decoded = S.decodeUnknownSync(MultipleCountersProgram.Message)(
      encoded,
    )

    expect(decoded).toStrictEqual(value)
    expect(S.encodeSync(MultipleCountersProgram.Message)(decoded)).toEqual(
      encoded,
    )
  })

  it('replicates the canonical URI walk of every interaction reflection step', () => {
    const counterId = 'counter-a1'
    let model = send(init()[0], ClickedAddCounter({ counterId }))
    let uri = canonicalNavigationUri(model.navigation)
    expect(uri).toBe('/counters')

    const step = (message: Message, expectedUri: string): void => {
      const previousNavigation = model.navigation
      const next = send(model, message)
      const nextUri = canonicalNavigationUri(next.navigation)
      if (Equal.equals(previousNavigation, next.navigation)) {
        expect(nextUri).toBe(uri)
      } else {
        expect(nextUri).not.toBe(uri)
      }
      model = next
      uri = nextUri
      expect(uri).toBe(expectedUri)
      expect(Result.isSuccess(navigationFromUri(uri))).toBe(true)
    }

    step(
      SelectedCounter({ counterId, detailPresentationId: 'detail-a1' }),
      `/counters/${counterId}`,
    )
    step(
      ClickedShowCounterFact({
        counterId,
        detailPresentationId: 'detail-a1',
        requestId: 'fact-1',
      }),
      `/counters/${counterId}/fact`,
    )
    step(
      DismissedCounterFactAlert({
        counterId,
        detailPresentationId: 'detail-a1',
        requestId: 'fact-1',
      }),
      `/counters/${counterId}`,
    )
    step(
      ClickedDeleteCounter({
        confirmationId: 'delete-1',
        counterId,
        detailPresentationId: 'detail-a1',
      }),
      `/counters/${counterId}/delete`,
    )
    step(
      CancelledDeleteCounter({
        confirmationId: 'delete-1',
        counterId,
        detailPresentationId: 'detail-a1',
      }),
      `/counters/${counterId}`,
    )
    step(
      DismissedCounterDetail({ counterId, detailPresentationId: 'detail-a1' }),
      '/counters',
    )
  })
})
