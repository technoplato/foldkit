import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

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
  ResumedFollowing,
  ScrolledByReader,
  ScrolledView,
  type Sight,
  State,
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
    expect(far.state.maybeOwnScrollUntilMs).toEqual(Option.some(10_900))
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
      state: { ...initial, maybeReaderScrolledAtMs: Option.some(10_000) },
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

  it('measures the word sounding at once when the words follow again, even a moment after the reader scrolled', () => {
    const scrolled = step(initial, following, ScrolledByReader()).state
    const soon = { ...following, nowMs: 10_300 }
    expect(step(scrolled, soon, ChangedSpokenWord()).instructions).toEqual([])
    expect(step(scrolled, soon, ResumedFollowing()).instructions).toEqual([
      MeasureWord({ purpose: 'Follow' }),
    ])
  })

  it('forgets the reader’s scroll when the words follow again, so the next word is followed too', () => {
    const scrolled = step(initial, following, ScrolledByReader()).state
    const soon = { ...following, nowMs: 10_300 }
    const resumed = step(scrolled, soon, ResumedFollowing()).state
    expect(resumed).toEqual(initial)
    expect(
      step(resumed, { ...following, nowMs: 10_400 }, ChangedSpokenWord())
        .instructions,
    ).toEqual([MeasureWord({ purpose: 'Follow' })])
  })

  it('does not press leave for a look that was waiting when the words followed again', () => {
    const scrolled = step(initial, following, ScrolledByReader()).state
    const resumed = step(scrolled, following, ResumedFollowing()).state
    expect(step(resumed, following, ElapsedLeaveWait()).instructions).toEqual(
      [],
    )
  })

  it('asks for nothing on following again while the reader reads elsewhere', () => {
    expect(
      step(initial, { ...following, isFollowing: false }, ResumedFollowing())
        .instructions,
    ).toEqual([])
  })

  it('presses leave once the reader has scrolled the word sounding out of the middle', () => {
    const scrolled = step(initial, following, ScrolledByReader()).state
    expect(step(scrolled, following, ElapsedLeaveWait()).instructions).toEqual([
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
    expect(named.state.maybeOwnScrollUntilMs).toEqual(Option.some(10_900))
  })

  it('takes a scroll of the view for the reader’s, unless it just moved the view itself', () => {
    const own = { ...initial, maybeOwnScrollUntilMs: Option.some(10_900) }
    expect(step(own, following, ScrolledView())).toEqual({
      state: own,
      instructions: [],
    })
    expect(
      step(own, { ...following, nowMs: 11_000 }, ScrolledView()).state
        .maybeReaderScrolledAtMs,
    ).toEqual(Option.some(11_000))
  })

  it('remembers only plain data, so what it remembers can be written as JSON and read back', () => {
    const codec = S.toCodecJson(State)
    const scrolled = step(initial, following, ScrolledByReader()).state
    const written = JSON.stringify(S.encodeSync(codec)(scrolled))
    expect(written).not.toContain('null')
    expect(S.decodeUnknownSync(codec)(JSON.parse(written))).toEqual(scrolled)
    expect(
      S.decodeUnknownSync(codec)(
        JSON.parse(JSON.stringify(S.encodeSync(codec)(initial))),
      ),
    ).toEqual(initial)
  })
})

describe('the follow rule running for a painter', () => {
  type Wait = { atMs: number; elapsed: () => void; isOver: boolean }

  // NOTE: the wait is the painter's to give, so this painter gives one it
  // ends by hand. No timer runs, and the rule is still driven to the end.
  const painter = (
    told: Readonly<{ isFollowing: boolean; hasLeave: boolean }>,
    maybeSight: Option.Option<Sight> | undefined,
  ) => {
    const done: Array<string> = []
    const waits: Array<Wait> = []
    const clock = { nowMs: 10_000 }
    const running = start({
      now: () => clock.nowMs,
      wait: (afterMs, elapsed) => {
        const wait: Wait = {
          atMs: clock.nowMs + afterMs,
          elapsed,
          isOver: false,
        }
        waits.push(wait)
        return () => {
          wait.isOver = true
        }
      },
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
    const advance = (byMs: number): void => {
      clock.nowMs += byMs
      Array.filter(
        waits,
        wait => !wait.isOver && wait.atMs <= clock.nowMs,
      ).forEach(wait => {
        wait.isOver = true
        wait.elapsed()
      })
    }
    return { done, running, advance }
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
    const { done, running, advance } = painter(
      { isFollowing: true, hasLeave: true },
      undefined,
    )
    running.tell(ChangedSpokenWord())
    running.tell(ScrolledByReader())
    advance(400)
    expect(done).toEqual([])
  })

  it('presses leave a moment after the reader scrolls the word away, once for one scroll', () => {
    const { done, running, advance } = painter(
      { isFollowing: true, hasLeave: true },
      Option.some(away),
    )
    running.tell(ScrolledByReader())
    advance(100)
    running.tell(ScrolledByReader())
    advance(200)
    expect(done).toEqual([])
    advance(100)
    expect(done).toEqual(['leave'])
  })

  it('says and does nothing once stopped, and drops the wait it was holding', () => {
    const { done, running, advance } = painter(
      { isFollowing: true, hasLeave: true },
      Option.some(away),
    )
    running.tell(ScrolledByReader())
    running.stop()
    advance(400)
    running.tell(ChangedSpokenWord())
    expect(done).toEqual([])
  })
})
