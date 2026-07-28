import { describe, expect, it } from 'vitest'

import { constructiveDataModelingDeck } from './deck.js'
import { AdvancedSlide, RewoundSlide, SelectedSlide } from './message.js'
import { PointerControl, RemoteControl, initialModel } from './model.js'
import { deckPresentation } from './presentation.js'
import { update } from './update.js'

describe('ConstructiveDataModelingProgram', () => {
  it('advances and rewinds through one shared Message vocabulary', () => {
    const [advanced] = update(
      initialModel,
      AdvancedSlide({ origin: PointerControl() }),
    )
    const [rewound] = update(
      advanced,
      RewoundSlide({ origin: PointerControl() }),
    )

    expect(advanced.currentSlideId).toBe('ingredients')
    expect(rewound.currentSlideId).toBe('opening')
  })

  it('keeps navigation total at both deck boundaries', () => {
    const [beforeOpening] = update(
      initialModel,
      RewoundSlide({ origin: PointerControl() }),
    )
    const [sources] = update(
      initialModel,
      SelectedSlide({
        origin: PointerControl(),
        slideId: 'sources',
      }),
    )
    const [afterSources] = update(
      sources,
      AdvancedSlide({ origin: PointerControl() }),
    )

    expect(beforeOpening.currentSlideId).toBe('opening')
    expect(afterSources.currentSlideId).toBe('sources')
  })

  it('accepts remote control through the same selected-slide Message', () => {
    const [selected] = update(
      initialModel,
      SelectedSlide({
        origin: RemoteControl({ controllerId: 'future-instant-room-member' }),
        slideId: 'obligations',
      }),
    )

    expect(selected.currentSlideId).toBe('obligations')
    expect(selected.lastControl).toEqual(
      RemoteControl({ controllerId: 'future-instant-room-member' }),
    )
  })

  it('ships a non-empty deck with stable unique slide identities', () => {
    const slideIds = constructiveDataModelingDeck.slides.map(slide => slide.id)

    expect(slideIds).toHaveLength(10)
    expect(new Set(slideIds).size).toBe(slideIds.length)
    expect(deckPresentation(initialModel)).toMatchObject({
      position: 1,
      total: 10,
      canAdvance: true,
      canRewind: false,
    })
  })

  it('keeps every slide source reference resolvable', () => {
    const sourceIds = new Set(
      constructiveDataModelingDeck.sources.map(source => source.id),
    )

    expect(
      constructiveDataModelingDeck.slides.every(slide =>
        slide.sourceIds.every(sourceId => sourceIds.has(sourceId)),
      ),
    ).toBe(true)
  })
})
