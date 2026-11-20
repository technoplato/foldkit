import { Option } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BringToMiddle,
  ChangedSpokenWord,
  type Context,
  ElapsedLeaveWait,
  type FollowedWord,
  MeasureWord,
  MeasuredWord,
  NamedWord,
  PressLeave,
  ScrolledByReader,
  ScrolledView,
  type Sight,
  WaitForLeaveCheck,
  initial,
  isInMiddle,
  start,
  step,
} from './transcriptFollow.js'

const following: Context = { isFollowing: true, hasLeave: true, nowMs: 10_000 }

const inMiddle: Sight = { top: 380, bottom: 400, viewStart: 0, viewSize: 768 }

const away: Sight = { top: 2_300, bottom: 2_320, viewStart: 0, viewSize: 768 }

describe('where a word is in its view', () => {
  it('is in the middle only when the whole word is in the middle half', () => {
    expect(isInMiddle(inMiddle)).toBe(true)
    expect(isInMiddle(away)).toBe(false)
    expect(isInMiddle({ ...inMiddle, top: 180, bottom: 200 })).toBe(false)
    expect(isInMiddle({ ...inMiddle, top: 570, bottom: 590 })).toBe(false)
  })

  it('measures from where the view starts, as a phone does down its content', () => {
    const scrolled = { viewStart: 200, viewSize: 600 }
    expect(isInMiddle({ ...scrolled, top: 500, bottom: 500 })).toBe(true)
    expect(isInMiddle({ ...scrolled, top: 250, bottom: 250 })).toBe(false)
  })
})

describe('the follow rule, one fact at a time', () => {
  it('measures a newly spoken word while the words follow the voice', () => {
    expect(step(initial, following, ChangedSpokenWord())).toEqual({
      state: initial,
      instructions: [MeasureWord({ purpose: 'Follow' })],
    })
  })

  it('leaves a newly spoken word alone while the reader reads elsewhere', () => {
    expect(
      step(initial, { ...following, isFollowing: false }, ChangedSpokenWord())
        .instructions,
    ).toEqual([])
  })

  it('brings the word to the middle only when it has left it, and takes the scroll for its own', () => {
    const near = step(
      initial,
      following,
      MeasuredWord({ purpose: 'Follow', maybeSight: Option.some(inMiddle) }),
    )
    expect(near).toEqual({ state: initial, instructions: [] })
    const far = step(
      initial,
      following,
      MeasuredWord({ purpose: 'Follow', maybeSight: Option.some(away) }),
    )
    expect(far.instructions).toEqual([BringToMiddle({ word: 'Spoken' })])
    expect(far.state.ownScrollUntilMs).toBe(10_900)
  })

  it('goes to a word that has no place yet, such as one a phone has not laid out', () => {
    expect(
      step(
        initial,
        following,
        MeasuredWord({ purpose: 'Follow', maybeSight: Option.none() }),
      ).instructions,
    ).toEqual([BringToMiddle({ word: 'Spoken' })])
  })

  it('leaves the view alone for a second after the reader scrolls, four where nothing hears of leaving', () => {
    const scrolled = step(initial, following, ScrolledByReader())
    expect(scrolled).toEqual({
      state: { ...initial, readerScrolledAtMs: 10_000 },
      instructions: [WaitForLeaveCheck({ afterMs: 250 })],
    })
    const soon = { ...following, nowMs: 10_500 }
    const later = { ...following, nowMs: 11_100 }
    expect(
      step(scrolled.state, soon, ChangedSpokenWord()).instructions,
    ).toEqual([])
    expect(
      step(scrolled.state, later, ChangedSpokenWord()).instructions,
    ).toEqual([MeasureWord({ purpose: 'Follow' })])
    expect(
      step(scrolled.state, { ...later, hasLeave: false }, ChangedSpokenWord())
        .instructions,
    ).toEqual([])
    expect(
      step(
        scrolled.state,
        { ...following, hasLeave: false, nowMs: 14_000 },
        ChangedSpokenWord(),
      ).instructions,
    ).toEqual([MeasureWord({ purpose: 'Follow' })])
  })

  it('presses leave once the reader has scrolled the word sounding out of the middle', () => {
    expect(step(initial, following, ElapsedLeaveWait()).instructions).toEqual([
      MeasureWord({ purpose: 'Leave' }),
    ])
    expect(
      step(
        initial,
        following,
        MeasuredWord({ purpose: 'Leave', maybeSight: Option.some(away) }),
      ).instructions,
    ).toEqual([PressLeave()])
    expect(
      step(
        initial,
        following,
        MeasuredWord({ purpose: 'Leave', maybeSight: Option.some(inMiddle) }),
      ).instructions,
    ).toEqual([])
  })

  it('never presses leave for a Transcript that names none, or one that already reads elsewhere', () => {
    expect(
      step(initial, { ...following, hasLeave: false }, ElapsedLeaveWait())
        .instructions,
    ).toEqual([])
    expect(
      step(initial, { ...following, isFollowing: false }, ElapsedLeaveWait())
        .instructions,
    ).toEqual([])
    expect(
      step(
        initial,
        { ...following, isFollowing: false },
        MeasuredWord({ purpose: 'Leave', maybeSight: Option.some(away) }),
      ).instructions,
    ).toEqual([])
  })

  it('brings a named word to the middle whether or not the words follow', () => {
    const named = step(
      initial,
      { ...following, isFollowing: false },
      NamedWord(),
    )
    expect(named.instructions).toEqual([BringToMiddle({ word: 'Named' })])
    expect(named.state.ownScrollUntilMs).toBe(10_900)
  })

  it('takes a scroll of the view for the reader’s, unless it just moved the view itself', () => {
    const own = { ...initial, ownScrollUntilMs: 10_900 }
    expect(step(own, following, ScrolledView())).toEqual({
      state: own,
      instructions: [],
    })
    expect(
      step(own, { ...following, nowMs: 11_000 }, ScrolledView()).state
        .readerScrolledAtMs,
    ).toBe(11_000)
  })
})

describe('the follow rule running for a painter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const painter = (
    told: Readonly<{ isFollowing: boolean; hasLeave: boolean }>,
    maybeSight: Option.Option<Sight> | undefined,
  ) => {
    const done: Array<string> = []
    const running = start({
      now: () => Date.now(),
      told: () => told,
      measure: (_purpose, answer) => {
        if (maybeSight !== undefined) {
          answer(maybeSight)
        }
      },
      bringToMiddle: (word: FollowedWord) => {
        done.push(`middle:${word}`)
      },
      pressLeave: () => {
        done.push('leave')
      },
    })
    return { done, running }
  }

  it('brings a word that is away to the middle through the painter', () => {
    const { done, running } = painter(
      { isFollowing: true, hasLeave: true },
      Option.some(away),
    )
    running.tell(ChangedSpokenWord())
    expect(done).toEqual(['middle:Spoken'])
  })

  it('does nothing when the painter has no word sounding to measure', () => {
    const { done, running } = painter(
      { isFollowing: true, hasLeave: true },
      undefined,
    )
    running.tell(ChangedSpokenWord())
    running.tell(ScrolledByReader())
    vi.advanceTimersByTime(400)
    expect(done).toEqual([])
  })

  it('presses leave a moment after the reader scrolls the word away, once for one scroll', () => {
    const { done, running } = painter(
      { isFollowing: true, hasLeave: true },
      Option.some(away),
    )
    running.tell(ScrolledByReader())
    vi.advanceTimersByTime(100)
    running.tell(ScrolledByReader())
    vi.advanceTimersByTime(200)
    expect(done).toEqual([])
    vi.advanceTimersByTime(100)
    expect(done).toEqual(['leave'])
  })

  it('says and does nothing once stopped, and drops the wait it was holding', () => {
    const { done, running } = painter(
      { isFollowing: true, hasLeave: true },
      Option.some(away),
    )
    running.tell(ScrolledByReader())
    running.stop()
    vi.advanceTimersByTime(400)
    running.tell(ChangedSpokenWord())
    expect(done).toEqual([])
  })
})
