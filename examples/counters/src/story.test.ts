import * as Counter from 'counter-core-example'
import {
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  CounterList,
  GotCounterMessage,
  SelectedCounter,
  modelForNavigation,
  update,
} from 'counters-core-example'
import { Array } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

describe('Multiple Counters update', () => {
  test('routes child Messages by stable counter identity', () => {
    Story.story(
      update,
      Story.with(modelForNavigation(CounterList.make({}))),
      Story.message(
        GotCounterMessage({
          counterId: 'counter-2',
          message: Counter.ClickedIncrement(),
        }),
      ),
      Story.model(model => {
        expect(Array.map(model.rows, row => row.counter.count)).toStrictEqual([
          0, 1,
        ])
      }),
    )
  })

  test('cannot open a fact alert over delete confirmation', () => {
    const detailPresentationId = 'detail-story'
    Story.story(
      update,
      Story.with(modelForNavigation(CounterList.make({}))),
      Story.message(
        SelectedCounter({
          counterId: 'counter-1',
          detailPresentationId,
        }),
      ),
      Story.message(
        ClickedDeleteCounter({
          confirmationId: 'delete-story',
          counterId: 'counter-1',
          detailPresentationId,
        }),
      ),
      Story.message(
        ClickedShowCounterFact({
          counterId: 'counter-1',
          detailPresentationId,
          requestId: 'fact-story',
        }),
      ),
      Story.model(model => {
        expect(model.navigation).toMatchObject({
          _tag: 'CounterDetail',
          counterId: 'counter-1',
          maybeMode: {
            _tag: 'Some',
            value: { _tag: 'DeleteCounterConfirmation' },
          },
        })
      }),
    )
  })
})
