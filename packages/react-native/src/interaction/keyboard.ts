import { useEffect, useState } from 'react'
import { Keyboard, type KeyboardEvent, Platform } from 'react-native'

// KEYBOARD

/**
 * The room a screen leaves for the keyboard: how far its frame is lifted,
 * and how much room its docks keep for the home bar.
 */
export type KeyboardRoom = Readonly<{ frameLift: number; dockInset: number }>

/**
 * The room a screen leaves for a keyboard of a height. The frame, with
 * its docks, is lifted by the keyboard's height, so a field in a dock
 * stays in sight; while the keyboard is up it covers the home bar, so the
 * docks keep no room of their own for it.
 *
 * @example
 * ```typescript
 * keyboardRoomOf({ keyboardHeight: 336, bottomInset: 34 }) // { frameLift: 336, dockInset: 0 }
 * ```
 */
export const keyboardRoomOf = (
  measures: Readonly<{ keyboardHeight: number; bottomInset: number }>,
): KeyboardRoom =>
  measures.keyboardHeight > 0
    ? { frameLift: measures.keyboardHeight, dockInset: 0 }
    : { frameLift: 0, dockInset: measures.bottomInset }

/**
 * The height of the keyboard over the screen now, 0 when it is down. On
 * iOS it changes as the keyboard starts to move, so a frame moves with it.
 */
export const useKeyboardHeight = (): number => {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const isIos = Platform.OS === 'ios'
    const shown = Keyboard.addListener(
      isIos ? 'keyboardWillShow' : 'keyboardDidShow',
      (event: KeyboardEvent) => {
        setHeight(event.endCoordinates.height)
      },
    )
    const hidden = Keyboard.addListener(
      isIos ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setHeight(0)
      },
    )
    return () => {
      shown.remove()
      hidden.remove()
    }
  }, [])
  return height
}
