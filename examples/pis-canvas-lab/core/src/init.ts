import type { Command } from 'foldkit'

import { ShowcaseShell } from './catalog.js'
import type { Message, Model } from './program.js'

/** Initial lab Model + Commands from the composed shell. */
export const init = (): readonly [
  Model,
  ReadonlyArray<Command.Command<Message>>,
] =>
  ShowcaseShell.init() as readonly [
    Model,
    ReadonlyArray<Command.Command<Message>>,
  ]

/** Restores an existing lab Model without inventing host coordination state. */
export const restore = (
  model: Model,
): readonly [Model, ReadonlyArray<Command.Command<Message>>] =>
  ShowcaseShell.restore !== undefined
    ? (ShowcaseShell.restore(model) as readonly [
        Model,
        ReadonlyArray<Command.Command<Message>>,
      ])
    : [model, []]
