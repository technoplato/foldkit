import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct } from '@foldkit/instant-tools/issues'

import {
  ListenerAnalysisConfig,
  ScribeSegmentEvent,
  analyzeScribeSegment,
} from './analysis.js'

const config = ListenerAnalysisConfig.make({
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  shareBaseUrl: 'https://issues.knophy.com',
})
const event = ScribeSegmentEvent.make({
  event: 'transcript-segment',
  initial: false,
  recordingId: 'recording-001',
  segment: {
    endTimeSeconds: 49,
    id: 'segment-007',
    isFinal: true,
    startTimeSeconds: 42,
    text: 'There is a bug: the transcript should stay aligned.',
  },
})

describe('Scribe triage analysis', () => {
  it('creates a draft with exact shareable segment bounds', () => {
    const result = analyzeScribeSegment(event, config, 1_000)
    expect(Option.isSome(result)).toBe(true)
    if (Option.isSome(result)) {
      expect(result.value).toMatchObject({
        status: 'Draft',
        product: { _tag: 'Application', id: 'scribe' },
        segment: {
          startMilliseconds: 42_000,
          endMilliseconds: 49_000,
        },
      })
      expect(result.value.segment.publicUrl).toEqual(
        Option.some(
          'https://issues.knophy.com/issues/triage#scribe-recording-001-segment-007',
        ),
      )
    }
  })

  it('does not triage the initial snapshot, partials, or ordinary speech', () => {
    expect(
      Option.isNone(
        analyzeScribeSegment(
          ScribeSegmentEvent.make({ ...event, initial: true }),
          config,
          1_000,
        ),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        analyzeScribeSegment(
          ScribeSegmentEvent.make({
            ...event,
            segment: { ...event.segment, isFinal: false },
          }),
          config,
          1_000,
        ),
      ),
    ).toBe(true)
    expect(
      Option.isNone(
        analyzeScribeSegment(
          ScribeSegmentEvent.make({
            ...event,
            segment: {
              ...event.segment,
              text: 'The list currently has three entries.',
            },
          }),
          config,
          1_000,
        ),
      ),
    ).toBe(true)
  })
})
