import * as Program from 'foldkit/program'

import type { AudioPlayerService } from './audioPlayer.js'
import type {
  CaptureEnvironment,
  CaptureSessionService,
  RecordingWriter,
} from './capture/index.js'
import type { ClipboardWriter } from './clipboard.js'
import { RecordingListRoute } from './link.js'
import { Message } from './message.js'
import { Model } from './model.js'
import type { WordsOrigin } from './origin.js'
import type { ShareWriter } from './share/index.js'
import type { WordsStore } from './store.js'
import { subscriptions } from './subscription.js'
import { modelForRoute, startupCommands, update } from './update.js'

/**
 * The renderer-free web Scribe Program. Hosts add the audio player resource
 * and start it from the Model the opened URL implies; starting checks who
 * Cloudflare Access says the listener is and signs in to that Scribe account.
 */
export const WordsProgram: Program.Program<
  Model,
  Message,
  | WordsStore
  | ClipboardWriter
  | WordsOrigin
  | RecordingWriter
  | CaptureEnvironment
  | ShareWriter,
  AudioPlayerService | CaptureSessionService
> = Program.make({
  id: 'words',
  version: 2,
  Model,
  Message,
  init: () => [modelForRoute(RecordingListRoute()), startupCommands],
  restore: model => [model, startupCommands],
  update,
  subscriptions,
})
