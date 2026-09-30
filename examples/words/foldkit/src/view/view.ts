import { Array, Match as M, Option } from 'effect'
import { type Document, type Html, html } from 'foldkit/html'
import {
  Capture,
  ClickedOpenInApp,
  ClickedSkipToPlayer,
  type Message,
  type Model,
  PLAYER_ELEMENT_ID,
  type ReadyPlayback,
  ScrolledTranscriptAway,
  displayedPlaybackOf,
  isOwnRecordingOf,
  isRecordAvailableOf,
  playbackPhaseOf,
} from 'words-core-example'

import { accountPage } from './account.js'
import { captureBar, newRecordingPage } from './capture.js'
import { icon } from './icon.js'
import { recordingList } from './list.js'
import {
  playbackBar,
  playbackNotice,
  recordingPage,
  returnPill,
} from './playback.js'
import { shareSheet, sharedRangePage } from './share.js'
import { type ViewConfig, largeTitle, toast, topBar } from './shell.js'
import { button } from './ui.js'

const capturePhaseOf = (
  capturing: typeof Capture.Model.Capturing.Type,
): string => (capturing.transport === 'Paused' ? 'Paused' : 'Recording')

const playbackPrefixOf = (ready: ReadyPlayback): string =>
  Option.match(playbackPhaseOf(ready), {
    onNone: () => '',
    onSome: phase => `${phase} | `,
  })

const phasePrefixOf = (model: Model, ready: ReadyPlayback): string =>
  M.value(model.capture.state).pipe(
    M.withReturnType<string>(),
    M.tag('Capturing', capturing =>
      capturing.draft.recordingID === ready.recordingID
        ? `${capturePhaseOf(capturing)} | `
        : playbackPrefixOf(ready),
    ),
    M.orElse(() => playbackPrefixOf(ready)),
  )

const titleOf = (model: Model): string =>
  M.value(model.route).pipe(
    M.withReturnType<string>(),
    M.tag('Account', () => 'Settings | Scribe'),
    M.tag('NewRecording', () => 'New Recording | Scribe'),
    M.tag('SearchRecordings', () => 'Search | Scribe'),
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
          ready =>
            `${phasePrefixOf(model, ready)}${ready.detail.summary.title} | Scribe`,
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
      h.div([h.Class('pb-4 pt-2')], [largeTitle(title)]),
      h.div(
        [h.Class('card flex flex-col items-start gap-4 rounded-[26px] p-6')],
        [
          h.p([h.Class('text-subhead text-secondary')], [body]),
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
  M.value(displayedPlaybackOf(model)).pipe(
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
      ReadyPlayback: ready => recordingPage(model, ready, config),
    }),
  )

const content = (model: Model, config: ViewConfig): Html =>
  M.value(model.route).pipe(
    M.withReturnType<Html>(),
    M.tagsExhaustive({
      RecordingList: () => recordingList(model, config),
      Account: () => accountPage(model),
      NewRecording: () => newRecordingPage(model),
      Share: () => sharedRangePage(model),
      RecordingsMap: () =>
        comingToTheWeb(
          'Recordings Map',
          'The map of your recordings and their routes is next on the web. Open it in Scribe on your iPhone for now.',
          config,
        ),
      SearchRecordings: () => recordingList(model, config),
      NotFound: () =>
        comingToTheWeb('Not Found', 'This is not a Scribe link.', config),
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

const maybeOpenRecordingOf = (model: Model): Option.Option<ReadyPlayback> =>
  isRecordingPage(model)
    ? M.value(model.playback).pipe(
        M.withReturnType<Option.Option<ReadyPlayback>>(),
        M.tag('ReadyPlayback', ready => Option.some(ready)),
        M.orElse(() => Option.none()),
      )
    : Option.none()

const floatingControls = (model: Model): ReadonlyArray<Html> => {
  const recorder = captureBar(model, isRecordAvailableOf(model))
  return Option.match(maybeOpenRecordingOf(model), {
    onNone: () => recorder,
    onSome: ready =>
      isOwnRecordingOf(model, ready.recordingID)
        ? [...returnPill(ready), ...recorder]
        : [...recorder, ...playbackBar(ready)],
  })
}

const floatingLayer = (controls: ReadonlyArray<Html>): Html => {
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
          h.Id(PLAYER_ELEMENT_ID),
          h.Role('region'),
          h.AriaLabel('Player'),
          h.Class(
            'pointer-events-auto flex w-full max-w-xl flex-col items-center gap-2 outline-none [&>*]:max-w-full',
          ),
        ],
        controls,
      ),
    ],
  )
}

const skipToPlayer = (): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.OnClick(ClickedSkipToPlayer()),
      h.Class(
        'glass sr-only z-50 min-h-11 items-center rounded-full px-4 text-subhead font-semibold text-tint focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:inline-flex',
      ),
    ],
    ['Skip to Player'],
  )
}

const offlineNotice = (model: Model): ReadonlyArray<Html> => {
  const h = html<Message>()
  return model.connectivity === 'Offline'
    ? [
        h.div(
          [
            h.Role('status'),
            h.Class(
              'mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-3xl items-start gap-3 rounded-2xl bg-caution-soft px-4 py-3',
            ),
          ],
          [
            icon('Offline', 'mt-0.5 size-5 shrink-0 text-caution'),
            h.span(
              [h.Class('flex min-w-0 flex-col')],
              [
                h.span(
                  [h.Class('text-subhead font-semibold text-label')],
                  ['You are offline'],
                ),
                h.span(
                  [h.Class('text-subhead text-label')],
                  [
                    'What is on screen stays. A recording in progress keeps recording, and Scribe saves and syncs as soon as the network is back.',
                  ],
                ),
              ],
            ),
          ],
        ),
      ]
    : []
}

const isFullScreenOf = (model: Model): boolean =>
  Option.exists(
    maybeOpenRecordingOf(model),
    ready => ready.screenMode === 'FullScreen',
  )

const followAttributesOf = (model: Model) => {
  const h = html<Message>()
  return Option.exists(
    maybeOpenRecordingOf(model),
    ready => ready.follow === 'Following',
  )
    ? [
        h.OnWheel(ScrolledTranscriptAway()),
        h.OnTouchMove(ScrolledTranscriptAway()),
      ]
    : []
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
    const controls = floatingControls(model)
    return {
      title: titleOf(model),
      body: h.div(
        [
          h.Class(
            'folding-title-scope min-h-dvh bg-canvas font-sans text-label antialiased',
          ),
          ...followAttributesOf(model),
        ],
        [
          ...(Array.isReadonlyArrayNonEmpty(controls) ? [skipToPlayer()] : []),
          ...(isFullScreenOf(model) ? [] : [topBar(model)]),
          ...offlineNotice(model),
          content(model, config),
          floatingLayer(controls),
          ...shareOverlay(model),
          toast(model),
        ],
      ),
    }
  }
