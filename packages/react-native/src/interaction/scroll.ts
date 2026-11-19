import { type ReactElement, createContext } from 'react'
import type { View } from 'react-native'

/**
 * The scrolling body of a screen, as a part inside it reads and moves it:
 * where it is scrolled to, how tall its view is, where one of its parts
 * sits in it, and when a person scrolls it themselves.
 */
export type ScreenScroll = Readonly<{
  offset: () => number
  viewport: () => number
  scrollTo: (y: number) => void
  jumpTo: (y: number) => void
  measure: (part: View, onMeasured: (y: number, height: number) => void) => void
  onUserScroll: (listener: () => void) => () => void
}>

/** The scrolling body the nearest screen frame gives its parts, if any. */
export const ScreenScrollContext = createContext<ScreenScroll | undefined>(
  undefined,
)

/**
 * How a part inside a screen draws something over the whole of it, such
 * as the menu on a word: it hands the frame what to draw, and nothing to
 * take it away. The frame draws it above the body and the docks, inside
 * the same screen, so the platform's stack, its gestures and a screen
 * reader all still see one screen.
 */
export type ScreenOverlay = (overlay: ReactElement | undefined) => void

/** The overlay the nearest screen frame draws for its parts, if any. */
export const ScreenOverlayContext = createContext<ScreenOverlay | undefined>(
  undefined,
)
