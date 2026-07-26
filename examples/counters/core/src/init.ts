import * as Counter from 'counter-core-example'
import { Option } from 'effect'
import { type Command } from 'foldkit'

import { type Message } from './message.js'
import {
  CounterDetail,
  CounterFactAlert,
  CounterList,
  CounterRow,
  LoadingCounterFact,
  Model,
  type Navigation,
} from './model.js'

const initialRows = [
  CounterRow.make({
    id: 'counter-1',
    counter: Counter.Model.make({ count: Counter.initialCount }),
  }),
  CounterRow.make({
    id: 'counter-2',
    counter: Counter.Model.make({ count: Counter.initialCount }),
  }),
]

/** Creates the stable initial Model for a projected navigation destination. */
export const modelForNavigation = (navigation: Navigation): Model =>
  Model.make({
    rows: initialRows,
    nextCounterNumber: 3,
    navigation,
  })

/** Creates a loading fact destination for an initial URL projection. */
export const loadingFactNavigation = (counterId: string): Navigation =>
  CounterDetail.make({
    counterId,
    maybeMode: Option.some(
      CounterFactAlert.make({ status: LoadingCounterFact.make({}) }),
    ),
  })

/** Creates the initial Multiple Counters Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] => [modelForNavigation(CounterList.make({})), []]
