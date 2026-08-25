import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  type CounterDetailMode,
  CounterFactAlert,
  DeleteCounterConfirmation,
  LoadingCounterFact,
} from './model.js'
import {
  CounterDetailDestination,
  CounterListDestination,
  presentationStyleOf,
} from './presentation.js'

const detailWith = (
  mode: CounterDetailMode,
): typeof CounterDetailDestination.Type =>
  CounterDetailDestination.make({
    counter: { id: 'counter-1', child: { count: 0 } },
    detailPresentationId: 'detail-1',
    maybeMode: Option.some(mode),
  })

describe('presentationStyleOf', () => {
  it('derives Push for the list destination', () => {
    expect(
      presentationStyleOf(CounterListDestination.make({ counters: [] })),
    ).toBe('Push')
  })

  it('derives Push for a plain detail', () => {
    const plain = CounterDetailDestination.make({
      counter: { id: 'counter-1', child: { count: 0 } },
      detailPresentationId: 'detail-1',
      maybeMode: Option.none(),
    })
    expect(presentationStyleOf(plain)).toBe('Push')
  })

  it('derives Sheet for the fact alert overlay', () => {
    const alert = detailWith(
      CounterFactAlert.make({
        requestId: 'fact-1',
        status: LoadingCounterFact.make({}),
      }),
    )
    expect(presentationStyleOf(alert)).toBe('Sheet')
  })

  it('derives Dialog for the delete confirmation overlay', () => {
    const confirm = detailWith(
      DeleteCounterConfirmation.make({ confirmationId: 'delete-1' }),
    )
    expect(presentationStyleOf(confirm)).toBe('Dialog')
  })
})
