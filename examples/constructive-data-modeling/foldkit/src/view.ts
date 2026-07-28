import {
  AdvancedSlide,
  type ComparisonColumn,
  KeyboardControl,
  type Message,
  type Model,
  PointerControl,
  RewoundSlide,
  SelectedSlide,
  type SlideContent,
  type SlideId,
  constructiveDataModelingDeck,
  deckPresentation,
  sourceForId,
} from 'constructive-data-modeling-core-example'
import { Array, Match as M, Option } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'

const sourceLink = (
  sourceId: (typeof constructiveDataModelingDeck.sources)[number]['id'],
): Html => {
  const h = html<Message>()
  const source = sourceForId(sourceId)
  return h.a(
    [
      h.Class('source-link'),
      h.Href(source.url),
      h.Key(source.id),
      h.Rel('noopener noreferrer'),
      h.Target('_blank'),
      h.Title(source.note),
    ],
    [source.label],
  )
}

const comparisonColumn = (column: ComparisonColumn, modifier: string): Html => {
  const h = html<Message>()
  return h.section(
    [h.Class(`comparison-column ${modifier}`)],
    [
      h.p([h.Class('comparison-label')], [column.label]),
      h.pre([], [h.code([], [column.code])]),
      h.p([h.Class('comparison-consequence')], [column.consequence]),
    ],
  )
}

const slideContentView = (content: SlideContent): Html => {
  const h = html<Message>()
  return M.value(content).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      TitleSlide: ({ eyebrow, speaker, subtitle, title }) =>
        h.div(
          [h.Class('title-slide')],
          [
            h.p([h.Class('eyebrow')], [eyebrow]),
            h.h1([], [title]),
            h.p([h.Class('title-statement')], [subtitle]),
            h.p([h.Class('speaker')], [speaker]),
          ],
        ),
      PrincipleSlide: ({ eyebrow, points, statement, title }) =>
        h.div(
          [h.Class('principle-slide')],
          [
            h.p([h.Class('eyebrow')], [eyebrow]),
            h.h1([], [title]),
            h.p([h.Class('principle-statement')], [statement]),
            h.ul(
              [h.Class('point-list')],
              Array.map(points, point => h.li([h.Key(point)], [point])),
            ),
          ],
        ),
      ComparisonSlide: ({ after, before, eyebrow, title }) =>
        h.div(
          [h.Class('comparison-slide')],
          [
            h.p([h.Class('eyebrow')], [eyebrow]),
            h.h1([], [title]),
            h.div(
              [h.Class('comparison-grid')],
              [
                comparisonColumn(before, 'before'),
                comparisonColumn(after, 'after'),
              ],
            ),
          ],
        ),
      FlowSlide: ({ eyebrow, steps, title }) =>
        h.div(
          [h.Class('flow-slide')],
          [
            h.p([h.Class('eyebrow')], [eyebrow]),
            h.h1([], [title]),
            h.ol(
              [h.Class('flow-list')],
              Array.map(steps, (step, index) =>
                h.li(
                  [h.Key(step.label)],
                  [
                    h.span(
                      [h.Class('flow-number')],
                      [(index + 1).toString().padStart(2, '0')],
                    ),
                    h.div([], [h.h2([], [step.label]), h.p([], [step.detail])]),
                  ],
                ),
              ),
            ),
          ],
        ),
      SourcesSlide: ({ eyebrow, sourceIds, title }) =>
        h.div(
          [h.Class('sources-slide')],
          [
            h.p([h.Class('eyebrow')], [eyebrow]),
            h.h1([], [title]),
            h.ul(
              [h.Class('source-list')],
              Array.map(sourceIds, sourceId => {
                const source = sourceForId(sourceId)
                return h.li(
                  [h.Key(source.id)],
                  [
                    sourceLink(source.id),
                    h.p([], [source.note]),
                    h.code([], [source.url]),
                  ],
                )
              }),
            ),
          ],
        ),
    }),
  )
}

const keyboardMessage = (key: string): Option.Option<Message> => {
  const origin = KeyboardControl()
  if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') {
    return Option.some(AdvancedSlide({ origin }))
  } else if (key === 'ArrowLeft' || key === 'PageUp') {
    return Option.some(RewoundSlide({ origin }))
  } else if (key === 'Home') {
    return Option.some(SelectedSlide({ origin, slideId: 'opening' }))
  } else if (key === 'End') {
    return Option.some(SelectedSlide({ origin, slideId: 'sources' }))
  } else {
    return Option.none()
  }
}

const slideRail = (currentSlideId: SlideId): Html => {
  const h = html<Message>()
  return h.nav(
    [h.AriaLabel('Choose a slide'), h.Class('slide-rail')],
    Array.map(constructiveDataModelingDeck.slides, (slide, index) =>
      h.button(
        [
          h.AriaCurrent(slide.id === currentSlideId ? 'page' : 'false'),
          h.AriaLabel(
            `${(index + 1).toString().padStart(2, '0')} · ${slide.id}`,
          ),
          h.Class(
            slide.id === currentSlideId ? 'slide-dot active' : 'slide-dot',
          ),
          h.Key(slide.id),
          h.OnClick(
            SelectedSlide({
              origin: PointerControl(),
              slideId: slide.id,
            }),
          ),
        ],
        [h.span([], [(index + 1).toString().padStart(2, '0')])],
      ),
    ),
  )
}

/** Renders the source-backed deck with Foldkit HTML. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const presentation = deckPresentation(model)
  const progress = `${(
    (presentation.position / presentation.total) *
    100
  ).toString()}%`

  return {
    title: `${presentation.currentSlide.id} | Constructive data modeling | Foldkit`,
    body: h.main(
      [
        h.Autofocus(true),
        h.Class(`deck-shell slide-${model.currentSlideId}`),
        h.OnKeyDownPreventDefault(keyboardMessage),
        h.Tabindex(0),
      ],
      [
        h.header(
          [h.Class('deck-header')],
          [
            h.div(
              [],
              [
                h.p([h.Class('deck-kicker')], ['Foldkit study deck']),
                h.p(
                  [h.Class('deck-title')],
                  [constructiveDataModelingDeck.title],
                ),
              ],
            ),
            h.div(
              [h.Class('deck-meta')],
              [
                sourceLink('recording'),
                h.span(
                  [],
                  [
                    `${presentation.position.toString()} / ${presentation.total.toString()}`,
                  ],
                ),
              ],
            ),
          ],
        ),
        h.article(
          [
            h.AriaLabel(`Slide ${presentation.position.toString()}`),
            h.Class('slide-canvas'),
          ],
          [slideContentView(presentation.currentSlide.content)],
        ),
        h.div(
          [h.Class('source-strip')],
          [
            h.span([], ['Sources']),
            ...Array.map(presentation.currentSlide.sourceIds, sourceId =>
              sourceLink(sourceId),
            ),
          ],
        ),
        slideRail(model.currentSlideId),
        h.footer(
          [h.Class('deck-controls')],
          [
            h.button(
              [
                h.AriaLabel('Previous slide'),
                h.Class('control-button previous'),
                h.Disabled(!presentation.canRewind),
                h.OnClick(RewoundSlide({ origin: PointerControl() })),
              ],
              [h.span([h.AriaHidden(true)], ['←']), h.span([], ['Previous'])],
            ),
            h.div(
              [h.Class('progress-track')],
              [h.span([h.Style({ width: progress })], [])],
            ),
            h.p([h.Class('keyboard-hint')], ['←  → · Space · Home · End']),
            h.button(
              [
                h.AriaLabel('Next slide'),
                h.Class('control-button next'),
                h.Disabled(!presentation.canAdvance),
                h.OnClick(AdvancedSlide({ origin: PointerControl() })),
              ],
              [h.span([], ['Next']), h.span([h.AriaHidden(true)], ['→'])],
            ),
          ],
        ),
      ],
    ),
  }
}
