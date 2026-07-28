import {
  AdvancedSlide,
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
  formatTimestamp,
  sourceForId,
} from 'constructive-data-modeling-core-example'
import { Array, Match as M, Option } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'

const contentTitle = (content: SlideContent): string =>
  M.value(content).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      AuthoredSlide: ({ title }) => title,
      QuestionAnswerSlide: ({ title }) => title,
    }),
  )

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

const slideContentView = (content: SlideContent): Html => {
  const h = html<Message>()
  return M.value(content).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      AuthoredSlide: ({
        condensedPage,
        revealEndPage,
        revealStartPage,
        summary,
        title,
      }) =>
        h.div(
          [h.Class('cue-content')],
          [
            h.p([h.Class('eyebrow')], ['Authored slide']),
            h.h1([], [title]),
            h.p([h.Class('cue-summary')], [summary]),
            h.dl(
              [h.Class('cue-evidence')],
              [
                h.div(
                  [],
                  [
                    h.dt([], ['Condensed page']),
                    h.dd([], [condensedPage.toString().padStart(2, '0')]),
                  ],
                ),
                h.div(
                  [],
                  [
                    h.dt([], ['Authored reveals']),
                    h.dd(
                      [],
                      [
                        revealStartPage === revealEndPage
                          ? revealStartPage.toString()
                          : `${revealStartPage.toString()}–${revealEndPage.toString()}`,
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      QuestionAnswerSlide: ({ summary, title }) =>
        h.div(
          [h.Class('cue-content question-answer')],
          [
            h.p([h.Class('eyebrow')], ['Recording-only section']),
            h.h1([], [title]),
            h.p([h.Class('cue-summary')], [summary]),
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
    return Option.some(SelectedSlide({ origin, slideId: 'opening-title' }))
  } else if (key === 'End') {
    return Option.some(SelectedSlide({ origin, slideId: 'q-and-a' }))
  } else {
    return Option.none()
  }
}

const slideRail = (currentSlideId: SlideId): Html => {
  const h = html<Message>()
  return h.nav(
    [h.AriaLabel('Choose a synchronized talk cue'), h.Class('slide-rail')],
    Array.map(constructiveDataModelingDeck.slides, (slide, index) =>
      h.button(
        [
          h.AriaCurrent(slide.id === currentSlideId ? 'page' : 'false'),
          h.Class(
            slide.id === currentSlideId ? 'cue-marker active' : 'cue-marker',
          ),
          h.Key(slide.id),
          h.OnClick(
            SelectedSlide({
              origin: PointerControl(),
              slideId: slide.id,
            }),
          ),
          h.Title(
            `${formatTimestamp(slide.startSeconds)} · ${contentTitle(slide.content)}`,
          ),
        ],
        [
          h.span(
            [h.Class('cue-index')],
            [(index + 1).toString().padStart(2, '0')],
          ),
          h.span([h.Class('cue-time')], [formatTimestamp(slide.startSeconds)]),
          h.span(
            [h.Class('visually-hidden')],
            [
              ` of ${constructiveDataModelingDeck.slides.length.toString()}: ${contentTitle(slide.content)}`,
            ],
          ),
        ],
      ),
    ),
  )
}

const videoEmbedUrl = (): string => {
  const url = new URL(
    `https://www.youtube.com/embed/${constructiveDataModelingDeck.videoId}`,
  )
  url.searchParams.set('enablejsapi', '1')
  url.searchParams.set('origin', globalThis.location.origin)
  url.searchParams.set('playsinline', '1')
  url.searchParams.set('rel', '0')
  return url.href
}

/** Renders the exact recording beside its synchronized semantic cue deck. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const presentation = deckPresentation(model)
  const slide = presentation.currentSlide
  const progress = `${(
    (presentation.position / presentation.total) *
    100
  ).toString()}%`

  return {
    title: `${contentTitle(slide.content)} | Constructive data modeling | Foldkit`,
    body: h.main(
      [
        h.Autofocus(true),
        h.Class('deck-shell'),
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
                h.p([h.Class('deck-kicker')], ['Foldkit · video synchronized']),
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
        h.section(
          [
            h.AriaLabel('Synchronized video and slide cue'),
            h.Class('sync-stage'),
          ],
          [
            h.div(
              [h.Class('video-column')],
              [
                h.div(
                  [h.Class('video-frame')],
                  [
                    h.iframe(
                      [
                        h.Allow(
                          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
                        ),
                        h.Class('talk-player'),
                        h.Id('talk-player'),
                        h.Key('constructive-data-modeling-recording'),
                        h.Referrerpolicy('strict-origin-when-cross-origin'),
                        h.Src(videoEmbedUrl()),
                        h.Title(
                          'The Unreasonable Effectiveness of Constructive Data Modeling video',
                        ),
                      ],
                      [],
                    ),
                  ],
                ),
                h.p(
                  [h.Class('sync-note')],
                  [
                    'Play the recording and the cue follows. Choose any cue to seek the video.',
                  ],
                ),
              ],
            ),
            h.article(
              [
                h.AriaLabel(`Cue ${presentation.position.toString()}`),
                h.Class('cue-card'),
              ],
              [
                h.div(
                  [h.Class('cue-timing')],
                  [
                    h.time([], [formatTimestamp(slide.startSeconds)]),
                    h.span([], ['→']),
                    h.time([], [formatTimestamp(slide.endSeconds)]),
                  ],
                ),
                slideContentView(slide.content),
                h.a(
                  [
                    h.Class('deep-link'),
                    h.Href(slide.deepLink),
                    h.Rel('noopener noreferrer'),
                    h.Target('_blank'),
                  ],
                  ['Open this exact moment ↗'],
                ),
              ],
            ),
          ],
        ),
        slideRail(model.currentSlideId),
        h.div(
          [h.Class('source-strip')],
          [
            h.span([], ['Evidence']),
            ...Array.map(slide.sourceIds, sourceId => sourceLink(sourceId)),
          ],
        ),
        h.footer(
          [h.Class('deck-controls')],
          [
            h.button(
              [
                h.AriaLabel('Previous synchronized cue'),
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
                h.AriaLabel('Next synchronized cue'),
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
