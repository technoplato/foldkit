import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  constructiveDataModelingDeck,
  positionForSlideId,
  slideForId,
} from './deck.js'
import { type Model, Slide, SourceReference } from './model.js'

/** A complete renderer-neutral presentation of the current deck state. */
export const DeckPresentation = S.Struct({
  canAdvance: S.Boolean,
  canRewind: S.Boolean,
  currentSlide: Slide,
  position: S.Int,
  total: S.Int,
})
/** A renderer-neutral deck presentation value. */
export type DeckPresentation = typeof DeckPresentation.Type

/** Returns the renderer-neutral presentation for one Model. */
export const deckPresentation = (model: Model): DeckPresentation => {
  const position = positionForSlideId(model.currentSlideId)
  return {
    canAdvance: model.currentSlideId !== 'sources',
    canRewind: model.currentSlideId !== 'opening',
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

const compactSlideText = (model: Model): string => {
  const content = slideForId(model.currentSlideId).content
  return M.value(content).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      TitleSlide: ({ speaker, subtitle, title }) =>
        `${title}\n${subtitle}\n${speaker}`,
      PrincipleSlide: ({ points, statement, title }) =>
        `${title}\n${statement}\n• ${Array.join(points, '\n• ')}`,
      ComparisonSlide: ({ after, before, title }) =>
        `${title}\n${before.label}: ${before.consequence}\n${after.label}: ${after.consequence}`,
      FlowSlide: ({ steps, title }) =>
        `${title}\n${Array.join(
          Array.map(steps, step => `${step.label}: ${step.detail}`),
          '\n',
        )}`,
      SourcesSlide: ({ sourceIds, title }) =>
        `${title}\n${Array.join(
          Array.map(sourceIds, sourceId => sourceForId(sourceId).url),
          '\n',
        )}`,
    }),
  )
}

/** Renders the canonical Model for command-line and terminal hosts. */
export const terminalPresentation = (model: Model): string => {
  const presentation = deckPresentation(model)
  return `[${presentation.position.toString()}/${presentation.total.toString()}] ${compactSlideText(model)}`
}
