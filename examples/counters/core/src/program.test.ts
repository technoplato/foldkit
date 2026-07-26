import * as Counter from 'counter-core-example'
import { Array, Effect, Option } from 'effect'
import { Runtime } from 'foldkit'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'

import { StaticCounterFactClient } from './counterFactClient.js'
import { init } from './init.js'
import {
  ClickedDeleteCounter,
  ClickedShowCounterFact,
  DismissedCounterFactAlert,
  GotCounterMessage,
  SelectedCounter,
} from './message.js'
import { interactionsForModel } from './presentation.js'
import { MultipleCountersProgram } from './program.js'
import { navigationToPath, urlToNavigation } from './route.js'
import { update } from './update.js'

describe('Multiple Counters Program', () => {
  it('keeps fact alert and delete confirmation mutually exclusive', () => {
    const [initialModel] = init()
    const [detailModel] = update(
      initialModel,
      SelectedCounter({ counterId: 'counter-1' }),
    )
    const [deleteModel] = update(detailModel, ClickedDeleteCounter())
    const [unchangedModel] = update(deleteModel, ClickedShowCounterFact())

    expect(unchangedModel).toStrictEqual(deleteModel)
    expect(
      Array.map(
        interactionsForModel(unchangedModel),
        interaction => interaction.token,
      ),
    ).toStrictEqual(['cancel', 'confirm-delete'])
  })

  it('routes each child Message to the identified Counter Submodel', () => {
    const [initialModel] = init()
    const [nextModel] = update(
      initialModel,
      GotCounterMessage({
        counterId: 'counter-2',
        message: Counter.ClickedIncrement(),
      }),
    )
    const maybeFirst = Array.findFirst(
      nextModel.rows,
      row => row.id === 'counter-1',
    )
    const maybeSecond = Array.findFirst(
      nextModel.rows,
      row => row.id === 'counter-2',
    )

    expect(Option.map(maybeFirst, row => row.counter.count)).toStrictEqual(
      Option.some(0),
    )
    expect(Option.map(maybeSecond, row => row.counter.count)).toStrictEqual(
      Option.some(1),
    )
  })

  it('records the requested fact and Command result in one replay tape', async () => {
    const tape = await Effect.runPromise(
      Effect.scoped(
        Runtime.recordReplayTape(
          MultipleCountersProgram,
          StaticCounterFactClient,
          [
            SelectedCounter({ counterId: 'counter-1' }),
            GotCounterMessage({
              counterId: 'counter-1',
              message: Counter.ClickedIncrement(),
            }),
            ClickedShowCounterFact(),
            DismissedCounterFactAlert(),
          ],
        ),
      ),
    )

    expect(
      Array.map(tape.transitions, transition => transition.message._tag),
    ).toStrictEqual([
      'SelectedCounter',
      'GotCounterMessage',
      'ClickedShowCounterFact',
      'SucceededFetchCounterFact',
      'DismissedCounterFactAlert',
    ])
  })

  it('round-trips destination state without putting replay events in the URL', () => {
    const maybeUrl = fromString('https://example.test/counters/counter-2/fact')
    if (Option.isNone(maybeUrl)) {
      throw new Error('Expected a valid URL')
    }

    const navigation = urlToNavigation(maybeUrl.value)

    expect(navigationToPath(navigation)).toBe('/counters/counter-2/fact')
    expect(navigationToPath(navigation)).not.toContain('Clicked')
    expect(navigationToPath(navigation)).not.toContain('tape')
  })
})
