import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  bringsIntoView,
  clockPlaceAt,
  positionReportIntervalMs,
  progressFractionOf,
  spokenAt,
} from './playbackClock.js'

const playing = {
  placeSeconds: 12,
  rate: 1,
  durationSeconds: 60,
  isMarking: true,
  keepsInView: true,
}

const paused = { ...playing, rate: 0 }

// Made-up times: three sections, each with the starts of its words.
const sections = [
  { startSeconds: 5, wordStarts: [5.2, 5.6, 6.1] },
  { startSeconds: 12, wordStarts: [12.4, 12.9, 13.3] },
  { startSeconds: 40, wordStarts: [] },
]

describe('the playback clock', () => {
  it('has the place reported about once a second', () => {
    expect(positionReportIntervalMs).toBe(1000)
  })

  it('reads on from the reported place while it plays, and stays there while paused', () => {
    expect(clockPlaceAt(playing, 1_000, 1_000)).toBe(12)
    expect(clockPlaceAt(playing, 1_000, 1_450)).toBeCloseTo(12.45)
    expect(clockPlaceAt(paused, 1_000, 1_450)).toBe(12)
  })

  it('never reads more than a second and a half past a report, nor past the end', () => {
    expect(clockPlaceAt(playing, 1_000, 9_000)).toBeCloseTo(13.5)
    expect(clockPlaceAt({ ...playing, placeSeconds: 59.5 }, 1_000, 2_400)).toBe(
      60,
    )
  })

  it('says how far along the scrubber is', () => {
    expect(progressFractionOf(15, 60)).toBe(0.25)
    expect(progressFractionOf(90, 60)).toBe(1)
    expect(progressFractionOf(3, 0)).toBe(0)
  })
})

describe('the word being spoken at a place', () => {
  it('is the last word of the current section to start at or before it', () => {
    expect(spokenAt(sections, 5.7)).toEqual({
      maybeSection: Option.some(0),
      maybeWord: Option.some(1),
    })
    expect(spokenAt(sections, 13.3)).toEqual({
      maybeSection: Option.some(1),
      maybeWord: Option.some(2),
    })
  })

  it('keeps a section current through the pause after its last word', () => {
    expect(spokenAt(sections, 9)).toEqual({
      maybeSection: Option.some(0),
      maybeWord: Option.some(2),
    })
  })

  it('marks the section and no word before the section’s first word, and in a section with none', () => {
    expect(spokenAt(sections, 12.1)).toEqual({
      maybeSection: Option.some(1),
      maybeWord: Option.none(),
    })
    expect(spokenAt(sections, 41)).toEqual({
      maybeSection: Option.some(2),
      maybeWord: Option.none(),
    })
  })

  it('marks nothing before the first section', () => {
    expect(spokenAt(sections, 2)).toEqual({
      maybeSection: Option.none(),
      maybeWord: Option.none(),
    })
  })
})

describe('keeping the spoken section in view', () => {
  it('brings a section into view when the mark crosses into it, while the page follows the voice', () => {
    expect(bringsIntoView(playing, Option.some(1), Option.some(2))).toBe(true)
  })

  it('leaves the page where the listener put it once he has scrolled away', () => {
    expect(
      bringsIntoView(
        { ...playing, keepsInView: false },
        Option.some(1),
        Option.some(2),
      ),
    ).toBe(false)
  })

  it('does nothing while the mark stays in its section, or when it leaves every section', () => {
    expect(bringsIntoView(playing, Option.some(2), Option.some(2))).toBe(false)
    expect(bringsIntoView(playing, Option.some(2), Option.none())).toBe(false)
  })
})
