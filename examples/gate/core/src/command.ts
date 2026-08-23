import { Effect, Match as M } from 'effect'
import { Command } from 'foldkit'

import {
  FailedReadOrigin,
  type Message,
  SucceededReadOrigin,
} from './message.js'
import { Unreachable } from './model.js'
import { GateOrigin } from './origin.js'

/** Reads the Gate origin. */
export const ReadOrigin = Command.define(
  'ReadOrigin',
  SucceededReadOrigin,
  FailedReadOrigin,
)(
  Effect.catchCause(
    Effect.gen(function* () {
      const origin = yield* GateOrigin
      const report = yield* origin.read
      return M.value(report).pipe(
        M.withReturnType<Message>(),
        M.tagsExhaustive({
          Read: ({ rate, messages }) => SucceededReadOrigin({ rate, messages }),
          Failed: ({ reason }) => FailedReadOrigin({ reason }),
        }),
      )
    }),
    () => Effect.succeed(FailedReadOrigin({ reason: Unreachable() })),
  ),
)
