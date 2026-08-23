import { Schema as S } from 'effect'

import { defaultReplicateStep } from './replicate.js'
import { Prompt, Step } from './step.js'
import { defaultPrompt, demoTape, printPuzzleUri } from './tape.js'

// MODEL

/** Product identity title printed by `show` IDENTITY. Not host chrome. */
export const title = 'puzzle'

/** Portable path without the hash tape. */
export const path = '/puzzle'

/**
 * Product identity sentence. Host chrome looks up `hostSurfaces`, not this.
 * Public Knophy copy. No legal name.
 */
export const description =
  'Knophy hash-tape puzzle. One shared core. Clients render and dispatch.'

/** The Puzzle tape plus the in-progress prompt. */
export const Model = S.Struct({
  tape: S.Array(Step),
  prompt: Prompt,
})
/** A Puzzle Model value. */
export type Model = typeof Model.Type

/** Demo Model. Settled tape plus the public ReplicateStep prompt. */
export const demoModel = (): Model =>
  Model.make({
    tape: demoTape,
    prompt: defaultReplicateStep(),
  })

/** Empty Model. Prompt waits on the first label. */
export const emptyModel = (): Model =>
  Model.make({
    tape: [],
    prompt: defaultPrompt,
  })

/** Portable URI for this Program, including the hash tape. */
export const uriOf = (model: Model): string =>
  printPuzzleUri(model.tape, model.prompt)

/** Portable URI for the demo tape. */
export const uri = uriOf(demoModel())
