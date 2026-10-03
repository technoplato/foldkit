import { Processor } from 'foldkit'
import {
  bindCounters,
  newProcessorInstance,
  startCounters,
} from 'multiple-counters-core-example'

import { reactive } from '@foldkit/svelte/interaction'

const handle = startCounters({
  host: Processor.Host.Svelte(),
  instance: newProcessorInstance(),
})

const hot = import.meta.hot
if (hot !== undefined) {
  hot.dispose(() => {
    void handle.stop()
  })
}

/** The one running Multiple Counters this Svelte window paints. */
export const counters = reactive(bindCounters(handle))
