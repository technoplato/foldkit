import * as Program from 'foldkit/program'

import type { AudioPlayerService } from './audioPlayer.js'
import type { ClipboardWriter } from './clipboard.js'
import { RecordingListRoute } from './link.js'
import { Message } from './message.js'
import { Model } from './model.js'
import type { WordsStore } from './store.js'
import { subscriptions } from './subscription.js'
import { modelForRoute, update } from './update.js'

/**
 * The renderer-free web Scribe Program. Hosts add the audio player resource
 * and start it from the Model the opened URL implies.
 */
export const WordsProgram: Program.Program<
  Model,
  Message,
  WordsStore | ClipboardWriter,
  AudioPlayerService
> = Program.make({
  id: 'words',
  version: 1,
  Model,
  Message,
  init: () => [modelForRoute(RecordingListRoute()), []],
  restore: model => [model, []],
  update,
  subscriptions,
})
