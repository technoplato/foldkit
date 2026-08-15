<script lang="ts" setup>
import { type Model, destinationForModel } from 'counters-core-example'
import {
  type CountersBrowserHost,
  addCounterMessage,
  decrementCounterMessage,
  dismissCounterDetailMessage,
  incrementCounterMessage,
  selectCounterMessage,
  showCounterFactMessage,
} from 'counters-instant-example'
import { Option } from 'effect'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { startCountersProcessor } from './processor.js'

const host = ref<CountersBrowserHost | undefined>(undefined)
const model = ref<Model | undefined>(undefined)
let stop: (() => void) | undefined

onMounted(() => {
  void startCountersProcessor().then(next => {
    host.value = next
    model.value = next.readModel()
    stop = next.subscribe(value => {
      model.value = value
    })
  })
})

onUnmounted(() => {
  stop?.()
  void host.value?.stop()
})

const destination = computed(() =>
  model.value === undefined ? undefined : destinationForModel(model.value),
)

const send = (message: Parameters<CountersBrowserHost['send']>[0]) => {
  host.value?.send(message)
}
</script>

<template>
  <main>
    <p>FOLDKIT COUNTERS</p>
    <h1>Vue</h1>
    <p v-if="model === undefined">Starting Multiple Counters…</p>
    <template v-else-if="destination?._tag === 'CounterListDestination'">
      <button type="button" @click="send(addCounterMessage(model))">
        Add counter
      </button>
      <article v-for="counter in destination.counters" :key="counter.id">
        <button type="button" @click="send(selectCounterMessage(counter.id))">
          {{ counter.id }}
        </button>
        <strong>{{ counter.counter.count }}</strong>
        <button
          type="button"
          @click="send(incrementCounterMessage(counter.id))"
        >
          +
        </button>
        <button
          type="button"
          @click="send(decrementCounterMessage(counter.id))"
        >
          -
        </button>
      </article>
    </template>
    <template v-else-if="destination?._tag === 'CounterDetailDestination'">
      <p>{{ destination.counter.id }}</p>
      <p>{{ destination.counter.counter.count }}</p>
      <button
        type="button"
        @click="send(incrementCounterMessage(destination.counter.id))"
      >
        +
      </button>
      <button
        type="button"
        @click="
          send(
            showCounterFactMessage(
              destination.counter.id,
              destination.detailPresentationId,
            ),
          )
        "
      >
        Fact
      </button>
      <button
        type="button"
        @click="
          send(
            dismissCounterDetailMessage(
              destination.counter.id,
              destination.detailPresentationId,
            ),
          )
        "
      >
        Back
      </button>
      <aside v-if="Option.isSome(destination.maybeMode)">
        {{ destination.maybeMode.value._tag }}
      </aside>
    </template>
  </main>
</template>
