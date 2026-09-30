import { Layer, Option, Schema as S } from 'effect'
import { Program, Runtime } from 'foldkit'
import { retainLatestTransitions } from 'foldkit/program-runtime'
import { fromString } from 'foldkit/url'
import {
  type AudioPlayerService,
  Capture,
  ChangedUrl,
  ClickedLink,
  type ClipboardWriter,
  type KeyboardInput,
  type LinkSharer,
  type Message,
  type Model,
  type NetworkStatus,
  RecordingListRoute,
  ScribeAppScheme,
  Share,
  type TranscriptScroller,
  type WordsOrigin,
  WordsProgram,
  type WordsStore,
  makeLiveWordsResources,
  modelForRoute,
  urlToScribeRoute,
} from 'words-core-example'

import {
  browserCaptureEnvironment,
  browserClipboard,
  browserKeyboardInput,
  browserLinkSharer,
  browserNetworkStatus,
  browserOrigin,
  browserOriginLayer,
  browserTranscriptScroller,
  canShareLinks,
  makeWordsDatabase,
} from './browser.js'
import { makeManagedResources } from './resources.js'
import { view } from './view/index.js'

const database = makeWordsDatabase()

const resources = Layer.mergeAll(
  makeLiveWordsResources(database),
  Capture.makeLiveRecordingWriter(database),
  Share.makeLiveShareWriter(database),
  browserClipboard,
  browserLinkSharer,
  browserOriginLayer,
  browserCaptureEnvironment,
  browserTranscriptScroller,
  browserKeyboardInput,
  browserNetworkStatus,
)

const startRoute = Option.match(fromString(window.location.href), {
  onNone: () => RecordingListRoute(),
  onSome: urlToScribeRoute,
})

const appScheme = Option.getOrElse(
  S.decodeUnknownOption(ScribeAppScheme)(
    import.meta.env.VITE_SCRIBE_APP_SCHEME,
  ),
  () => 'scribe-shared-dev' as const,
)

const program: Program.Program<
  Model,
  Message,
  | WordsStore
  | ClipboardWriter
  | LinkSharer
  | WordsOrigin
  | Capture.RecordingWriter
  | Capture.CaptureEnvironment
  | Share.ShareWriter
  | TranscriptScroller
  | KeyboardInput
  | NetworkStatus,
  AudioPlayerService | Capture.CaptureSessionService
> = Program.make({
  ...WordsProgram,
  managedResources: makeManagedResources(browserOrigin),
})

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById('root'),
  program,
  resources,
  start: { _tag: 'Model', model: modelForRoute(startRoute) },
  routing: {
    onUrlChange: url => ChangedUrl({ url }),
    onUrlRequest: request => ClickedLink({ request }),
  },
  view: view({ appScheme, canShareLinks }),
  // NOTE: Foldkit's Program journal keeps every transition by default, for
  // DevTools and replay tapes. A production page uses neither, and it stays
  // open for hours while every change to the list window or the open
  // recording arrives as a new snapshot, so a production build keeps none of
  // them; the dev server keeps them for DevTools.
  journal: import.meta.env.PROD
    ? { archive: retainLatestTransitions({ maximumTransitions: 0 }) }
    : {},
})

Runtime.run(application)
