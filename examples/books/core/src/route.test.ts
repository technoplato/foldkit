import { describe, expect, test } from 'vitest'

import { dune, newEarth } from './model.js'
import {
  BookAudioTarget,
  BookBothTarget,
  BookTextTarget,
  ImportTarget,
  PeopleTarget,
  SearchTarget,
  SettingsTarget,
  ShelfTarget,
  navigationTargetToPath,
  pathToNavigationTarget,
} from './route.js'

describe('books route parse/print', () => {
  const cases: ReadonlyArray<
    readonly [string, ReturnType<typeof pathToNavigationTarget>]
  > = [
    ['/', ShelfTarget.make({})],
    ['/shelf', ShelfTarget.make({})],
    [`/book/${newEarth.id}`, BookBothTarget.make({ itemId: newEarth.id })],
    [`/book/${newEarth.id}/text`, BookTextTarget.make({ itemId: newEarth.id })],
    [
      `/book/${newEarth.id}/audio`,
      BookAudioTarget.make({ itemId: newEarth.id }),
    ],
    [`/book/${newEarth.id}/both`, BookBothTarget.make({ itemId: newEarth.id })],
    ['/search', SearchTarget.make({})],
    ['/people', PeopleTarget.make({})],
    ['/settings', SettingsTarget.make({})],
    ['/import', ImportTarget.make({})],
  ]

  test('parse(print(value)) roundtrips every destination', () => {
    const targets = [
      ShelfTarget.make({}),
      BookBothTarget.make({ itemId: dune.id }),
      BookTextTarget.make({ itemId: dune.id }),
      BookAudioTarget.make({ itemId: dune.id }),
      SearchTarget.make({}),
      PeopleTarget.make({}),
      SettingsTarget.make({}),
      ImportTarget.make({}),
    ]
    for (const target of targets) {
      const printed = navigationTargetToPath(target)
      expect(pathToNavigationTarget(printed)).toStrictEqual(target)
      expect(navigationTargetToPath(pathToNavigationTarget(printed))).toBe(
        printed,
      )
    }
  })

  test('parses relative URIs and aliases into destinations', () => {
    for (const [path, target] of cases) {
      expect(pathToNavigationTarget(path)).toStrictEqual(target)
    }
  })

  test('prints canonical relative URIs', () => {
    expect(navigationTargetToPath(ShelfTarget.make({}))).toBe('/')
    expect(
      navigationTargetToPath(BookBothTarget.make({ itemId: newEarth.id })),
    ).toBe(`/book/${newEarth.id}`)
    expect(
      navigationTargetToPath(BookTextTarget.make({ itemId: newEarth.id })),
    ).toBe(`/book/${newEarth.id}/text`)
    expect(
      navigationTargetToPath(BookAudioTarget.make({ itemId: newEarth.id })),
    ).toBe(`/book/${newEarth.id}/audio`)
    expect(navigationTargetToPath(SearchTarget.make({}))).toBe('/search')
    expect(navigationTargetToPath(PeopleTarget.make({}))).toBe('/people')
    expect(navigationTargetToPath(SettingsTarget.make({}))).toBe('/settings')
    expect(navigationTargetToPath(ImportTarget.make({}))).toBe('/import')
  })

  test('canonicalizes /shelf and /book/:id/both', () => {
    expect(navigationTargetToPath(pathToNavigationTarget('/shelf'))).toBe('/')
    expect(
      navigationTargetToPath(pathToNavigationTarget(`/book/${dune.id}/both`)),
    ).toBe(`/book/${dune.id}`)
  })

  test('unknown routes fall back to the shelf', () => {
    expect(pathToNavigationTarget('/unknown')).toStrictEqual(
      ShelfTarget.make({}),
    )
  })

  test('parses the same portable route through relative and host carriers', () => {
    const relative = pathToNavigationTarget(`/book/${dune.id}/text`)
    const host = pathToNavigationTarget(
      `https://example.test/book/${dune.id}/text?x=1#hash`,
    )
    const native = pathToNavigationTarget(
      `foldkit://books/book/${dune.id}/text`,
    )
    expect(relative).toStrictEqual(BookTextTarget.make({ itemId: dune.id }))
    expect(host).toStrictEqual(relative)
    expect(native).toStrictEqual(relative)
    expect(navigationTargetToPath(relative)).toBe(`/book/${dune.id}/text`)
  })
})
