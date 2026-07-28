import {
  AdvancedPage,
  AdvancedPageChooserSelection,
  AllAuthoredPages,
  CancelledPageChooser,
  ChangedPageChooserScope,
  ChosePageChooserTarget,
  ConfirmedPageChooser,
  KeyboardControl,
  LandmarkPages,
  type Message,
  type Model,
  OpenedPageChooser,
  PointerControl,
  RewoundPage,
  RewoundPageChooserSelection,
  SelectedRevealPage,
  SelectedSlide,
  type SlideContent,
  type SlideId,
  authoredTextForPage,
  constructiveDataModelingDeck,
  deckPresentation,
  formatTimestamp,
  pageLandmarks,
  pagesForChooserScope,
  revealForPage,
  slideForLocation,
  slideForRevealPage,
  sourceForId,
} from 'constructive-data-modeling-core-example'
import { Array, Match as M, Option, String } from 'effect'
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

const authoredPageDensityClass = (text: string): string => {
  const length = String.length(text)
  if (length > 660) {
    return 'dense'
  } else if (length > 320) {
    return 'compact'
  } else {
    return 'sparse'
  }
}

const authoredCodePattern =
  /(^|\n)\s*(?:\/\/|struct\s+[A-Z]|enum\s+[A-Z]|type\s+[A-Z][^\n=]*=|data\s+[A-Z]|record\s+[A-Z]|case class\s+[A-Z]|def\s+\w+|match\s+\w+)/m

const authoredPageView = (model: Model): Html => {
  const h = html<Message>()
  const slide = slideForLocation(model.location)
  return M.value(model.location).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      AuthoredPageLocation: ({ page }) => {
        const pageText = authoredTextForPage(page)
        const isCodePage = authoredCodePattern.test(pageText)
        return h.div(
          [h.Class('authored-page-column')],
          [
            h.div(
              [h.Class('authored-page-heading')],
              [
                h.p([h.Class('eyebrow')], ['Official authored reveal']),
                h.p(
                  [h.Class('authored-page-position')],
                  [`Page ${page.toString()} of 158`],
                ),
              ],
            ),
            h.article(
              [
                h.AriaLabel(`Authored slide page ${page.toString()}`),
                h.Class(
                  `authored-page-sheet ${authoredPageDensityClass(pageText)}${isCodePage ? ' code-page' : ''}`,
                ),
              ],
              [
                h.pre(
                  [h.Class('authored-page-text')],
                  [h.code([], [pageText])],
                ),
                h.span(
                  [h.AriaHidden(true), h.Class('authored-page-number')],
                  [page.toString()],
                ),
              ],
            ),
          ],
        )
      },
      QuestionAnswerLocation: () =>
        M.value(slide.content).pipe(
          M.withReturnType<Html>(),
          M.tagsExhaustive({
            AuthoredSlide: () => null,
            QuestionAnswerSlide: ({ summary, title }) =>
              h.article(
                [h.Class('authored-page-sheet recording-only')],
                [
                  h.p([h.Class('eyebrow')], ['Recording-only section']),
                  h.h1([], [title]),
                  h.p([h.Class('cue-summary')], [summary]),
                ],
              ),
          }),
        ),
    }),
  )
}

const slideSummary = (content: SlideContent): string =>
  M.value(content).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      AuthoredSlide: ({ summary }) => summary,
      QuestionAnswerSlide: ({ summary }) => summary,
    }),
  )

const chooserKeyboardMessage = (key: string): Option.Option<Message> => {
  if (key === 'ArrowDown' || key === 'PageDown') {
    return Option.some(AdvancedPageChooserSelection())
  } else if (key === 'ArrowUp' || key === 'PageUp') {
    return Option.some(RewoundPageChooserSelection())
  } else if (key === 'Enter') {
    return Option.some(ConfirmedPageChooser())
  } else if (key === 'Escape') {
    return Option.some(CancelledPageChooser())
  } else {
    return Option.none()
  }
}

const keyboardMessage = (model: Model, key: string): Option.Option<Message> =>
  M.value(model.pageChooser).pipe(
    M.withReturnType<Option.Option<Message>>(),
    M.tagsExhaustive({
      PageChooserOpen: () => chooserKeyboardMessage(key),
      PageChooserClosed: () => {
        const origin = KeyboardControl()
        if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') {
          return Option.some(AdvancedPage({ origin }))
        } else if (key === 'ArrowLeft' || key === 'PageUp') {
          return Option.some(RewoundPage({ origin }))
        } else if (key === 'Home') {
          return Option.some(SelectedRevealPage({ origin, page: 1 }))
        } else if (key === 'End') {
          return Option.some(SelectedSlide({ origin, slideId: 'q-and-a' }))
        } else if (key.toLowerCase() === 'g') {
          return Option.some(OpenedPageChooser({ origin }))
        } else {
          return Option.none()
        }
      },
    }),
  )

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

const landmarkLabelForPage = (page: number): Option.Option<string> =>
  Option.map(
    Array.findFirst(pageLandmarks, landmark => landmark.page === page),
    landmark => landmark.label,
  )

const pageChoiceLabel = (
  page: (typeof pageLandmarks)[number]['page'],
): string =>
  Option.getOrElse(landmarkLabelForPage(page), () =>
    contentTitle(slideForRevealPage(page).content),
  )

const pageChooserView = (model: Model): Html => {
  const h = html<Message>()
  return M.value(model.pageChooser).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      PageChooserClosed: () => null,
      PageChooserOpen: ({ scope, selectedPage }) => {
        const isAllPages = scope._tag === 'AllAuthoredPages'
        const pages = pagesForChooserScope(scope)
        return h.div(
          [h.Class('page-chooser-backdrop')],
          [
            h.section(
              [
                h.AriaLabelledBy('page-chooser-title'),
                h.AriaModal(true),
                h.Class('page-chooser'),
                h.Role('dialog'),
              ],
              [
                h.div(
                  [h.Class('page-chooser-heading')],
                  [
                    h.div(
                      [],
                      [
                        h.p([h.Class('eyebrow')], ['Authored navigation']),
                        h.h2([h.Id('page-chooser-title')], ['Goto Page']),
                      ],
                    ),
                    h.p(
                      [h.Class('chooser-selection')],
                      [
                        `Page ${selectedPage.toString()} · ${formatTimestamp(revealForPage(selectedPage).startSeconds)}`,
                      ],
                    ),
                  ],
                ),
                h.div(
                  [
                    h.AriaLabel('Authored pages'),
                    h.Class('page-choice-list'),
                    h.Role('listbox'),
                  ],
                  Array.map(pages, page =>
                    h.button(
                      [
                        h.AriaSelected(page === selectedPage),
                        h.Class(
                          page === selectedPage
                            ? 'page-choice selected'
                            : 'page-choice',
                        ),
                        h.Key(page.toString()),
                        h.OnClick(ChosePageChooserTarget({ page })),
                        h.Role('option'),
                      ],
                      [
                        h.span(
                          [h.Class('page-choice-number')],
                          [page.toString()],
                        ),
                        h.span(
                          [h.Class('page-choice-title')],
                          [pageChoiceLabel(page)],
                        ),
                        h.time(
                          [h.Class('page-choice-time')],
                          [formatTimestamp(revealForPage(page).startSeconds)],
                        ),
                      ],
                    ),
                  ),
                ),
                h.div(
                  [h.Class('page-chooser-footer')],
                  [
                    h.label(
                      [h.Class('all-pages-toggle')],
                      [
                        h.input([
                          h.Checked(isAllPages),
                          h.OnClick(
                            ChangedPageChooserScope({
                              scope: isAllPages
                                ? LandmarkPages()
                                : AllAuthoredPages(),
                            }),
                          ),
                          h.Type('checkbox'),
                        ]),
                        h.span([], ['All 158 pages']),
                      ],
                    ),
                    h.div(
                      [h.Class('chooser-actions')],
                      [
                        h.button(
                          [
                            h.Class('chooser-button cancel'),
                            h.OnClick(CancelledPageChooser()),
                          ],
                          ['Cancel'],
                        ),
                        h.button(
                          [
                            h.Class('chooser-button confirm'),
                            h.OnClick(ConfirmedPageChooser()),
                          ],
                          ['Jump'],
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ],
        )
      },
    }),
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

/** Renders the recording beside its exact authored-page navigation deck. */
export const view = (model: Model): Document => {
  const h = html<Message>()
  const presentation = deckPresentation(model)
  const slide = presentation.currentSlide
  const currentSlideId = slide.id
  const timing = M.value(model.location).pipe(
    M.withReturnType<
      Readonly<{
        deepLink: string
        endSeconds: number
        startSeconds: number
      }>
    >(),
    M.tagsExhaustive({
      AuthoredPageLocation: ({ page }) => revealForPage(page),
      QuestionAnswerLocation: () => slide,
    }),
  )
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
        h.OnKeyDownPreventDefault(key => keyboardMessage(model, key)),
        h.Tabindex(0),
      ],
      [
        h.nav(
          [h.AriaLabel('Authored page navigation'), h.Class('deck-controls')],
          [
            h.button(
              [
                h.AriaLabel('Previous authored page'),
                h.Class('control-button previous'),
                h.Disabled(!presentation.canRewind),
                h.OnClick(RewoundPage({ origin: PointerControl() })),
              ],
              [h.span([h.AriaHidden(true)], ['←']), h.span([], ['Previous'])],
            ),
            h.div(
              [h.Class('navigation-status')],
              [
                h.span(
                  [h.Class('navigation-position')],
                  [
                    `${presentation.position.toString()} / ${presentation.total.toString()}`,
                  ],
                ),
                h.button(
                  [
                    h.Class('goto-page-button'),
                    h.OnClick(OpenedPageChooser({ origin: PointerControl() })),
                    h.Title('Open authored page chooser (G)'),
                  ],
                  ['Goto Page'],
                ),
              ],
            ),
            h.button(
              [
                h.AriaLabel('Next authored page'),
                h.Class('control-button next'),
                h.Disabled(!presentation.canAdvance),
                h.OnClick(AdvancedPage({ origin: PointerControl() })),
              ],
              [h.span([], ['Next']), h.span([h.AriaHidden(true)], ['→'])],
            ),
            h.div(
              [h.Class('progress-track')],
              [h.span([h.Style({ width: progress })], [])],
            ),
          ],
        ),
        h.header(
          [h.Class('deck-header')],
          [
            h.div(
              [],
              [
                h.p([h.Class('deck-kicker')], ['Foldkit · exact page sync']),
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
                h.p(
                  [h.Class('keyboard-hint')],
                  ['← → · Space · Goto Page [G] · Home · End'],
                ),
              ],
            ),
          ],
        ),
        h.section(
          [
            h.AriaLabel('Synchronized video and authored page'),
            h.Class('sync-stage'),
          ],
          [
            authoredPageView(model),
            h.div(
              [h.Class('video-column')],
              [
                h.div(
                  [h.Class('video-context')],
                  [
                    h.p([h.Class('eyebrow')], ['Synchronized recording']),
                    h.div(
                      [h.Class('cue-timing')],
                      [
                        h.time([], [formatTimestamp(timing.startSeconds)]),
                        h.span([], ['→']),
                        h.time([], [formatTimestamp(timing.endSeconds)]),
                      ],
                    ),
                    h.p(
                      [h.Class('companion-summary')],
                      [slideSummary(slide.content)],
                    ),
                    h.a(
                      [
                        h.Class('deep-link'),
                        h.Href(timing.deepLink),
                        h.Rel('noopener noreferrer'),
                        h.Target('_blank'),
                      ],
                      ['Open this exact moment ↗'],
                    ),
                  ],
                ),
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
                    'Play the recording and the exact authored text follows. The page itself stays selectable and deep-linkable.',
                  ],
                ),
              ],
            ),
          ],
        ),
        slideRail(currentSlideId),
        h.div(
          [h.Class('source-strip')],
          [
            h.span([], ['Evidence']),
            ...Array.map(slide.sourceIds, sourceId => sourceLink(sourceId)),
          ],
        ),
        pageChooserView(model),
      ],
    ),
  }
}
