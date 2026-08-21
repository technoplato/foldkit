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

const failedInstantMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Instant could not open the Counters tape.'

const renderFailed = (error: string) => {
  root.replaceChildren()
  const output = document.createElement('output')
  output.setAttribute('role', 'alert')
  output.textContent = error
  output.style.color = '#fafaf9'
  output.style.display = 'block'
  output.style.padding = '24px'
  root.append(output)
}

const renderStarting = () => {
  root.replaceChildren()
  const status = document.createElement('p')
  status.textContent = 'Starting Instant Multiple Counters…'
  status.style.color = '#fafaf9'
  status.style.padding = '24px'
  root.append(status)
}

const start = async () => {
  renderStarting()
  const appId = import.meta.env.VITE_INSTANT_APP_ID
  if (typeof appId !== 'string' || appId === '') {
    renderFailed('Instant app id is missing.')
    return
  }
  let host
  try {
    host = await launchBrowserCountersHost(countersProcessorIds.threejs, appId)
  } catch (error) {
    renderFailed(failedInstantMessage(error))
    return
  }
  root.replaceChildren()
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
}

start().catch(error => {
  renderFailed(failedInstantMessage(error))
})
