import { Option } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import { SlideId } from './domain'
import { slideRouter, urlToAppRoute } from './route'

const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(
    fromString(raw),
    () => new Error(`Failed to parse url: ${raw}`),
  )

describe('slide routes', () => {
  test('parse then print round-trips /q/01', () => {
    const route = urlToAppRoute(urlOrThrow('http://localhost/q/01'))
    expect(route._tag).toBe('Slide')
    if (route._tag !== 'Slide') {
      throw new Error('expected Slide')
    }
    expect(slideRouter({ slideId: route.slideId })).toBe('/q/01')
  })

  test('the printer is the only path builder', () => {
    expect(slideRouter({ slideId: SlideId.make('02') })).toBe('/q/02')
  })
})
