import { describe, expect, it } from 'bun:test'
import { App, SyncedCounter, counterScreen } from 'counter-core-example'
import { Option } from 'effect'

import { createTestRenderer } from '@opentui/core/testing'

import { paintOpenTuiFrame } from './paintOpenTui.js'

const testScreenSize = { width: 72, height: 18 }

const keysOf = (action: string): ReadonlyArray<string> =>
  (SyncedCounter.of.of.catalog?.actions ?? [])
    .filter(declaration => declaration.tag === action)
    .flatMap(declaration => declaration.meta.keys)

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
      keysOf,
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
    expect(frame).toContain('[+] increment')
    expect(frame).toContain('[-] decrement')
    expect(frame).toContain('[r] reset (count is already 0)')
  })

  it('floats the presented action menu over the screen', async () => {
    const frame = await paintFrame(2, true)
    expect(frame).toContain('Actions')
    expect(frame).toContain('> increment')
    expect(frame).toContain('reset  Sets the count to 0')
  })
})
