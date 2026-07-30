import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  contributingPath,
  IssueLogReference,
  LogContributingPath,
  LogEvent,
  ruledOutPath,
  SourceLocation,
  suspectedPath,
  withInferredIssueReferences,
} from './domain.js'

describe('logging domain', () => {
  it('round-trips structured level, timestamp, quote, and source provenance', () => {
    const event = LogEvent.make({
      category: 'transcript',
      contributingPaths: [
        LogContributingPath.make({
          path: 'Sources/RecordingFeature/Recording.swift',
          reason: Option.none(),
          relationship: 'Suspected',
        }),
      ],
      directQuote: Option.some('text gets cut off and does not wrap properly'),
      id: 'log-001',
      issueReferences: [],
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

  it('tags Issue mentions immediately with canonical viewer links', () => {
    const event = withInferredIssueReferences(
      LogEvent.make({
        category: 'issues',
        directQuote: Option.none(),
        id: 'log-041',
        level: 'Info',
        message: 'Investigating #041 and issue-23.',
        metadata: {},
        name: 'issue.investigation.started',
        source: Option.none(),
        timestampMs: 1_753_825_167_000,
      }),
    )

    expect(event.issueReferences).toEqual([
      IssueLogReference.make({
        issueID: '023',
        viewerURL: 'https://issues.knophy.com/issues/023',
      }),
      IssueLogReference.make({
        issueID: '041',
        viewerURL: 'https://issues.knophy.com/issues/041',
      }),
    ])
  })

  it('marks source paths with ergonomic relationships and optional reasons', () => {
    expect(suspectedPath('Sources/Recording.swift', 'route may diverge')).toEqual(
      LogContributingPath.make({
        path: 'Sources/Recording.swift',
        reason: Option.some('route may diverge'),
        relationship: 'Suspected',
      }),
    )
    expect(contributingPath('Sources/AudioCapture.swift').relationship).toBe(
      'Contributing',
    )
    expect(ruledOutPath('Sources/Transcript.swift').relationship).toBe(
      'RuledOut',
    )
  })
})
