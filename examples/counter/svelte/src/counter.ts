import {
  bindCounter,
  newProcessorInstance,
  startCounter,
  syncPolicyOf,
} from 'counter-core-example'
import { Option } from 'effect'
import { Processor } from 'foldkit'

import { reactive } from './reactive.js'

const searchParams = new URLSearchParams(window.location.search)

const handle = startCounter({
  host: Processor.Host.Svelte(),
  instance: newProcessorInstance(),
  tape: import.meta.env.VITE_COUNTER_TAPE === 'memory' ? 'Memory' : 'Instant',
  ...Option.match(syncPolicyOf(searchParams.get('sync') ?? ''), {
    onNone: () => ({}),
    onSome: policy => ({ policy }),
  }),
})

const hot = import.meta.hot
if (hot !== undefined) {
  hot.dispose(() => {
    void handle.stop()
  })
}

/** The one running Counter this Svelte window paints. */
export const counter = reactive(bindCounter(handle))
