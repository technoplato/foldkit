import {
  type BoundBooks,
  bindBooks,
  startMadeUpBooks,
} from 'books-core-example/browser'
import { Processor } from 'foldkit'
import { Platform } from 'react-native'

const boundBooksKey = Symbol.for('foldkit.books.expo.boundBooks')

type ExpoGlobals = typeof globalThis & {
  [boundBooksKey]?: Promise<BoundBooks>
}

const expoGlobals = (): ExpoGlobals => globalThis

const expoHost = (): Processor.Host.Host =>
  Platform.OS === 'ios'
    ? Processor.Host.ExpoIos()
    : Processor.Host.ExpoAndroid()

/**
 * Starts Books once per JavaScript runtime, on the made-up library every
 * Client can open: three titles nobody wrote, with made-up words. Nobody
 * is signed in and no real library is read. Fast Refresh runs this module
 * again, so the running Books lives on `globalThis` and is reused.
 *
 * @example
 * ```typescript
 * const books = await startExpoBooks()
 * ```
 */
export const startExpoBooks = (): Promise<BoundBooks> => {
  const globals = expoGlobals()
  const existing = globals[boundBooksKey]
  if (existing !== undefined) {
    return existing
  }
  const started = startMadeUpBooks({ host: expoHost() }).then(bindBooks)
  globals[boundBooksKey] = started
  return started
}
