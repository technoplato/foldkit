import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  NewRecordingRoute,
  PlaybackRoute,
  RecordingListRoute,
  RecordingRoute,
  RecordingsMapRoute,
  type ScribeRoute,
  SearchRecordingsRoute,
  SectionRoute,
  ThreadResponseRoute,
  ThreadRoute,
  formatStartSeconds,
  isRouteFocus,
  scribeRouteFromLink,
  scribeRouteToAppUrl,
  scribeRouteToPath,
  scribeRouteToShareUrl,
  shareableStartSeconds,
  startSecondsOf,
} from './link.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'
const sectionID = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'
const upperRecordingID = recordingID.toUpperCase()

describe('scribeRouteFromLink', () => {
  it('reads the same place from the https link and from both app schemes', () => {
    const path = `recording/${recordingID}/section/${sectionID}?t=41`
    const expected = SectionRoute({
      recordingID,
      sectionID,
      t: Option.some('41'),
    })

    expect(scribeRouteFromLink(`https://words.knophy.com/${path}`)).toEqual(
      Option.some(expected),
    )
    expect(scribeRouteFromLink(`scribe-shared://${path}`)).toEqual(
      Option.some(expected),
    )
    expect(scribeRouteFromLink(`scribe-shared-dev://${path}`)).toEqual(
      Option.some(expected),
    )
  })

  it('reads uppercase ids from iPhone links and normalizes them to lowercase', () => {
    expect(
      scribeRouteFromLink(`scribe-shared://recording/${upperRecordingID}`),
    ).toEqual(Option.some(RecordingRoute({ recordingID })))
  })

  it('reads every place in the link grammar', () => {
    const cases: ReadonlyArray<readonly [string, ScribeRoute]> = [
      ['https://words.knophy.com/', RecordingListRoute()],
      [
        `https://words.knophy.com/recording/${recordingID}`,
        RecordingRoute({ recordingID }),
      ],
      [
        `https://words.knophy.com/playback/${recordingID}?t=12.25`,
        PlaybackRoute({
          recordingID,
          t: Option.some('12.25'),
          focus: Option.none(),
        }),
      ],
      [
        `scribe-shared://playback/${recordingID}?t=30&focus=route`,
        PlaybackRoute({
          recordingID,
          t: Option.some('30'),
          focus: Option.some('route'),
        }),
      ],
      [
        `scribe-shared://recording/${recordingID}/thread/thread-1`,
        ThreadRoute({ recordingID, threadID: 'thread-1' }),
      ],
      [
        `scribe-shared://recording/${recordingID}/thread/thread-1/response/r2`,
        ThreadResponseRoute({
          recordingID,
          threadID: 'thread-1',
          responseID: 'r2',
        }),
      ],
      ['scribe-shared://recordings/map', RecordingsMapRoute()],
      ['scribe-shared://recordings/search', SearchRecordingsRoute()],
      ['scribe-shared://recording/new', NewRecordingRoute()],
    ]

    for (const [link, route] of cases) {
      expect(scribeRouteFromLink(link)).toEqual(Option.some(route))
    }
  })

  it('rejects other hosts, other schemes, and paths outside the grammar', () => {
    const links = [
      `https://example.com/recording/${recordingID}`,
      `http://words.knophy.com/recording/${recordingID}`,
      `mailto:someone@example.com`,
      `https://words.knophy.com/recording/not-a-uuid`,
      `scribe-shared://recording/${recordingID}/thread/bad/segment`,
      `scribe-shared://recording/${recordingID}/thread/${'x'.repeat(65)}`,
      'not a link',
    ]

    for (const link of links) {
      expect(scribeRouteFromLink(link)).toEqual(Option.none())
    }
  })
})

describe('scribeRouteToShareUrl', () => {
  it('prints the canonical https link, which parses back to the same place', () => {
    const route = SectionRoute({
      recordingID,
      sectionID,
      t: Option.some(formatStartSeconds(4)),
    })
    const link = scribeRouteToShareUrl(route)

    expect(link).toBe(
      `https://words.knophy.com/recording/${recordingID}/section/${sectionID}?t=4`,
    )
    expect(scribeRouteFromLink(link)).toEqual(Option.some(route))
  })

  it('prints a playback link with the route focus', () => {
    const route = PlaybackRoute({
      recordingID,
      t: Option.some('30'),
      focus: Option.some('route'),
    })

    expect(scribeRouteToPath(route)).toBe(
      `/playback/${recordingID}?t=30&focus=route`,
    )
  })

  it('prints the app link the iPhone opens directly', () => {
    expect(
      scribeRouteToAppUrl(RecordingRoute({ recordingID }), 'scribe-shared'),
    ).toBe(`scribe-shared://recording/${recordingID}`)
  })
})

describe('start times', () => {
  it('reads t leniently, like the iPhone', () => {
    expect(startSecondsOf(Option.some('41'))).toEqual(Option.some(41))
    expect(startSecondsOf(Option.some('12.25'))).toEqual(Option.some(12.25))
    expect(startSecondsOf(Option.some('-3'))).toEqual(Option.none())
    expect(startSecondsOf(Option.some('abc'))).toEqual(Option.none())
    expect(startSecondsOf(Option.none())).toEqual(Option.none())
  })

  it('formats whole seconds without a fraction and others to the millisecond', () => {
    expect(formatStartSeconds(41)).toBe('41')
    expect(formatStartSeconds(12.25)).toBe('12.25')
    expect(formatStartSeconds(1.23456)).toBe('1.235')
  })

  it('starts a shared link one second early, never before zero', () => {
    expect(shareableStartSeconds(5)).toBe(4)
    expect(shareableStartSeconds(10.4)).toBe(9)
    expect(shareableStartSeconds(0.5)).toBe(0)
  })

  it('shows the route only for focus=route', () => {
    expect(isRouteFocus(Option.some('route'))).toBe(true)
    expect(isRouteFocus(Option.some('map'))).toBe(false)
    expect(isRouteFocus(Option.none())).toBe(false)
  })
})
