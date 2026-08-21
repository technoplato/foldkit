import { describe, expect, it } from 'bun:test'
import { Model, counterScreen } from 'counter-core-example'

import { createTestRenderer } from '@opentui/core/testing'

import { counterKeysForToken } from './client.js'
import { paintOpenTui, paintOpenTuiFrame } from './paintOpenTui.js'

const testScreenSize = { width: 64, height: 16 }

const paintFrame = async (count: number): Promise<string> => {
  const { renderer, renderOnce, captureCharFrame } =
    await createTestRenderer(testScreenSize)
  const painted = paintOpenTui(renderer, counterScreen(Model.make({ count })), {
    keysForToken: counterKeysForToken,
    onTap: () => {},
  })
  renderer.root.add(painted)
  await renderOnce()
  const frame = captureCharFrame()
  renderer.destroy()
  return frame
}

describe('paintOpenTui', () => {
  it('paints the count and key-hinted Buttons from the screen tree', async () => {
    const frame = await paintFrame(0)

    expect(frame).toContain('0')
    expect(frame).toContain('[+] increment')
    expect(frame).toContain('[-] decrement')
  })

  it('hides reset at 0 because the tree already filtered it', async () => {
    const frame = await paintFrame(0)

    expect(frame).not.toContain('reset')
  })

  it('paints reset with its key hint above 0', async () => {
    const frame = await paintFrame(2)

    expect(frame).toContain('2')
    expect(frame).toContain('[r] reset')
  })

  it('floats the Action menu over the product tree', async () => {
    const { renderer, renderOnce, captureCharFrame } =
      await createTestRenderer(testScreenSize)
    const painted = paintOpenTuiFrame(
      renderer,
      counterScreen(Model.make({ count: 0 })),
      {
        focus: 0,
        rows: [
          { token: 'increment', disabled: false, label: '[ + ] increment' },
          { token: 'decrement', disabled: false, label: '[ - ] decrement' },
          {
            token: 'reset',
            disabled: true,
            label: '[ r ] reset: count is already 0',
          },
        ],
        onDismiss: () => {},
        onSelect: () => {},
      },
      {
        keysForToken: counterKeysForToken,
        onTap: () => {},
      },
    )
    renderer.root.add(painted)
    await renderOnce()
    const frame = captureCharFrame()
    renderer.destroy()

    expect(frame).toContain('0')
    expect(frame).toContain('Actions')
    expect(frame).toContain('> [ + ] increment')
    expect(frame).toContain('[?] open  [esc] close')
    expect(frame).not.toContain('action-menu:increment')
  })
})
