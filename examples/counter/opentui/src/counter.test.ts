import { describe, expect, it } from 'bun:test'
import { App, counterScreen } from 'counter-core-example'
import { Option } from 'effect'

import { paintOpenTuiFrame } from '@foldkit/opentui/interaction'
import { createTestRenderer } from '@opentui/core/testing'

const testScreenSize = { width: 72, height: 18 }

const paintFrame = async (
  count: number,
  isMenuOpen: boolean,
): Promise<string> => {
  const { renderer, renderOnce, captureCharFrame } =
    await createTestRenderer(testScreenSize)
  const closed = { ...App.init()[0], count }
  const model = isMenuOpen
    ? App.update(closed, { _tag: 'OpenedActionMenu' })[0]
    : closed
  const interaction = App.interaction
  const painted = paintOpenTuiFrame(
    renderer,
    Option.some(counterScreen({ count })),
    interaction === undefined ? Option.none() : interaction.menu(model),
    {
      onPress: () => {},
      onChoose: () => {},
      onDismiss: () => {},
    },
  )
  renderer.root.add(painted)
  await renderOnce()
  const frame = captureCharFrame()
  renderer.destroy()
  return frame
}

describe('paintOpenTuiFrame', () => {
  it('paints the count and Catalog-hinted Buttons', async () => {
    const frame = await paintFrame(0, false)
    expect(frame).toContain('0')
    expect(frame).toContain('+')
    expect(frame).toContain('-')
    expect(frame).toContain('Reset')
  })

  it('floats the presented action menu over the screen', async () => {
    const frame = await paintFrame(2, true)
    expect(frame).toContain('Actions')
    expect(frame).toContain('> Increment')
    expect(frame).toMatch(/Reset +r +Sets the count to 0/)
  })
})
