// QUIET BOUND

type Listened = Readonly<{
  readModel: () => unknown
  subscribe: (listener: () => void) => () => void
}>

/** A bound Program that hears nothing while quiet, and a way to wake it. */
export type QuietBound<Bound> = Readonly<{
  bound: Bound
  /** Tells its listeners of the Model as it is now, if it changed while quiet. */
  wake: () => void
}>

/**
 * A bound Program as a screen that may be out of sight hears it. While
 * `isQuiet` says so, its listeners are told of no change and `readModel`
 * keeps giving the Model the screen last showed, so nothing the screen
 * shows is worked out again. `wake`, called when the screen is back in
 * sight, tells the listeners once if the Model changed meanwhile. All
 * else of the bound Program is as it was: a press still presses.
 *
 * A native stack keeps the page right under the one in sight live, for
 * the swipe back to show. While a book plays the Model changes every
 * second, and without this that page works its whole view out again
 * each time for nobody to see.
 *
 * @example
 * ```typescript
 * const quiet = quietWhile(bound, () => isCovered.current)
 * // when the screen comes back into sight
 * quiet.wake()
 * ```
 */
export const quietWhile = <Bound extends Listened>(
  bound: Bound,
  isQuiet: () => boolean,
): QuietBound<Bound> => {
  const listeners = new Set<() => void>()
  const state = { shown: bound.readModel(), isBehind: false }
  const tell = (): void => {
    state.shown = bound.readModel()
    state.isBehind = false
    listeners.forEach(listener => {
      listener()
    })
  }
  return {
    bound: {
      ...bound,
      readModel: () => {
        if (!isQuiet()) {
          state.shown = bound.readModel()
        }
        return state.shown
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        const stop = bound.subscribe(() => {
          if (isQuiet()) {
            state.isBehind = true
          } else if (listeners.has(listener)) {
            state.shown = bound.readModel()
            state.isBehind = false
            listener()
          }
        })
        return () => {
          listeners.delete(listener)
          stop()
        }
      },
    },
    wake: () => {
      if (state.isBehind && !isQuiet()) {
        tell()
      }
    },
  }
}
