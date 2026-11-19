import { Effect, Layer, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  HardwareKeyboard,
  ObservedHardwareKeyboard,
  attachedHardwareKeyboard,
  hardwareKeyboardStream,
  initialKeyboard,
  updateKeyboard,
} from './keyboard.js'

const reported = (layer: Layer.Layer<never>) =>
  Effect.runPromise(
    Stream.runCollect(Stream.take(hardwareKeyboardStream, 1)).pipe(
      Effect.provide(layer),
    ),
  )

describe('whether a hardware keyboard is attached', () => {
  it('is not known to be until the host says so', () => {
    expect(initialKeyboard).toEqual({ isHardwareAttached: false })
  })

  it('is a fact the host reports, folded into state', () => {
    expect(
      updateKeyboard(
        initialKeyboard,
        ObservedHardwareKeyboard({ isAttached: true }),
      ),
    ).toEqual({ isHardwareAttached: true })
  })

  it('reaches a Program as a Message from whatever the host provides', async () => {
    expect(await reported(Layer.empty)).toEqual([
      ObservedHardwareKeyboard({ isAttached: false }),
    ])
    expect(await reported(attachedHardwareKeyboard)).toEqual([
      ObservedHardwareKeyboard({ isAttached: true }),
    ])
    expect(
      await reported(
        Layer.succeed(HardwareKeyboard, { attached: Stream.make(true) }),
      ),
    ).toEqual([ObservedHardwareKeyboard({ isAttached: true })])
  })
})
