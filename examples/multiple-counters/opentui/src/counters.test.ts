import { describe, expect, it } from 'bun:test'
import { Interaction, Navigation } from 'foldkit'
import { App } from 'multiple-counters-core-example'

import { paintOpenTuiNavigationFrame } from '@foldkit/opentui/interaction'
import { createTestRenderer } from '@opentui/core/testing'

const testScreenSize = { width: 80, height: 24 }

const paintAt = async (presses: ReadonlyArray<string>): Promise<string> => {
  let model = App.init()[0]
  const bound = Interaction.bind(App, {
    readModel: () => model,
    subscribe: () => () => {},
    send: message => {
      model = App.update(model, message)[0]
    },
    stop: () => Promise.resolve(),
  })
  presses.forEach(tag => {
    bound.press(tag)
  })
  const { renderer, renderOnce, captureCharFrame } =
    await createTestRenderer(testScreenSize)
  const frame = Navigation.frameOf(bound)
  if (frame._tag === 'None') {
    throw new Error('Expected a frame')
  }
  renderer.root.add(
    paintOpenTuiNavigationFrame(renderer, frame.value, {
      onPress: () => {},
      onChoose: () => {},
      onDismiss: () => {},
    }),
  )
  await renderOnce()
  const painted = captureCharFrame()
  renderer.destroy()
  return painted
}

describe('Multiple Counters on OpenTUI', () => {
  it('paints the list with each counter and its buttons', async () => {
    const painted = await paintAt(['AddCounter', 'Increment:2'])
    expect(painted).toContain('/counters')
    expect(painted).toContain('Counter 1')
    expect(painted).toContain('Counter 2')
    expect(painted).toContain('Add counter')
  })

  it('floats the delete question over the counter page', async () => {
    const painted = await paintAt(['OpenCounter:1', 'DeleteCounter'])
    expect(painted).toContain('/counters/1/delete/1')
    expect(painted).toContain('Delete Counter 1?')
    expect(painted).toContain('Cancel')
  })
})
