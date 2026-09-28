import { Match as M } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'
import {
  type Message,
  type Model,
  RecordingListRoute,
  scribeRouteToPath,
} from 'words-core-example'

import { recordingList } from './list.js'
import { playbackPage } from './playback.js'
import { type ViewConfig, copyNotice, header } from './shell.js'

const listPath = scribeRouteToPath(RecordingListRoute())

const titleOf = (model: Model): string =>
  M.value(model.playback).pipe(
    M.withReturnType<string>(),
    M.tag('ReadyPlayback', ready => `${ready.detail.summary.title} | Scribe`),
    M.orElse(() => 'Scribe'),
  )

const placeholder = (title: string, body: string): Html => {
  const h = html<Message>()
  return h.main(
    [h.Class('mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-10')],
    [
      h.h1([h.Class('text-xl font-semibold text-stone-900')], [title]),
      h.p([h.Class('text-stone-600')], [body]),
      h.a(
        [h.Href(listPath), h.Class('text-sm text-sky-700 hover:underline')],
        ['← Recordings'],
      ),
    ],
  )
}

const content = (model: Model): Html =>
  M.value(model.route).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      RecordingList: () => recordingList(model),
      RecordingsMap: () =>
        placeholder(
          'Recordings map',
          'The map of recordings is next on the web. Open it in the Scribe app for now.',
        ),
      SearchRecordings: () =>
        placeholder(
          'Search',
          'Search is next on the web. Open it in the Scribe app for now.',
        ),
      NewRecording: () =>
        placeholder(
          'New recording',
          'Recordings start in the Scribe app on the iPhone or the Mac.',
        ),
      NotFound: () => placeholder('Not found', 'This is not a Scribe link.'),
      Recording: () => playbackPage(model),
      Section: () => playbackPage(model),
      Playback: () => playbackPage(model),
      Thread: () => playbackPage(model),
      ThreadResponse: () => playbackPage(model),
    }),
  )

/** The whole page for a Model. */
export const view =
  (config: ViewConfig) =>
  (model: Model): Document => {
    const h = html<Message>()
    return {
      title: titleOf(model),
      body: h.div(
        [h.Class('min-h-dvh bg-stone-50 text-stone-900 antialiased')],
        [header(model, config), content(model), copyNotice(model)],
      ),
    }
  }
