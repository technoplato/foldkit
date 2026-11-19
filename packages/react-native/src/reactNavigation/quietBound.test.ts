import { describe, expect, it } from 'vitest'

import { quietWhile } from './quietBound.js'

const program = () => {
  const state = { model: 0 }
  const listeners = new Set<() => void>()
  return {
    bound: {
      readModel: () => state.model,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      press: (tag: string) => tag === 'Pause',
    },
    change: () => {
      state.model += 1
      listeners.forEach(listener => {
        listener()
      })
    },
    listenerCount: () => listeners.size,
  }
}

describe('a screen that is out of sight', () => {
  it('hears every change of the Model while it is in sight', () => {
    const running = program()
    const quiet = quietWhile(running.bound, () => false)
    const heard: Array<unknown> = []
    quiet.bound.subscribe(() => {
      heard.push(quiet.bound.readModel())
    })

    running.change()
    running.change()

    expect(heard).toEqual([1, 2])
  })

  it('hears nothing while it is covered, and keeps reading the Model it last showed', () => {
    const running = program()
    const sight = { isCovered: false }
    const quiet = quietWhile(running.bound, () => sight.isCovered)
    const heard: Array<unknown> = []
    quiet.bound.subscribe(() => {
      heard.push(quiet.bound.readModel())
    })

    running.change()
    sight.isCovered = true
    running.change()
    running.change()

    expect(heard).toEqual([1])
    expect(quiet.bound.readModel()).toBe(1)
  })

  it('hears once, of the Model as it is now, when it comes back into sight', () => {
    const running = program()
    const sight = { isCovered: true }
    const quiet = quietWhile(running.bound, () => sight.isCovered)
    const heard: Array<unknown> = []
    quiet.bound.subscribe(() => {
      heard.push(quiet.bound.readModel())
    })

    running.change()
    running.change()
    running.change()
    sight.isCovered = false
    quiet.wake()

    expect(heard).toEqual([3])
  })

  it('hears nothing on coming back when nothing changed meanwhile', () => {
    const running = program()
    const sight = { isCovered: true }
    const quiet = quietWhile(running.bound, () => sight.isCovered)
    const heard: Array<unknown> = []
    quiet.bound.subscribe(() => {
      heard.push(quiet.bound.readModel())
    })

    sight.isCovered = false
    quiet.wake()

    expect(heard).toEqual([])
  })

  it('still presses, and stops listening when its listener leaves', () => {
    const running = program()
    const quiet = quietWhile(running.bound, () => false)
    const stop = quiet.bound.subscribe(() => undefined)

    expect(quiet.bound.press('Pause')).toBe(true)
    expect(running.listenerCount()).toBe(1)
    stop()
    expect(running.listenerCount()).toBe(0)
  })
})
