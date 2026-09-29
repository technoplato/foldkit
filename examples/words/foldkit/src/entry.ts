import { Layer, Option, Schema as S } from 'effect'
import { Program, Runtime } from 'foldkit'
import { fromString } from 'foldkit/url'
import {
  type AudioPlayerService,
  Capture,
  ChangedUrl,
  ClickedLink,
  type ClipboardWriter,
  type KeyboardInput,
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
  browserNetworkStatus,
  browserOrigin,
  browserOriginLayer,
  browserTranscriptScroller,
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
  view: view({ appScheme }),
})

Runtime.run(application)
