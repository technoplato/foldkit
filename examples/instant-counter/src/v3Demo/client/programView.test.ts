import * as Counter from 'counter-core-example'
import {
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  CounterDetail,
  CounterFactAlert,
  type CounterFactStatus,
  FailedCounterFact,
  GotCounterMessage,
  LoadingCounterFact,
  Model,
  SelectedCounter,
  init,
  update,
} from 'counters-core-example'
import { Array, Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  formatMultipleCountersV3AvailableActions,
  formatMultipleCountersV3Destination,
  multipleCountersV3ProgramActionForToken,
  multipleCountersV3ProgramActions,
} from './programView.js'

const [listModel] = init()

const [detailModel] = update(
  listModel,
  SelectedCounter({
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
  }),
)

const [factModel] = update(
  detailModel,
  ClickedShowCounterFact({
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
    requestId: 'fact-1',
  }),
)

const [deleteModel] = update(
  detailModel,
  ClickedDeleteCounter({
    confirmationId: 'delete-1',
    counterId: 'counter-1',
    detailPresentationId: 'detail-1',
  }),
)

const modelWithFactStatus = (status: CounterFactStatus) =>
  Model.make({
    ...listModel,
    navigation: CounterDetail.make({
      counterId: 'counter-1',
      maybeMode: Option.some(
        CounterFactAlert.make({
          detailPresentationId: 'detail-1',
          requestId: 'fact-1',
          status,
        }),
      ),
      presentationId: 'detail-1',
    }),
  })

const tokensFor = (model: Model, isNavigationEnabled: boolean) =>
  Result.map(multipleCountersV3ProgramActions(model, isNavigationEnabled), actions =>
    Array.map(actions, action => action.token),
  )

describe('Multiple Counters v3 program view', () => {
  it('formats list, detail, fact, and delete destinations', () => {
    expect(formatMultipleCountersV3Destination(listModel)).toEqual([
      'Counters',
      'counter-1: 0',
      'counter-2: 0',
    ])
    expect(formatMultipleCountersV3Destination(detailModel)).toEqual([
      'counter-1',
      'Count: 0',
    ])
    expect(formatMultipleCountersV3Destination(factModel)).toEqual([
      'Counter fact for 0',
      '0 is the current value of this counter.',
    ])
    expect(
      formatMultipleCountersV3Destination(
        modelWithFactStatus(LoadingCounterFact.make({})),
      ),
    ).toEqual(['Loading counter fact…'])
    expect(
      formatMultipleCountersV3Destination(
        modelWithFactStatus(
          FailedCounterFact.make({ reason: 'Counter fact client stopped' }),
        ),
      ),
    ).toEqual(['Counter fact unavailable', 'Counter fact client stopped'])
    expect(formatMultipleCountersV3Destination(deleteModel)).toEqual([
      'Delete counter-1?',
      'This cannot be undone.',
    ])
  })

  it('keeps domain actions enabled for Observe followers and gates navigation', () => {
    const listActions = Result.getOrThrow(
      multipleCountersV3ProgramActions(listModel, false),
    )
    const increment = multipleCountersV3ProgramActionForToken(
      listActions,
      'increment:counter-1',
    )
    const open = multipleCountersV3ProgramActionForToken(
      listActions,
      'open:counter-1',
    )
    const add = multipleCountersV3ProgramActionForToken(listActions, 'add')

    expect(increment).toEqual(
      Option.some({
        isEnabled: true,
        isNavigation: false,
        label: 'Increment',
        token: 'increment:counter-1',
      }),
    )
    expect(open).toEqual(
      Option.some({
        isEnabled: false,
        isNavigation: true,
        label: 'Open counter-1',
        token: 'open:counter-1',
      }),
    )
    expect(add).toEqual(
      Option.some({
        isEnabled: true,
        isNavigation: false,
        label: 'Add counter',
        token: 'add',
      }),
    )
    expect(formatMultipleCountersV3AvailableActions(listActions)).toContain(
      'open:counter-1  Open counter-1  (follows the leader)',
    )
  })

  it('exposes detail navigation for fact, delete, and back', () => {
    const tokens = Result.getOrThrow(tokensFor(detailModel, true))

    expect(tokens).toContain('back')
    expect(tokens).toContain('fact')
    expect(tokens).toContain('delete')
    expect(tokens).toContain('reset')
    expect(tokens).toContain('increment:counter-1')
    expect(tokens).toContain('decrement:counter-1')
  })

  it('exposes fact dismiss and delete confirmation tokens', () => {
    expect(Result.getOrThrow(tokensFor(factModel, true))).toEqual(['dismiss'])
    expect(Result.getOrThrow(tokensFor(deleteModel, true))).toEqual([
      'cancel',
      'confirm-delete',
    ])
  })

  it('reflects a domain increment in the list destination', () => {
    const [nextModel] = update(
      listModel,
      GotCounterMessage({
        counterId: 'counter-1',
        message: Counter.ClickedIncrement(),
      }),
    )
    expect(formatMultipleCountersV3Destination(nextModel)).toEqual([
      'Counters',
      'counter-1: 1',
      'counter-2: 0',
    ])
  })
})
