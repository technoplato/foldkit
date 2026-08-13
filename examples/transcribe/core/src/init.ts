import { Option } from "effect"
import { Command } from "foldkit"

import { requestFromHref } from "./catalog.js"
import { OpenedHref, type Message } from "./message.js"
import { LoadingCatalog, Model, idlePlayback } from "./model.js"
import { TranscribeStore } from "./store.js"
import { LoadCatalog, update } from "./update.js"

// INIT

/** Creates the initial Transcribe Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, TranscribeStore>>,
] => [
  Model.make({
    catalog: LoadingCatalog.make({}),
    draftUrl: "",
    selectedId: Option.none(),
    source: "StaticFallback",
    ...idlePlayback,
  }),
  [LoadCatalog()],
]

/** Restores an existing Transcribe Model without inventing host coordination state. */
export const restore = (
  model: Model,
): readonly [Model, ReadonlyArray<Command.Command<Message, never, TranscribeStore>>] => [
  model,
  [],
]

/** Builds a Model for a GET href so hosts can start on `/?url=` or `/jobs/:id`. */
export const modelForHref = (href: string): Model => {
  const [initial] = init()
  const request = requestFromHref(href)
  if (Option.isNone(request.videoId) && request.draftUrl === "") {
    return initial
  }
  const [next] = update(initial, OpenedHref.make({ href }))
  return next
}
