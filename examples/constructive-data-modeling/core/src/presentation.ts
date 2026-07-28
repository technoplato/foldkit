import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  constructiveDataModelingDeck,
  positionForSlideId,
  slideForId,
} from './deck.js'
import { type Model, Slide, SourceReference } from './model.js'

/** A complete renderer-neutral presentation of the current synchronized deck. */
export const DeckPresentation = S.Struct({
  canAdvance: S.Boolean,
  canRewind: S.Boolean,
  currentSlide: Slide,
  position: S.Int,
  total: S.Int,
})
/** A renderer-neutral synchronized deck presentation value. */
export type DeckPresentation = typeof DeckPresentation.Type

/** Returns the renderer-neutral presentation for one Model. */
export const deckPresentation = (model: Model): DeckPresentation => {
  const position = positionForSlideId(model.currentSlideId)
  return {
    canAdvance: position < constructiveDataModelingDeck.slides.length,
    canRewind: position > 1,
    currentSlide: slideForId(model.currentSlideId),
    position,
    total: constructiveDataModelingDeck.slides.length,
  }
}

/** Returns one primary source by its stable identity. */
export const sourceForId = (
  sourceId: (typeof constructiveDataModelingDeck.sources)[number]['id'],
): SourceReference =>
  Option.getOrThrow(
    Array.findFirst(
      constructiveDataModelingDeck.sources,
      source => source.id === sourceId,
    ),
  )

/** Formats recording seconds as a stable minutes-and-seconds locator. */
export const formatTimestamp = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes.toString()}:${remainder.toString().padStart(2, '0')}`
}

const compactSlideText = (model: Model): string => {
  const slide = slideForId(model.currentSlideId)
  const timing = `${formatTimestamp(slide.startSeconds)}–${formatTimestamp(slide.endSeconds)}`
  return M.value(slide.content).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      AuthoredSlide: ({
        condensedPage,
        revealEndPage,
        revealStartPage,
        summary,
        title,
      }) =>
        `${title}\n${timing} · authored slide ${condensedPage.toString()} · reveals ${revealStartPage.toString()}–${revealEndPage.toString()}\n${summary}\n${slide.deepLink}`,
      QuestionAnswerSlide: ({ summary, title }) =>
        `${title}\n${timing}\n${summary}\n${slide.deepLink}`,
    }),
  )
}

/** Renders the canonical Model for command-line and terminal hosts. */
export const terminalPresentation = (model: Model): string => {
  const presentation = deckPresentation(model)
  return `[${presentation.position.toString()}/${presentation.total.toString()}] ${compactSlideText(model)}`
}
