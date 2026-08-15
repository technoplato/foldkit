import { type Model } from 'counters-core-example'
import {
  addCounterMessage,
  countersProcessorIds,
  decrementCounterMessage,
  incrementCounterMessage,
  launchBrowserCountersHost,
} from 'counters-instant-example'

import { createCountersScene } from './scene.js'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

const rowsFromModel = (model: Model) =>
  model.rows.map(row => ({ id: row.id, count: row.counter.count }))

const appId = import.meta.env.VITE_INSTANT_APP_ID

void launchBrowserCountersHost(
  countersProcessorIds.threejs,
  typeof appId === 'string' && appId !== '' ? appId : undefined,
).then(host => {
  const scene = createCountersScene(root, {
    onIncrement: counterId => {
      host.send(incrementCounterMessage(counterId))
    },
    onDecrement: counterId => {
      host.send(decrementCounterMessage(counterId))
    },
    onAdd: () => {
      host.send(addCounterMessage(host.readModel()))
    },
  })
  scene.syncState({ rows: rowsFromModel(host.readModel()) })
  host.subscribe(model => {
    scene.syncState({ rows: rowsFromModel(model) })
  })
})
