import { describe, expect, it } from 'vitest'

import { stallWatch } from './stalls.js'

type Note = Readonly<Record<string, unknown>>

// A clock and a timer the test moves by hand. A timer that is due fires
// when the test lets the thread run again, as a real one does after the
// JavaScript thread was held.
const world = () => {
  const state: {
    nowMs: number
    due: Array<{ atMs: number; run: () => void }>
  } = { nowMs: 0, due: [] }
  const said: Array<Note> = []
  const freeFor = (ms: number): void => {
    const until = state.nowMs + ms
    for (;;) {
      const next = state.due
        .filter(timer => timer.atMs <= until)
        .sort((a, b) => a.atMs - b.atMs)[0]
      if (next === undefined) {
        break
      }
      state.due = state.due.filter(timer => timer !== next)
      state.nowMs = Math.max(state.nowMs, next.atMs)
      next.run()
    }
    state.nowMs = until
  }
  const heldFor = (ms: number): void => {
    state.nowMs += ms
  }
  const watch = stallWatch({
    everyMs: 200,
    atLeastMs: 400,
    now: () => state.nowMs,
    setTimer: (run, afterMs) => {
      state.due.push({ atMs: state.nowMs + afterMs, run })
    },
    say: note => {
      said.push(note)
    },
  })
  return { said, freeFor, heldFor, watch }
}

describe('a record of each time a phone app’s JavaScript was held', () => {
  it('says nothing while the thread keeps answering', () => {
    const { said, freeFor } = world()
    freeFor(5_000)
    expect(said).toEqual([])
  })

  it('says how long the thread was held, and what was laid out meanwhile', () => {
    const { said, freeFor, heldFor, watch } = world()
    freeFor(1_000)
    watch.noteLaidOut({ part: 'PlayerPage' })
    watch.noteLaidOut({ part: 'PlayerPage', passages: 29 })
    watch.noteLaidOut({ part: 'LibraryPage', rows: 65 })
    heldFor(1_800)
    freeFor(1)

    expect(said).toEqual([
      {
        stall: {
          heldMs: 1_600,
          laidOut: [
            { part: 'PlayerPage', times: 2, passages: 29 },
            { part: 'LibraryPage', times: 1, rows: 65 },
          ],
        },
      },
    ])
  })

  it('says how long each part took to lay out, added up, so a hold says how much of it was drawing', () => {
    const { said, freeFor, heldFor, watch } = world()
    freeFor(1_000)
    watch.noteLaidOut({ part: 'PlayerPage', ms: 310.4, passages: 32 })
    watch.noteLaidOut({ part: 'PlayerPage', ms: 120.2, passages: 32 })
    watch.noteLaidOut({ part: 'TitlePage', ms: 8 })
    heldFor(1_800)
    freeFor(1)

    expect(said).toEqual([
      {
        stall: {
          heldMs: 1_600,
          laidOut: [
            { part: 'PlayerPage', times: 2, ms: 431, passages: 32 },
            { part: 'TitlePage', times: 1, ms: 8 },
          ],
        },
      },
    ])
  })

  it('names nothing laid out when the thread was held by something else', () => {
    const { said, freeFor, heldFor } = world()
    freeFor(1_000)
    heldFor(900)
    freeFor(1)
    expect(said).toEqual([{ stall: { heldMs: 700, laidOut: [] } }])
  })

  it('forgets what was laid out before, once the thread has answered', () => {
    const { said, freeFor, heldFor, watch } = world()
    watch.noteLaidOut({ part: 'LibraryPage', rows: 65 })
    freeFor(1_000)
    heldFor(900)
    freeFor(1)
    expect(said).toEqual([{ stall: { heldMs: 700, laidOut: [] } }])
  })

  it('does not call the app asleep in the background a stall', () => {
    const { said, freeFor, heldFor } = world()
    freeFor(1_000)
    heldFor(120_000)
    freeFor(1_000)
    expect(said).toEqual([])
  })

  it('stops when told to', () => {
    const { said, freeFor, heldFor, watch } = world()
    watch.stop()
    freeFor(1_000)
    heldFor(900)
    freeFor(1)
    expect(said).toEqual([])
  })
})
