import { Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  ClickedOpenInApp,
  type Message,
  type Model,
  RecordingListRoute,
  type ScribeAppScheme,
  scribeRouteToPath,
} from 'words-core-example'

const listPath = scribeRouteToPath(RecordingListRoute())

/** Host settings the views read. */
export type ViewConfig = Readonly<{
  appScheme: ScribeAppScheme
}>

const identityLabel = (model: Model): string =>
  M.value(model.identity).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      CheckingIdentity: () => 'Signing in',
      SignedIn: ({ maybeEmail, isGuest }) =>
        Option.getOrElse(maybeEmail, () =>
          isGuest ? 'Guest account' : 'Signed in',
        ),
      SignedOut: () => 'Not signed in',
    }),
  )

const isAppRoute = (model: Model): boolean =>
  model.route._tag !== 'RecordingList' && model.route._tag !== 'NotFound'

/** The top bar: the site name, who is signed in, and Open in Scribe. */
export const header = (model: Model, config: ViewConfig): Html => {
  const h = html<Message>()
  return h.header(
    [
      h.Class(
        'sticky top-0 z-20 flex items-center gap-3 border-b border-stone-200 bg-white/90 px-4 py-3 backdrop-blur',
      ),
    ],
    [
      h.a(
        [
          h.Href(listPath),
          h.Class('text-lg font-semibold tracking-tight text-stone-900'),
        ],
        ['Scribe'],
      ),
      h.span([h.Class('flex-1')], []),
      ...(isAppRoute(model)
        ? [
            h.button(
              [
                h.Type('button'),
                h.OnClick(ClickedOpenInApp({ scheme: config.appScheme })),
                h.Class(
                  'min-h-11 rounded-full border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:bg-stone-100',
                ),
              ],
              ['Open in Scribe'],
            ),
          ]
        : []),
      h.span(
        [h.Class('text-sm text-stone-500'), h.Title('Instant account')],
        [identityLabel(model)],
      ),
    ],
  )
}

/** The notice after a copy, announced to screen readers. */
export const copyNotice = (model: Model): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.AriaLive('polite'),
      h.Class(
        'pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center',
      ),
    ],
    Option.match(model.maybeCopyNotice, {
      onNone: () => [],
      onSome: notice => [
        h.span(
          [
            h.Class(
              notice.isFailure
                ? 'rounded-full bg-red-600 px-4 py-2 text-sm text-white shadow-lg'
                : 'rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg',
            ),
          ],
          [notice.text],
        ),
      ],
    }),
  )
}
