import { Processor, Runtime } from 'foldkit'
import { bindCounters, startCountersOn } from 'multiple-counters-core-example'
import { render } from 'svelte/server'
import { afterEach, describe, expect, it } from 'vitest'

import { NavigationFrame, reactive } from '@foldkit/svelte/interaction'

const handles: Array<{ stop: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map(handle => handle.stop()))
})

describe('the Multiple Counters on @foldkit/svelte', () => {
  it('paints the delete question as a Dialog over the counter page', async () => {
    const handle = startCountersOn(
      Runtime.Memory({ processor: 'svelte-test' }),
      Processor.Host.Svelte(),
    )
    handles.push(handle)
    const counters = reactive(bindCounters(handle))
    await new Promise<void>(resolve => {
      const stop = handle.subscribe(() => {
        if (handle.readModel()._tag === 'Ready') {
          stop()
          resolve()
        }
      })
    })
    counters.bound.press('OpenCounter:1')
    counters.bound.press('DeleteCounter')
    const { body } = render(NavigationFrame, { props: { program: counters } })
    expect(body).toContain('data-style="Dialog"')
    expect(body).toContain('Delete Counter 1?')
    expect(body).toContain('data-action="ConfirmDeleteCounter"')
  })
})
