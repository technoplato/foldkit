import * as Program from 'foldkit/program'

import type { AudioPlayerService } from './audioPlayer.js'
import type {
  CaptureEnvironment,
  CaptureSessionService,
  RecordingWriter,
} from './capture/index.js'
import type { ClipboardWriter } from './clipboard.js'
import type { KeyboardInput } from './keyboard.js'
import { RecordingListRoute } from './link.js'
import type { LinkSharer } from './linkSharer.js'
import { Message } from './message.js'
import { Model } from './model.js'
import type { NetworkStatus } from './network.js'
import type { WordsOrigin } from './origin.js'
import type { TranscriptScroller } from './scroller.js'
import type { ShareWriter } from './share/index.js'
import type { WordsStore } from './store.js'
import { subscriptions } from './subscription.js'
import { modelForRoute, startupCommands, update } from './update.js'

type WordsResources =
  | WordsStore
  | ClipboardWriter
  | LinkSharer
  | WordsOrigin
  | RecordingWriter
  | CaptureEnvironment
  | ShareWriter
  | TranscriptScroller
  | KeyboardInput
  | NetworkStatus

type WordsManagedResources = AudioPlayerService | CaptureSessionService

/**
 * The renderer-free web Scribe Program. Hosts add the audio player resource
 * and the page services (scrolling the transcript, the keyboard, the network)
 * and start it from the Model the opened URL implies; starting checks who
 * Cloudflare Access says the listener is and signs in to that Scribe account.
 */
export const WordsProgram: Program.Program<
  Model,
  Message,
  WordsResources,
  WordsManagedResources
> = Program.make<Model, Message, WordsResources, WordsManagedResources>({
  id: 'words',
  version: 8,
  Model,
  Message,
  init: () => [modelForRoute(RecordingListRoute()), startupCommands],
  restore: model => [model, startupCommands],
  update,
  subscriptions,
})
