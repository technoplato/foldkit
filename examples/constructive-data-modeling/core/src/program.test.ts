import { describe, expect, it } from 'vitest'

import {
  constructiveDataModelingDeck,
  pageLandmarks,
  revealForPage,
  revealPageForPlaybackSeconds,
  revealTimeline,
  slideForId,
  slideForLocation,
} from './deck.js'
import {
  AdvancedPage,
  AdvancedPageChooserSelection,
  ChangedPageChooserScope,
  ChosePageChooserTarget,
  ConfirmedPageChooser,
  ObservedPlayback,
  OpenedPageChooser,
  RewoundPage,
  SelectedRevealPage,
  SelectedSlide,
} from './message.js'
import {
  AllAuthoredPages,
  PointerControl,
  RemoteControl,
  initialModel,
} from './model.js'
import { deckPresentation } from './presentation.js'
import { update } from './update.js'

describe('ConstructiveDataModelingProgram', () => {
  it('advances and rewinds through every authored reveal page', () => {
    const [advanced] = update(
      initialModel,
      AdvancedPage({ origin: PointerControl() }),
    )
    const [rewound] = update(
      advanced,
      RewoundPage({ origin: PointerControl() }),
    )

    expect(advanced.location).toMatchObject({
      _tag: 'AuthoredPageLocation',
      page: 2,
    })
    expect(rewound.location).toEqual(initialModel.location)
  })

  it('keeps navigation total at both recording boundaries', () => {
    const [beforeOpening] = update(
      initialModel,
      RewoundPage({ origin: PointerControl() }),
    )
    const [lastPage] = update(
      initialModel,
      SelectedRevealPage({ origin: PointerControl(), page: 158 }),
    )
    const [questionAnswer] = update(
      lastPage,
      AdvancedPage({ origin: PointerControl() }),
    )
    const [afterQuestionAnswer] = update(
      questionAnswer,
      AdvancedPage({ origin: PointerControl() }),
    )

    expect(beforeOpening.location).toEqual(initialModel.location)
    expect(questionAnswer.location._tag).toBe('QuestionAnswerLocation')
    expect(afterQuestionAnswer.location).toEqual(questionAnswer.location)
  })

  it('selects the exact reveal containing an observed video time', () => {
    const [duringIor] = update(initialModel, ObservedPlayback({ seconds: 780 }))
    const [duringRevisit] = update(
      duringIor,
      ObservedPlayback({ seconds: 788 }),
    )
    const [duringQuestions] = update(
      duringRevisit,
      ObservedPlayback({ seconds: 1800 }),
    )

    expect(duringIor.location).toMatchObject({ page: 93 })
    expect(duringRevisit.location).toMatchObject({ page: 94 })
    expect(duringQuestions.location._tag).toBe('QuestionAnswerLocation')
    expect(duringQuestions.lastControl._tag).toBe('VideoPlaybackControl')
  })

  it('does not rewrite the Model for observations inside the current reveal', () => {
    const [sameModel] = update(initialModel, ObservedPlayback({ seconds: 4.9 }))
    expect(sameModel).toBe(initialModel)
  })

  it('accepts an exact authored page through the shared remote Message', () => {
    const origin = RemoteControl({
      controllerId: 'future-instant-room-member',
    })
    const [selected] = update(
      initialModel,
      SelectedRevealPage({ origin, page: 101 }),
    )

    expect(selected.location).toMatchObject({ page: 101 })
    expect(selected.lastControl).toEqual(origin)
    expect(slideForLocation(selected.location).id).toBe('type-system-purpose')
  })

  it('opens the six authored landmarks and can expose all 158 pages', () => {
    const [opened] = update(
      initialModel,
      OpenedPageChooser({ origin: PointerControl() }),
    )
    const [advanced] = update(opened, AdvancedPageChooserSelection())
    const [allPages] = update(
      advanced,
      ChangedPageChooserScope({ scope: AllAuthoredPages() }),
    )
    const [targeted] = update(allPages, ChosePageChooserTarget({ page: 101 }))
    const [confirmed] = update(targeted, ConfirmedPageChooser())

    expect(pageLandmarks).toEqual([
      { label: 'Title', page: 1 },
      { label: 'Introduction', page: 2 },
      { label: 'Static typing', page: 9 },
      { label: 'Positive space', page: 52 },
      { label: 'Obligation propagation', page: 101 },
      { label: 'Conclusion', page: 147 },
    ])
    expect(opened.pageChooser).toMatchObject({
      _tag: 'PageChooserOpen',
      selectedPage: 1,
    })
    expect(advanced.pageChooser).toMatchObject({ selectedPage: 2 })
    expect(allPages.pageChooser).toMatchObject({
      scope: { _tag: 'AllAuthoredPages' },
    })
    expect(confirmed.location).toMatchObject({ page: 101 })
    expect(confirmed.pageChooser._tag).toBe('PageChooserClosed')
  })

  it('ships 158 exact reveals, 40 authored logical states, and its Q&A tail', () => {
    const slideIds = constructiveDataModelingDeck.slides.map(slide => slide.id)

    expect(revealTimeline).toHaveLength(158)
    expect(revealForPage(101)).toMatchObject({
      startSeconds: 891,
      deepLink: 'https://youtu.be/0BXuYlNrUmE?t=891',
    })
    expect(revealPageForPlaybackSeconds(908)).toBe(103)
    expect(slideIds).toHaveLength(41)
    expect(new Set(slideIds).size).toBe(slideIds.length)
    expect(deckPresentation(initialModel)).toMatchObject({
      position: 1,
      total: 159,
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

  it('keeps logical cues and exact reveals contiguous', () => {
    const slides = constructiveDataModelingDeck.slides
    expect(slides.at(0)?.startSeconds).toBe(0)
    expect(slides.at(-1)?.endSeconds).toBe(
      constructiveDataModelingDeck.videoDurationSeconds,
    )
    expect(
      slides.every(
        (slide, index) =>
          index === slides.length - 1 ||
          slide.endSeconds === slides.at(index + 1)?.startSeconds,
      ),
    ).toBe(true)
    expect(
      revealTimeline.every(
        (reveal, index) =>
          index === revealTimeline.length - 1 ||
          reveal.endSeconds === revealTimeline.at(index + 1)?.startSeconds,
      ),
    ).toBe(true)
  })

  it('keeps direct logical-slide selection for cue rails and deep links', () => {
    const [selected] = update(
      initialModel,
      SelectedSlide({
        origin: PointerControl(),
        slideId: 'obligation-propagation-machine',
      }),
    )

    expect(selected.location).toMatchObject({ page: 114 })
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
