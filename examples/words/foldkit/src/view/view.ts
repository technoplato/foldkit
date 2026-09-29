import { Match as M, Option } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'
import {
  Capture,
  ClickedOpenInApp,
  type Message,
  type Model,
} from 'words-core-example'

import { accountPage } from './account.js'
import { captureBar, newRecordingPage } from './capture.js'
import { recordingList } from './list.js'
import { playbackBar, playbackNotice, recordingPage } from './playback.js'
import { shareSheet, sharedRangePage } from './share.js'
import {
  type ViewConfig,
  backToRecordings,
  largeTitle,
  toast,
  topBar,
} from './shell.js'
import { button } from './ui.js'

const titleOf = (model: Model): string =>
  M.value(model.route).pipe(
    M.withReturnType<string>(),
    M.tag('Account', () => 'Account | Scribe'),
    M.tag('NewRecording', () => 'New recording | Scribe'),
    M.tag('Share', () =>
      M.value(model.share.sharedRange).pipe(
        M.withReturnType<string>(),
        M.tag(
          'ReadySharedRange',
          ({ range }) => `${range.recordingTitle} | Shared | Scribe`,
        ),
        M.orElse(() => 'Shared | Scribe'),
      ),
    ),
    M.orElse(() =>
      M.value(model.playback).pipe(
        M.withReturnType<string>(),
        M.tag(
          'ReadyPlayback',
          ready => `${ready.detail.summary.title} | Scribe`,
        ),
        M.orElse(() => 'Scribe'),
      ),
    ),
  )

const comingToTheWeb = (
  title: string,
  body: string,
  config: ViewConfig,
): Html => {
  const h = html<Message>()
  return h.main(
    [h.Class('mx-auto flex w-full max-w-2xl flex-col px-4 pb-40 pt-4 sm:px-6')],
    [
      backToRecordings(),
      h.div([h.Class('pb-4 pt-2')], [largeTitle(title)]),
      h.div(
        [h.Class('card flex flex-col items-start gap-4 rounded-[26px] p-6')],
        [
          h.p([h.Class('text-[15px] leading-6 text-secondary')], [body]),
          button(
            'Open in Scribe',
            ClickedOpenInApp({ scheme: config.appScheme }),
            'Tinted',
            Option.some('External'),
          ),
        ],
      ),
    ],
  )
}

const playbackContent = (model: Model, config: ViewConfig): Html =>
  M.value(model.playback).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      NoPlayback: () =>
        playbackNotice('Nothing is open', 'Pick a recording from the list.'),
      OpeningPlayback: () =>
        playbackNotice(
          'Opening the recording',
          'Loading the transcript from Scribe.',
        ),
      MissingRecording: () =>
        playbackNotice(
          'This recording is not available',
          'It does not exist, or it is not shared with this account. Ask the owner to share it with you.',
        ),
      FailedPlayback: ({ reason }) =>
        playbackNotice('The recording could not load', reason),
      ReadyPlayback: ready => recordingPage(ready, config),
    }),
  )

const content = (model: Model, config: ViewConfig): Html =>
  M.value(model.route).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      RecordingList: () => recordingList(model),
      Account: () => accountPage(model),
      NewRecording: () => newRecordingPage(model),
      Share: () => sharedRangePage(model),
      RecordingsMap: () =>
        comingToTheWeb(
          'Recordings map',
          'The map of your recordings and their routes is next on the web. Open it in Scribe on your iPhone for now.',
          config,
        ),
      SearchRecordings: () =>
        comingToTheWeb(
          'Search',
          'Searching your transcripts is next on the web. Open search in Scribe on your iPhone for now.',
          config,
        ),
      NotFound: () =>
        comingToTheWeb('Not found', 'This is not a Scribe link.', config),
      Recording: () => playbackContent(model, config),
      Section: () => playbackContent(model, config),
      Playback: () => playbackContent(model, config),
      Thread: () => playbackContent(model, config),
      ThreadResponse: () => playbackContent(model, config),
    }),
  )

const isRecordingPage = (model: Model): boolean =>
  M.value(model.route).pipe(
    M.withReturnType<boolean>(),
    M.tags({
      Recording: () => true,
      Section: () => true,
      Playback: () => true,
      Thread: () => true,
      ThreadResponse: () => true,
    }),
    M.orElse(() => false),
  )

const floatingControls = (model: Model): ReadonlyArray<Html> => {
  const isConnected = model.account.connection._tag === 'ConnectedAccount'
  const isRecordAvailable =
    isConnected &&
    model.route._tag === 'RecordingList' &&
    model.recordings._tag === 'LoadedRecordings'
  const maybeCapturedRecordingID = Option.map(
    Capture.Model.draftOf(model.capture),
    draft => draft.recordingID,
  )
  const playback = isRecordingPage(model)
    ? M.value(model.playback).pipe(
        M.withReturnType<ReadonlyArray<Html>>(),
        M.tag('ReadyPlayback', ready =>
          Option.exists(
            maybeCapturedRecordingID,
            id => id === ready.recordingID,
          )
            ? []
            : playbackBar(ready),
        ),
        M.orElse(() => []),
      )
    : []
  return [...captureBar(model, isRecordAvailable), ...playback]
}

const floatingLayer = (model: Model): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        'pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6',
      ),
    ],
    [
      h.div(
        [
          h.Class(
            'pointer-events-auto flex w-full max-w-xl flex-col items-center gap-2 [&>*]:max-w-full',
          ),
        ],
        floatingControls(model),
      ),
    ],
  )
}

const shareOverlay = (model: Model): ReadonlyArray<Html> =>
  M.value(model.playback).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tag('ReadyPlayback', ready =>
      shareSheet(model, ready.detail.summary.title, ready.detail.sections),
    ),
    M.orElse(() => []),
  )

/** The whole page for a Model. */
export const view =
  (config: ViewConfig) =>
  (model: Model): Document => {
    const h = html<Message>()
    return {
      title: titleOf(model),
      body: h.div(
        [h.Class('min-h-dvh bg-canvas font-sans text-label antialiased')],
        [
          topBar(model),
          content(model, config),
          floatingLayer(model),
          ...shareOverlay(model),
          toast(model),
        ],
      ),
    }
  }
