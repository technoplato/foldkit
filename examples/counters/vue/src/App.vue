<script lang="ts" setup>
import { computed, ref } from 'vue'

import { useActions, useModel } from './processor.js'

const listUri = '/counters'

const counterUri = (counterId: string): string => `/counters/${counterId}`

const uri = ref(listUri)
const view = useModel(uri)
const actions = useActions(uri)

const openCounter = (counterId: string) => {
  actions.value.open(counterId)
  uri.value = counterUri(counterId)
}

const goBack = () => {
  actions.value.back()
  uri.value = listUri
}

const isReadyDetail = computed(() => {
  const snapshot = view.value
  if (snapshot._tag !== 'ReadyWindow') {
    return false
  }
  return snapshot.selectedId !== undefined && snapshot.count !== undefined
})
</script>

<template>
  <main>
    <p>FOLDKIT COUNTERS</p>
    <h1>Vue</h1>
    <p v-if="view._tag === 'StartingWindow'">
      Starting Instant Multiple Counters…
    </p>
    <template v-else-if="view._tag === 'FailedWindow'">
      <p role="alert">{{ view.error }}</p>
      <button type="button" @click="actions.signIn">Sign in with Access</button>
    </template>
    <template v-else-if="view._tag === 'ReadyWindow' && isReadyDetail">
      <p>{{ view.selectedId }}</p>
      <p>{{ view.count }}</p>
      <button type="button" @click="actions.increment">+</button>
      <button type="button" @click="actions.decrement">-</button>
      <button type="button" @click="actions.reset">Reset</button>
      <button type="button" @click="actions.showFact">Fact</button>
      <button type="button" @click="goBack">Back</button>
    </template>
    <template v-else-if="view._tag === 'ReadyWindow'">
      <button type="button" @click="actions.addCounter">Add counter</button>
      <article v-for="counter in view.counters" :key="counter.id">
        <button type="button" @click="openCounter(counter.id)">
          {{ counter.id }}
        </button>
        <strong>{{ counter.count }}</strong>
      </article>
    </template>
  </main>
</template>
