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
import { noRecordingChosen, recordingList, recordingSidebar } from './list.js'
import {
  miniPlayer,
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
      RecordingList: () => recordingList(model, config, isSplitOf(model)),
      Account: () => accountPage(model),
      NewRecording: () => newRecordingPage(model),
      Share: () => sharedRangePage(model),
      RecordingsMap: () =>
        comingToTheWeb(
          'Recordings Map',
          'The map of your recordings and their routes is next on the web. Open it in Scribe on your iPhone for now.',
          config,
        ),
      SearchRecordings: () => recordingList(model, config, isSplitOf(model)),
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
  const background = Option.match(model.maybeBackgroundPlayback, {
    onNone: () => [],
    onSome: miniPlayer,
  })
  return Option.match(maybeOpenRecordingOf(model), {
    onNone: () => [...background, ...recorder],
    onSome: ready =>
      isOwnRecordingOf(model, ready.recordingID)
        ? [...returnPill(ready), ...background, ...recorder]
        : [...recorder, ...playbackBar(ready)],
  })
}

const detailColumnOffsetClass = 'lg:left-[21rem] xl:left-[24rem]'

const floatingLayer = (
  controls: ReadonlyArray<Html>,
  isSplit: boolean,
): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        `pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 ${isSplit ? detailColumnOffsetClass : ''}`,
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
              `mt-3 flex items-start gap-3 rounded-2xl bg-caution-soft px-4 py-3 ${isFullScreenOf(model) ? 'ml-4 mr-16 sm:mx-auto sm:mt-16 sm:w-[calc(100%-2rem)] sm:max-w-3xl' : 'mx-auto w-[calc(100%-2rem)] max-w-3xl'}`,
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

const isListRoute = (model: Model): boolean =>
  model.route._tag === 'RecordingList' ||
  model.route._tag === 'SearchRecordings'

/**
 * Whether the page splits into the recording list and the page beside it from
 * 1024 px, like the iPad and the Mac: while the browser signs in and once it
 * is connected, so the layout does not move when the list arrives, and not in
 * Full Screen. Without a connected account the page is one column, with the
 * step that signs it in.
 */
const isSplitOf = (model: Model): boolean =>
  !isFullScreenOf(model) &&
  M.value(model.account.connection).pipe(
    M.withReturnType<boolean>(),
    M.tags({
      CheckingAccount: () => true,
      ConnectingAccount: () => true,
      ConnectedAccount: () => true,
    }),
    M.orElse(() => false),
  )

/**
 * The page's columns. Split, the recording list is the sidebar from 1024 px:
 * on the list itself it is the page's list, with a placeholder beside it;
 * elsewhere a sidebar that is hidden below 1024 px. Scrolling the page away
 * from a followed playhead or live edge detaches following; scrolling the
 * sidebar does not.
 */
const columns = (model: Model, config: ViewConfig): Html => {
  const h = html<Message>()
  const page = content(model, config)
  if (!isSplitOf(model)) {
    return h.div([...followAttributesOf(model)], [page])
  } else if (isListRoute(model)) {
    return h.div(
      [
        h.Class(
          'lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]',
        ),
      ],
      [page, noRecordingChosen()],
    )
  } else {
    return h.div(
      [
        h.Class(
          'lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]',
        ),
      ],
      [
        recordingSidebar(model, config),
        h.div([h.Class('min-w-0'), ...followAttributesOf(model)], [page]),
      ],
    )
  }
}

/** The whole page for a Model. */
export const view =
  (config: ViewConfig) =>
  (model: Model): Document => {
    const h = html<Message>()
    const controls = floatingControls(model)
    const isSplit = isSplitOf(model)
    return {
      title: titleOf(model),
      body: h.div(
        [
          h.Class(
            'folding-title-scope min-h-dvh bg-canvas font-sans text-label antialiased',
          ),
        ],
        [
          ...(Array.isReadonlyArrayNonEmpty(controls) ? [skipToPlayer()] : []),
          ...(isFullScreenOf(model) ? [] : [topBar(model, isSplit)]),
          ...offlineNotice(model),
          columns(model, config),
          floatingLayer(controls, isSplit),
          ...shareOverlay(model),
          toast(model, isSplit),
        ],
      ),
    }
  }
