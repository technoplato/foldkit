import { Layer, Option, Schema as S } from 'effect'
import { Program, Runtime } from 'foldkit'
import { fromString } from 'foldkit/url'
import {
  type AudioPlayerService,
  ChangedUrl,
  ClickedLink,
  type ClipboardWriter,
  type Message,
  type Model,
  RecordingListRoute,
  ScribeAppScheme,
  WordsProgram,
  type WordsStore,
  makeLiveWordsResources,
  modelForRoute,
  urlToScribeRoute,
} from 'words-core-example'

import { withHostedIdentity } from '@foldkit/instant'

import { managedResources } from './audio.js'
import { browserClipboard, makeWordsDatabase } from './browser.js'
import { view } from './view/index.js'

const database = makeWordsDatabase()

const resources = withHostedIdentity(
  Layer.merge(makeLiveWordsResources(database), browserClipboard),
  database,
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
  WordsStore | ClipboardWriter,
  AudioPlayerService
> = Program.make({ ...WordsProgram, managedResources })

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
