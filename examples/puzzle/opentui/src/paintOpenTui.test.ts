import { describe, expect, it } from 'bun:test'
import { demoModel, emptyModel, puzzleScreen } from 'puzzle-core-example'

import { createTestRenderer } from '@opentui/core/testing'

import { puzzleKeysForToken } from './client.js'
import { paintOpenTui, paintOpenTuiFrame } from './paintOpenTui.js'

const testScreenSize = { width: 80, height: 24 }

const paintFrame = async (
  model: ReturnType<typeof emptyModel>,
): Promise<string> => {
  const { renderer, renderOnce, captureCharFrame } =
    await createTestRenderer(testScreenSize)
  const painted = paintOpenTui(renderer, puzzleScreen(model), {
    keysForToken: puzzleKeysForToken,
    onTap: () => {},
  })
  renderer.root.add(painted)
  await renderOnce()
  const frame = captureCharFrame()
  renderer.destroy()
  return frame
}

describe('paintOpenTui', () => {
  it('paints the empty tape and key-hinted Buttons from the screen tree', async () => {
    const frame = await paintFrame(emptyModel())

    expect(frame).toContain('/puzzle#next')
    expect(frame).toContain('https://puzzle.knophy.com')
    expect(frame).toContain('https://replicate.knophy.com')
    expect(frame).toContain('https://grok.knophy.com')
    expect(frame).toContain('[y] yes')
    expect(frame).toContain('[n] no')
    expect(frame).toContain('[h] hint')
    expect(frame).toContain('[o] operator')
    expect(frame).toContain('[replicate] replicate')
    expect(frame).not.toContain('github.com')
  })

  it('hides reset at empty because the tree already filtered it', async () => {
    const frame = await paintFrame(emptyModel())

    expect(frame).not.toContain('[r] reset')
  })

  it('paints reset with its key hint on the demo tape', async () => {
    const frame = await paintFrame(demoModel())

    expect(frame).toContain('[r] reset')
    expect(frame).toContain('https://puzzle.knophy.com/replicate.sh')
    expect(frame).not.toContain('[y] yes')
  })

  it('floats the Action menu over the product tree', async () => {
    const { renderer, renderOnce, captureCharFrame } =
      await createTestRenderer(testScreenSize)
    const painted = paintOpenTuiFrame(
      renderer,
      puzzleScreen(emptyModel()),
      {
        focus: 0,
        rows: [
          { token: 'yes', disabled: false, label: '[ y ] yes' },
          { token: 'no', disabled: false, label: '[ n ] no' },
          {
            token: 'reset',
            disabled: true,
            label: '[ r ] reset: tape is already empty',
          },
        ],
        onDismiss: () => {},
        onSelect: () => {},
      },
      {
        keysForToken: puzzleKeysForToken,
        onTap: () => {},
      },
    )
    renderer.root.add(painted)
    await renderOnce()
    const frame = captureCharFrame()
    renderer.destroy()

    expect(frame).toContain('Actions')
    expect(frame).toContain('> [ y ] yes')
    expect(frame).toContain('[?] open  [esc] close')
    expect(frame).not.toContain('action-menu:yes')
  })
})
