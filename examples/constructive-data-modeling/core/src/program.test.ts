import { describe, expect, it } from 'vitest'

import {
  constructiveDataModelingDeck,
  slideForId,
  slideIdForPlaybackSeconds,
} from './deck.js'
import {
  AdvancedSlide,
  ObservedPlayback,
  RewoundSlide,
  SelectedSlide,
} from './message.js'
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

    expect(advanced.currentSlideId).toBe('about-alexis')
    expect(rewound.currentSlideId).toBe('opening-title')
  })

  it('keeps navigation total at both deck boundaries', () => {
    const [beforeOpening] = update(
      initialModel,
      RewoundSlide({ origin: PointerControl() }),
    )
    const [questionAnswer] = update(
      initialModel,
      SelectedSlide({
        origin: PointerControl(),
        slideId: 'q-and-a',
      }),
    )
    const [afterQuestionAnswer] = update(
      questionAnswer,
      AdvancedSlide({ origin: PointerControl() }),
    )

    expect(beforeOpening.currentSlideId).toBe('opening-title')
    expect(afterQuestionAnswer.currentSlideId).toBe('q-and-a')
  })

  it('selects the cue containing an observed video time', () => {
    const [duringIor] = update(initialModel, ObservedPlayback({ seconds: 780 }))
    const [duringRevisit] = update(
      duringIor,
      ObservedPlayback({ seconds: 788 }),
    )
    const [duringQuestions] = update(
      duringRevisit,
      ObservedPlayback({ seconds: 1800 }),
    )

    expect(duringIor.currentSlideId).toBe('ior-sum')
    expect(duringRevisit.currentSlideId).toBe('user-contact-sum-revisited')
    expect(duringQuestions.currentSlideId).toBe('q-and-a')
    expect(duringQuestions.lastControl._tag).toBe('VideoPlaybackControl')
  })

  it('does not rewrite the Model for observations inside the current cue', () => {
    const [sameModel] = update(initialModel, ObservedPlayback({ seconds: 4.9 }))
    expect(sameModel).toBe(initialModel)
  })

  it('accepts remote control through the same selected-slide Message', () => {
    const [selected] = update(
      initialModel,
      SelectedSlide({
        origin: RemoteControl({ controllerId: 'future-instant-room-member' }),
        slideId: 'obligation-propagation-machine',
      }),
    )

    expect(selected.currentSlideId).toBe('obligation-propagation-machine')
    expect(selected.lastControl).toEqual(
      RemoteControl({ controllerId: 'future-instant-room-member' }),
    )
  })

  it('ships the exact 40-state deck sequence plus its Q&A tail', () => {
    const slideIds = constructiveDataModelingDeck.slides.map(slide => slide.id)

    expect(slideIds).toHaveLength(41)
    expect(new Set(slideIds).size).toBe(slideIds.length)
    expect(deckPresentation(initialModel)).toMatchObject({
      position: 1,
      total: 41,
      canAdvance: true,
      canRewind: false,
    })
  })

  it('preserves the authored UserContact revisit after Ior', () => {
    expect(slideForId('ior-sum').endSeconds).toBe(
      slideForId('user-contact-sum-revisited').startSeconds,
    )
    expect(slideForId('user-contact-sum-revisited').content).toMatchObject({
      _tag: 'AuthoredSlide',
      condensedPage: 21,
      revealStartPage: 94,
      revealEndPage: 94,
    })
  })

  it('keeps cues contiguous and covers the full recording', () => {
    const slides = constructiveDataModelingDeck.slides
    expect(slides[0].startSeconds).toBe(0)
    expect(slides.at(-1)?.endSeconds).toBe(
      constructiveDataModelingDeck.videoDurationSeconds,
    )
    expect(
      slides.every(
        (slide, index) =>
          index === slides.length - 1 ||
          slide.endSeconds === slides[index + 1]?.startSeconds,
      ),
    ).toBe(true)
    expect(slideIdForPlaybackSeconds(-1)).toBe('opening-title')
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
