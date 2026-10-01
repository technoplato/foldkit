import {
  bindCounter,
  newProcessorInstance,
  startCounter,
} from 'counter-core-example'
import { Processor } from 'foldkit'

import { reactive } from '@foldkit/svelte/interaction'

const handle = startCounter({
  host: Processor.Host.Svelte(),
  instance: newProcessorInstance(),
  tape: import.meta.env.VITE_COUNTER_TAPE === 'memory' ? 'Memory' : 'Instant',
})

const hot = import.meta.hot
if (hot !== undefined) {
  hot.dispose(() => {
    void handle.stop()
  })
}

/** The one running Counter this Svelte window paints. */
export const counter = reactive(bindCounter(handle))
