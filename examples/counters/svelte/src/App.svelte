<script lang="ts">
  import {
    destinationForModel,
    type Model,
  } from 'counters-core-example'
  import {
    addCounterMessage,
    decrementCounterMessage,
    dismissCounterDetailMessage,
    incrementCounterMessage,
    selectCounterMessage,
    showCounterFactMessage,
    type CountersBrowserHost,
  } from 'counters-instant-example'
  import { Option } from 'effect'
  import { onDestroy, onMount } from 'svelte'

  import { startCountersProcessor } from './processor.js'

  let host: CountersBrowserHost | undefined
  let model: Model | undefined
  let stop: (() => void) | undefined

  onMount(() => {
    void startCountersProcessor().then(next => {
      host = next
      model = next.readModel()
      stop = next.subscribe(value => {
        model = value
      })
    })
  })

  onDestroy(() => {
    stop?.()
    void host?.stop()
  })

  const send = (message: Parameters<CountersBrowserHost['send']>[0]) => {
    host?.send(message)
  }
</script>

<main>
  <p>FOLDKIT COUNTERS</p>
  <h1>Svelte</h1>
  {#if model}
    {@const destination = destinationForModel(model)}
    {#if destination._tag === 'CounterListDestination'}
      <button onclick={() => send(addCounterMessage(model))} type="button">Add counter</button>
      {#each destination.counters as counter (counter.id)}
        <article>
          <button onclick={() => send(selectCounterMessage(counter.id))} type="button">
            {counter.id}
          </button>
          <strong>{counter.counter.count}</strong>
          <button onclick={() => send(incrementCounterMessage(counter.id))} type="button">+</button>
          <button onclick={() => send(decrementCounterMessage(counter.id))} type="button">-</button>
        </article>
      {/each}
    {:else if destination._tag === 'CounterDetailDestination'}
      <p>{destination.counter.id}</p>
      <p>{destination.counter.counter.count}</p>
      <button
        onclick={() => send(incrementCounterMessage(destination.counter.id))}
        type="button"
      >
        +
      </button>
      <button
        onclick={() =>
          send(
            showCounterFactMessage(
              destination.counter.id,
              destination.detailPresentationId,
            ),
          )}
        type="button"
      >
        Fact
      </button>
      <button
        onclick={() =>
          send(
            dismissCounterDetailMessage(
              destination.counter.id,
              destination.detailPresentationId,
            ),
          )}
        type="button"
      >
        Back
      </button>
      {#if Option.isSome(destination.maybeMode)}
        <aside>{destination.maybeMode.value._tag}</aside>
      {/if}
    {/if}
  {:else}
    <p>Starting Multiple Counters…</p>
  {/if}
</main>
