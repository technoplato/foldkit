import * as Counter from 'counter-core-example'
import { type Command } from 'foldkit'

import { type CounterFactClient } from './counterFactClient.js'
import { type Message } from './message.js'
import { CounterList, CounterRow, Model, type Navigation } from './model.js'

const initialRows = [
  CounterRow.make({
    id: 'counter-1',
    child: Counter.Model.make({ count: Counter.initialCount }),
  }),
  CounterRow.make({
    id: 'counter-2',
    child: Counter.Model.make({ count: Counter.initialCount }),
  }),
]

/** Creates the stable initial Model for a projected navigation destination. */
export const modelForNavigation = (navigation: Navigation): Model =>
  Model.make({
    retiredCounterIds: [],
    rows: initialRows,
    navigation,
    nextId: 0,
  })

/** Creates the initial Multiple Counters Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, CounterFactClient>>,
] => [modelForNavigation(CounterList.make({})), []]
