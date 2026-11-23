import { Interaction, Navigation } from 'foldkit'
import { App } from 'multiple-counters-core-example'

import { paintOpenTuiNavigationFrame } from '@foldkit/opentui/interaction'
import { createTestRenderer } from '@opentui/core/testing'

/** The size of the terminal a frame is painted for here. */
export const paintedScreenSize = { width: 80, height: 24 }

/**
 * Paints the Multiple Counters on OpenTUI after a list of presses, each
 * the name of a button, and returns the frame as text. The Program is
 * held in memory: nothing is read from a log or written to one.
 *
 * @example
 * ```typescript
 * await paintAt(['Open:1', 'Delete']) // the frame with 'Delete Counter 1?'
 * ```
 */
export const paintAt = async (
  presses: ReadonlyArray<string>,
): Promise<string> => {
  const held = { model: App.init()[0] }
  const bound = Interaction.bind(App, {
    readModel: () => held.model,
    subscribe: () => () => {},
    send: message => {
      held.model = App.update(held.model, message)[0]
    },
    stop: () => Promise.resolve(),
  })
  presses.forEach(tag => {
    bound.press(tag)
  })
  const { renderer, renderOnce, captureCharFrame } =
    await createTestRenderer(paintedScreenSize)
  const frame = Navigation.frameOf(bound)
  if (frame._tag === 'None') {
    throw new Error('Expected a frame')
  }
  renderer.root.add(
    paintOpenTuiNavigationFrame(
      renderer,
      Interaction.terminalFrameOf(frame.value, Interaction.noTerminalFocus),
      {
        onPress: () => {},
        onChoose: () => {},
        onDismiss: () => {},
      },
    ),
  )
  await renderOnce()
  const painted = captureCharFrame()
  renderer.destroy()
  return painted
}
