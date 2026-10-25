import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import type { RecordingSummary } from './recording.js'
import {
  matchedPreviewLineOf,
  recordingsMatching,
  searchTermsOf,
  textPartsOf,
} from './search.js'

const LINE_SPACING_SECONDS = 12.5

const recording = (
  id: string,
  title: string,
  lines: ReadonlyArray<string>,
): RecordingSummary => ({
  id,
  title,
  startedAtMs: 0,
  durationSeconds: 60,
  maybeUpdatedAtMs: Option.none(),
  maybeOwnerUserID: Option.none(),
  activity: 'Idle',
  maybeDeviceIcon: Option.none(),
  isLiveRoomSet: false,
  captureGaps: [],
  previewLines: lines.map((text, index) => ({
    sectionID: `${id}-section-${index}`,
    startSeconds: index * LINE_SPACING_SECONDS,
    text,
  })),
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

  it('finds the preview line that holds every word, for the row to open at', () => {
    const garden = recording('c', 'Garden Walk', [
      'Mostly on seeds and tools.',
      'Then the new rain barrel by the shed.',
    ])
    expect(matchedPreviewLineOf(garden, 'Rain  barrel')).toEqual(
      Option.some({
        sectionID: 'c-section-1',
        startSeconds: LINE_SPACING_SECONDS,
        text: 'Then the new rain barrel by the shed.',
      }),
    )
    expect(matchedPreviewLineOf(garden, 'garden seeds')).toEqual(Option.none())
    expect(matchedPreviewLineOf(garden, '  ')).toEqual(Option.none())
  })

  it('splits text into matched and unmatched runs, ignoring case and pattern characters', () => {
    expect(textPartsOf('The new Rain barrel', 'rain barrel')).toEqual([
      { text: 'The new ', isMatch: false },
      { text: 'Rain', isMatch: true },
      { text: ' ', isMatch: false },
      { text: 'barrel', isMatch: true },
    ])
    expect(textPartsOf('Costs $4.50 (maybe)', '(maybe) $4.50')).toEqual([
      { text: 'Costs ', isMatch: false },
      { text: '$4.50', isMatch: true },
      { text: ' ', isMatch: false },
      { text: '(maybe)', isMatch: true },
    ])
    expect(textPartsOf('rainbow', 'rain rainbow')).toEqual([
      { text: 'rainbow', isMatch: true },
    ])
    expect(textPartsOf('Nothing here', ' ')).toEqual([
      { text: 'Nothing here', isMatch: false },
    ])
  })
})
