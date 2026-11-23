import { Processor } from 'foldkit'
import {
  bindCounters,
  newProcessorInstance,
  startCountersAt,
} from 'multiple-counters-core-example'

import { reactive } from '@foldkit/svelte/interaction'

const handle = startCountersAt(
  { host: Processor.Host.Svelte(), instance: newProcessorInstance() },
  window.location.search,
)

const hot = import.meta.hot
if (hot !== undefined) {
  hot.dispose(() => {
    void handle.stop()
  })
}

/** The one running Multiple Counters this Svelte window paints. */
export const counters = reactive(bindCounters(handle))
