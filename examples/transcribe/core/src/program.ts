import * as Program from "foldkit/program"

import { init, restore } from "./init.js"
import { Message } from "./message.js"
import { Model } from "./model.js"
import { TranscribeStore } from "./store.js"
import { subscriptions } from "./subscription.js"
import { update } from "./update.js"

/** The canonical renderer-free Transcribe Program shared by every client. */
export const TranscribeProgram: Program.Program<Model, Message, TranscribeStore> =
  Program.make({
    id: "transcribe",
    version: 2,
    Model,
    Message,
    init,
    restore,
    update,
    subscriptions,
  })
