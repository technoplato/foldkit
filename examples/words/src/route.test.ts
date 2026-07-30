import { describe, expect, it } from 'vitest'

import {
  InvalidWordsRoute,
  RecordingSegmentRoute,
  dataPathForRoute,
  pathToWordsRoute,
} from './route.js'

describe('Words route', () => {
  it('parses exactly one recording and segment-range pair', () => {
    expect(pathToWordsRoute('/recording-123/segment-range-456')).toEqual(
      RecordingSegmentRoute.make({
        recordingID: 'recording-123',
        segmentRangeID: 'segment-range-456',
      }),
    )
    expect(pathToWordsRoute('/recording-123/segment-range-456/extra')).toEqual(
      InvalidWordsRoute.make({
        path: '/recording-123/segment-range-456/extra',
      }),
    )
    expect(pathToWordsRoute('/')).toEqual(InvalidWordsRoute.make({ path: '/' }))
  })

  it('builds the same-origin data endpoint from the typed route', () => {
    const route = RecordingSegmentRoute.make({
      recordingID: 'recording-123',
      segmentRangeID: 'segment-range-456',
    })

    expect(dataPathForRoute(route)).toBe(
      '/recording-123/segment-range-456/data.json',
    )
  })
})
