import {
  type BoundCounter,
  bindCounter,
  startCounterOn,
} from 'counter-core-example'
import { Runtime } from 'foldkit'
import { render } from 'svelte/server'
import { afterEach, describe, expect, it } from 'vitest'

import { Screen, reactive } from '@foldkit/svelte/interaction'

const counters: Array<BoundCounter> = []

afterEach(async () => {
  await Promise.all(counters.splice(0).map(counter => counter.stop()))
})

const startReadyCounter = (): Promise<BoundCounter> => {
  const counter = bindCounter(
    startCounterOn(Runtime.Memory({ processor: 'svelte-test' })),
  )
  counters.push(counter)
  return new Promise(resolve => {
    const stop = counter.subscribe(() => {
      if (counter.readModel()._tag === 'Ready') {
        stop()
        resolve(counter)
      }
    })
  })
}

describe('the Counter on @foldkit/svelte', () => {
  it('paints the canonical Counter and presses its Catalog Actions', async () => {
    const counter = reactive(await startReadyCounter())
    expect(render(Screen, { props: { program: counter } }).body).toMatch(
      /<button[^>]*data-action="Reset"[^>]*disabled[^>]*title="count is already 0"/,
    )
    counter.bound.press('Increment')
    const { body } = render(Screen, { props: { program: counter } })
    expect(body).toContain('<div aria-label="count 1" class="fk-text">1</div>')
    expect(body).not.toContain('title="count is already 0"')
  })
})
