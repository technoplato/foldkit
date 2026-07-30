import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { LogEvent, SourceLocation } from './domain.js'

describe('logging domain', () => {
  it('round-trips structured level, timestamp, quote, and source provenance', () => {
    const event = LogEvent.make({
      category: 'transcript',
      directQuote: Option.some('text gets cut off and does not wrap properly'),
      id: 'log-001',
      level: 'Warning',
      message: 'Transcript content exceeded its available width.',
      metadata: {
        issueId: 'issue-023',
        recordingId: '265DA0E4-7F4E-40C2-B9CF-7A067D9B1F62',
      },
      name: 'transcript.wrapping.failed',
      source: Option.some(
        SourceLocation.make({
          file: 'RecordingView.swift',
          function: 'timelineSection',
          line: 243,
        }),
      ),
      timestampMs: 1_753_825_167_000,
    })

    expect(
      S.decodeUnknownSync(LogEvent)(S.encodeUnknownSync(LogEvent)(event)),
    ).toEqual(event)
  })
})
