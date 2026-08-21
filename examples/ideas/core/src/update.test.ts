import { Array, Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  ClickedIdea,
  ClosedIdea,
  FailedObserveIdeas,
  LoadCatalog,
  LoadedCatalog,
  ObservedIdeas,
  UpdatedQuery,
  init,
  restore,
  seedIdeas,
  update,
  visibleIdeas,
} from './index.js'

describe('update', () => {
  test('init starts loading with no selection', () => {
    const [model, commands] = init()

    expect(model.catalog._tag).toBe('LoadingCatalog')
    expect(model.selectedId).toEqual(Option.none())
    expect(commands).toEqual([LoadCatalog])
  })

  test('restore preserves the Model', () => {
    const [model] = init()
    expect(restore(model)).toStrictEqual([model, []])
  })

  test('ObservedIdeas loads Instant ideas', () => {
    const [initial] = init()
    Story.story(
      update,
      Story.with(initial),
      Story.message(
        ObservedIdeas.make({ ideas: seedIdeas, source: 'Instant' }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.source).toBe('Instant')
        expect(model.catalog).toEqual(LoadedCatalog.make({ ideas: seedIdeas }))
      }),
    )
  })

  test('FailedObserveIdeas uses the static fallback catalog', () => {
    const [initial] = init()
    Story.story(
      update,
      Story.with(initial),
      Story.message(FailedObserveIdeas.make({ reason: 'offline' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.source).toBe('StaticFallback')
        expect(model.catalog._tag).toBe('FailedCatalog')
      }),
    )
  })

  test('ClickedIdea and ClosedIdea toggle selection', () => {
    const [initial] = init()
    const maybeFirst = Array.head(seedIdeas)
    if (Option.isNone(maybeFirst)) {
      throw new Error('seed catalog is empty')
    }
    const first = maybeFirst.value
    Story.story(
      update,
      Story.with(initial),
      Story.message(ClickedIdea.make({ id: first.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.selectedId).toEqual(Option.some(first.id))
      }),
      Story.message(ClosedIdea.make({})),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.selectedId).toEqual(Option.none())
      }),
    )
  })

  test('UpdatedQuery filters visible ideas', () => {
    const [initial] = init()
    Story.story(
      update,
      Story.with(initial),
      Story.message(
        ObservedIdeas.make({ ideas: seedIdeas, source: 'Instant' }),
      ),
      Story.Command.expectNone(),
      Story.message(UpdatedQuery.make({ query: 'Gemma' })),
      Story.Command.expectNone(),
      Story.model(model => {
        const visible = visibleIdeas(model)
        expect(visible.length).toBe(1)
        const maybeIdea = Array.head(visible)
        expect(
          Option.isSome(maybeIdea) && maybeIdea.value.slug === 'gemma-iphone',
        ).toBe(true)
      }),
    )
  })
})
