import { Layer } from 'effect'
import { browserSystemAppearance } from 'foldkit/theme'
import {
  Capture,
  Share,
  makeLiveCopyReader,
  makeLiveWordsResources,
} from 'words-core-example'

import {
  browserAppearanceStore,
  browserCaptureEnvironment,
  browserClipboard,
  browserKeyboardInput,
  browserLinkSharer,
  browserNetworkStatus,
  browserOrigin,
  browserOriginLayer,
  browserTranscriptScroller,
  makeWordsDatabase,
} from './browser.js'
import { startWords } from './start.js'

const database = makeWordsDatabase()

startWords({
  resources: Layer.mergeAll(
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
    browserAppearanceStore,
    browserSystemAppearance,
  ),
  origin: browserOrigin,
  copyReader: makeLiveCopyReader(database),
})
