import { Option } from "effect"
import { Command } from "foldkit"

import { type Message } from "./message.js"
import { LoadingCatalog, Model } from "./model.js"
import { IdeasStore } from "./store.js"
import { LoadCatalog } from "./update.js"

// INIT

/** Creates the initial Ideas Model and Commands. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, IdeasStore>>,
] => [
  Model.make({
    catalog: LoadingCatalog.make({}),
    query: "",
    selectedId: Option.none(),
    source: "StaticFallback",
  }),
  [LoadCatalog()],
]

/** Restores an existing Ideas Model without inventing host coordination state. */
export const restore = (
  model: Model,
): readonly [Model, ReadonlyArray<Command.Command<Message, never, IdeasStore>>] => [
  model,
  [],
]
