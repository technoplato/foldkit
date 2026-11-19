import { type Layer, Option, Schema as S } from 'effect'
import { Program, Runtime } from 'foldkit'
import { retainLatestTransitions } from 'foldkit/program-runtime'
import { fromString } from 'foldkit/url'
import {
  type AudioPlayerService,
  type Capture,
  ChangedUrl,
  ClickedLink,
  type ClipboardWriter,
  type CompressedCopyReader,
  type KeyboardInput,
  type LinkSharer,
  type Message,
  type Model,
  type NetworkStatus,
  RecordingListRoute,
  ScribeAppScheme,
  type Share,
  type TranscriptScroller,
  type WordsOrigin,
  type WordsOriginService,
  WordsProgram,
  type WordsStore,
  modelForRoute,
  urlToScribeRoute,
} from 'words-core-example'

import { canShareLinks } from './browser.js'
import { makeManagedResources } from './resources.js'
import { view } from './view/index.js'

/** Every service the words Program asks its host for. */
export type WordsServices =
  | WordsStore
  | ClipboardWriter
  | LinkSharer
  | WordsOrigin
  | Capture.RecordingWriter
  | Capture.CaptureEnvironment
  | Share.ShareWriter
  | TranscriptScroller
  | KeyboardInput
  | NetworkStatus

/**
 * What starting the words page takes from outside: the services, the
 * origin the microphone's transcriber is reached through, and the reader
 * of a recording's compressed copy.
 */
export type StartWords = Readonly<{
  resources: Layer.Layer<WordsServices>
  origin: WordsOriginService
  copyReader: CompressedCopyReader
}>

/**
 * Starts the words page in `#root` at the address the browser is on. The
 * live site hands it Scribe's Instant; the made-up page hands it
 * recordings that are not anyone's, so the same Program, view and browser
 * resources are seen and measured without a person's words.
 *
 * @example
 * ```typescript
 * startWords({ resources, origin: browserOrigin, copyReader: makeLiveCopyReader(database) })
 * ```
 */
export const startWords = ({
  resources,
  origin,
  copyReader,
}: StartWords): void => {
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
    WordsServices,
    AudioPlayerService | Capture.CaptureSessionService
  > = Program.make({
    ...WordsProgram,
    managedResources: makeManagedResources(origin, copyReader),
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
}
