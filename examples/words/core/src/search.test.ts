import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import type { RecordingSummary } from './recording.js'
import { recordingsMatching, searchTermsOf } from './search.js'

const recording = (
  id: string,
  title: string,
  previewLines: ReadonlyArray<string>,
): RecordingSummary => ({
  id,
  title,
  startedAtMs: 0,
  durationSeconds: 60,
  activity: 'Idle',
  maybeDeviceIcon: Option.none(),
  previewLines,
})

const kitchen = recording('a', 'Recording 015', [
  'This is the phone recording in the kitchen.',
])
const meeting = recording('b', 'Launch Checklist', ['Good morning, everyone.'])

describe('searching recordings', () => {
  it('splits a search into lowercase words', () => {
    expect(searchTermsOf('  Kitchen  PHONE ')).toEqual(['kitchen', 'phone'])
    expect(searchTermsOf('   ')).toEqual([])
  })

  it('keeps every recording for a blank search', () => {
    expect(recordingsMatching([kitchen, meeting], ' ')).toEqual([
      kitchen,
      meeting,
    ])
  })

  it('matches titles and preview lines, needing every word', () => {
    expect(recordingsMatching([kitchen, meeting], 'kitchen')).toEqual([kitchen])
    expect(recordingsMatching([kitchen, meeting], 'launch')).toEqual([meeting])
    expect(recordingsMatching([kitchen, meeting], 'phone kitchen')).toEqual([
      kitchen,
    ])
    expect(recordingsMatching([kitchen, meeting], 'kitchen morning')).toEqual(
      [],
    )
  })
})
