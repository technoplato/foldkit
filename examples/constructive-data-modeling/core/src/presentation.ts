import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  constructiveDataModelingDeck,
  revealForPage,
  slideForLocation,
} from './deck.js'
import { DeckLocation, type Model, Slide, SourceReference } from './model.js'

/** A complete renderer-neutral presentation of the synchronized deck. */
export const DeckPresentation = S.Struct({
  canAdvance: S.Boolean,
  canRewind: S.Boolean,
  currentSlide: Slide,
  location: DeckLocation,
  position: S.Int,
  total: S.Int,
})
/** A renderer-neutral synchronized deck presentation value. */
export type DeckPresentation = typeof DeckPresentation.Type

/** Returns the renderer-neutral presentation for one Model. */
export const deckPresentation = (model: Model): DeckPresentation => {
  const position = M.value(model.location).pipe(
    M.withReturnType<number>(),
    M.tagsExhaustive({
      AuthoredPageLocation: ({ page }) => page,
      QuestionAnswerLocation: () => 159,
    }),
  )
  return {
    canAdvance: position < 159,
    canRewind: position > 1,
    currentSlide: slideForLocation(model.location),
    location: model.location,
    position,
    total: 159,
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
  const slide = slideForLocation(model.location)
  return M.value(model.location).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      AuthoredPageLocation: ({ page }) => {
        const reveal = revealForPage(page)
        return M.value(slide.content).pipe(
          M.withReturnType<string>(),
          M.tagsExhaustive({
            AuthoredSlide: ({ condensedPage, summary, title }) =>
              `${title}\n${formatTimestamp(reveal.startSeconds)}–${formatTimestamp(reveal.endSeconds)} · authored page ${page.toString()}/158 · condensed slide ${condensedPage.toString()}\n${summary}\n${reveal.deepLink}`,
            QuestionAnswerSlide: () => '',
          }),
        )
      },
      QuestionAnswerLocation: () =>
        M.value(slide.content).pipe(
          M.withReturnType<string>(),
          M.tagsExhaustive({
            AuthoredSlide: () => '',
            QuestionAnswerSlide: ({ summary, title }) =>
              `${title}\n${formatTimestamp(slide.startSeconds)}–${formatTimestamp(slide.endSeconds)}\n${summary}\n${slide.deepLink}`,
          }),
        ),
    }),
  )
}

/** Renders the canonical Model for command-line and terminal hosts. */
export const terminalPresentation = (model: Model): string => {
  const presentation = deckPresentation(model)
  return `[${presentation.position.toString()}/${presentation.total.toString()}] ${compactSlideText(model)}`
}
