import { Option } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import {
  AppPage,
  BuildPage,
  type Destination,
  Home,
  IssuesPage,
  MethodPage,
  MetricPage,
  NotFound,
  destinationPath,
  urlToDestination,
} from './route'

const parse = (path: string): Destination =>
  urlToDestination(
    Option.getOrThrow(fromString(`https://performance.example${path}`)),
  )

const destinations: ReadonlyArray<readonly [Destination, string]> = [
  [Home(), '/'],
  [AppPage({ appId: 'scribe', scope: Option.none() }), '/apps/scribe'],
  [
    AppPage({ appId: 'scribe-mac', scope: Option.some('NotRecording') }),
    '/apps/scribe-mac?scope=NotRecording',
  ],
  [BuildPage({ appId: 'scribe', build: '270' }), '/apps/scribe/builds/270'],
  [
    MetricPage({
      appId: 'scribe',
      metricId: 'cpu-front',
      scope: Option.none(),
    }),
    '/apps/scribe/metrics/cpu-front',
  ],
  [
    MetricPage({
      appId: 'scribe-ipad',
      metricId: 'hitches-notes',
      scope: Option.some('CannedAudio'),
    }),
    '/apps/scribe-ipad/metrics/hitches-notes?scope=CannedAudio',
  ],
  [IssuesPage(), '/issues'],
  [MethodPage(), '/method'],
]

describe('a destination and its URL are one pair', () => {
  test.each(destinations)('%o prints as its path', (destination, path) => {
    expect(destinationPath(destination)).toBe(path)
  })

  test.each(destinations)(
    '%o parses back from its path',
    (destination, path) => {
      expect(parse(path)).toStrictEqual(destination)
    },
  )

  test('printing a parsed URL gives its canonical path', () => {
    expect(destinationPath(parse('/apps/scribe/builds/270/'))).toBe(
      '/apps/scribe/builds/270',
    )
  })

  test('a scope the page does not know is not a page', () => {
    expect(parse('/apps/scribe?scope=Sleeping')._tag).toBe('NotFound')
  })

  test('a path no page answers keeps its path', () => {
    expect(parse('/apps/scribe/nowhere')).toStrictEqual(
      NotFound({ path: '/apps/scribe/nowhere' }),
    )
  })
})
