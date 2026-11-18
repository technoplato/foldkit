import { Option } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import {
  type Destination,
  Home,
  NotFound,
  UnderstandingPage,
  destinationPath,
  urlToDestination,
} from './route'

const parse = (path: string): Destination =>
  urlToDestination(Option.getOrThrow(fromString(`https://me.example${path}`)))

const destinations: ReadonlyArray<readonly [Destination, string]> = [
  [Home(), '/'],
  [UnderstandingPage(), '/understanding'],
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
    expect(destinationPath(parse('/understanding/'))).toBe('/understanding')
  })

  test('no path names a user: a user is only who signed in', () => {
    expect(parse('/users/owner@example.com')).toStrictEqual(
      NotFound({ path: '/users/owner@example.com' }),
    )
  })
})
