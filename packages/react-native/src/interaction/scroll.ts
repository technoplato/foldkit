import { createContext } from 'react'
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
  measure: (part: View, onMeasured: (y: number, height: number) => void) => void
  onUserScroll: (listener: () => void) => () => void
}>

/** The scrolling body the nearest screen frame gives its parts, if any. */
export const ScreenScrollContext = createContext<ScreenScroll | undefined>(
  undefined,
)
