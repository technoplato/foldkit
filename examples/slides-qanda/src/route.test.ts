import { Option } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import { PropositionId, ShowAll, ShowUnanswered, SlideId } from './domain'
import { simRouter, slideHref, slideRouter, urlToAppRoute } from './route'

const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(
    fromString(raw),
    () => new Error(`Failed to parse url: ${raw}`),
  )

describe('sim route', () => {
  test('parse then print round-trips /sim', () => {
    const route = urlToAppRoute(urlOrThrow('http://localhost/sim'))
    expect(route._tag).toBe('Sim')
    expect(simRouter()).toBe('/sim')
  })
})

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

  test('parse then print round-trips explore by stable id', () => {
    const href = slideHref(
      SlideId.make('04h'),
      ShowUnanswered(),
      Option.some(PropositionId.make('lock-in-vs-surface')),
    )
    expect(href).toBe(
      '/q/04h?filter=Unanswered&explore=lock-in-vs-surface',
    )
    const route = urlToAppRoute(urlOrThrow(`http://localhost${href}`))
    expect(route._tag).toBe('Slide')
    if (route._tag !== 'Slide') {
      throw new Error('expected Slide')
    }
    expect(route.slideId).toBe('04h')
    expect(route.filter).toBe('Unanswered')
    expect(route.explore).toBe('lock-in-vs-surface')
    if (route.explore === undefined) {
      throw new Error('expected explore')
    }
    expect(
      slideHref(route.slideId, ShowUnanswered(), Option.some(route.explore)),
    ).toBe(href)
  })

  test('leaving explore prints the card URL with no explore query', () => {
    expect(slideHref(SlideId.make('04h'), ShowUnanswered())).toBe(
      '/q/04h?filter=Unanswered',
    )
    expect(slideHref(SlideId.make('04h'), ShowAll())).toBe('/q/04h')
  })
})
