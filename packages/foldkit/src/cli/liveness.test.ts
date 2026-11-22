import { describe, expect, it } from 'vitest'

import {
  DEFAULT_IDLE_GRACE_MS,
  holdsOf,
  isGraceOver,
  isWorking,
  keptWorkingSentence,
  quietAfter,
  quietSince,
} from './liveness.js'

const nothing = { reasons: [], followers: 0, askedAtMs: 0 }

describe('when a Background Processor may stop', () => {
  it('waits the whole grace with nothing to do, then stops', () => {
    const quiet = quietSince(1_000)
    expect(
      isGraceOver(
        quiet,
        1_000 + DEFAULT_IDLE_GRACE_MS - 1,
        DEFAULT_IDLE_GRACE_MS,
      ),
    ).toBe(false)
    expect(
      isGraceOver(quiet, 1_000 + DEFAULT_IDLE_GRACE_MS, DEFAULT_IDLE_GRACE_MS),
    ).toBe(true)
  })

  it('starts the wait over while the Program has work going on', () => {
    const playing = quietAfter(quietSince(0), {
      ...nothing,
      nowMs: 3_600_000,
      reasons: ['The Lantern Keeper is in the player'],
    })
    expect(playing).toEqual({ sinceMs: 3_600_000 })
    expect(isGraceOver(playing, 3_600_000, DEFAULT_IDLE_GRACE_MS)).toBe(false)
  })

  it('starts the wait over while a view is attached, and says so', () => {
    const heard = { ...nothing, nowMs: 900_000, followers: 2 }
    expect(quietAfter(quietSince(0), heard)).toEqual({ sinceMs: 900_000 })
    expect(holdsOf(heard)).toEqual(['2 views are attached'])
    expect(holdsOf({ ...heard, followers: 1 })).toEqual(['a view is attached'])
  })

  it('counts the grace from the last command, not from the start', () => {
    const quiet = quietAfter(quietSince(0), {
      ...nothing,
      nowMs: 500_000,
      askedAtMs: 450_000,
    })
    expect(quiet).toEqual({ sinceMs: 450_000 })
    expect(isGraceOver(quiet, 600_000, DEFAULT_IDLE_GRACE_MS)).toBe(false)
    expect(isGraceOver(quiet, 1_050_000, DEFAULT_IDLE_GRACE_MS)).toBe(true)
  })

  it('keeps counting once the work is done, from the last moment it was going on', () => {
    const playing = quietAfter(quietSince(0), {
      ...nothing,
      nowMs: 100_000,
      reasons: ['a title is in the player'],
    })
    const after = quietAfter(playing, { ...nothing, nowMs: 130_000 })
    expect(after).toEqual({ sinceMs: 100_000 })
  })
})

describe('when a Background Processor makes way for another build', () => {
  it('makes way when its Program names no work', () => {
    expect(isWorking([])).toBe(false)
  })

  it('stays while its Program has work going on', () => {
    expect(isWorking(['a broadcast is on air'])).toBe(true)
  })

  it('says which work keeps it, that it answered, and how to end it now', () => {
    expect(
      keptWorkingSentence('publisher', [
        'a broadcast is on air',
        'a clip is uploading',
      ]),
    ).toBe(
      'The publisher Background Processor is another build and was not replaced, because it is working: a broadcast is on air; a clip is uploading. It answered this command. The first command after that work ends replaces it. `publisher stop` ends it now.',
    )
  })
})
