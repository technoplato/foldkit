import { bindCounter, startCounterOn } from 'counter-core-example'
import { Runtime } from 'foldkit'
import { afterEach, describe, expect, it } from 'vitest'

import { reactive } from './reactive.js'

const handles: Array<{ stop: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map(handle => handle.stop()))
})

describe('reactive', () => {
  it('reads the bound Counter and presses through it', async () => {
    const handle = startCounterOn(Runtime.Memory({ processor: 'svelte-test' }))
    handles.push(handle)
    const counter = reactive(bindCounter(handle))
    await new Promise<void>(resolve => {
      const stop = handle.subscribe(() => {
        if (handle.readModel()._tag === 'Ready') {
          stop()
          resolve()
        }
      })
    })
    expect(counter.status._tag).toBe('Ready')
    counter.bound.press('Increment')
    const model = counter.model
    expect(model._tag === 'Ready' ? model.count : -1).toBe(1)
    counter.bound.openMenu()
    expect(counter.menu._tag).toBe('Some')
  })
})
