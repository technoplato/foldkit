import { Effect, Match as M } from 'effect'
import { Command } from 'foldkit'
import { NonEmptyString } from 'foldkit/adt'

import {
  FailedApply,
  FailedReadOrigin,
  type Message,
  SucceededApply,
  SucceededReadOrigin,
} from './message.js'
import { Unreachable, Visibility } from './model.js'
import { SettingsOrigin } from './origin.js'

/** Reads Caddy hosts and Access apps. */
export const ReadOrigin = Command.define(
  'ReadOrigin',
  SucceededReadOrigin,
  FailedReadOrigin,
)(
  Effect.catchCause(
    Effect.gen(function* () {
      const origin = yield* SettingsOrigin
      const report = yield* origin.read
      return M.value(report).pipe(
        M.withReturnType<Message>(),
        M.tagsExhaustive({
          Snapshot: ({ token, hosts }) => SucceededReadOrigin({ token, hosts }),
          Failed: ({ reason }) => FailedReadOrigin({ reason }),
        }),
      )
    }),
    () => Effect.succeed(FailedReadOrigin({ reason: Unreachable() })),
  ),
)

/** Applies one host visibility through Access. */
export const ApplyVisibility = Command.define(
  'ApplyVisibility',
  { host: NonEmptyString, visibility: Visibility },
  SucceededApply,
  FailedApply,
)(({ host, visibility }) =>
  Effect.catchCause(
    Effect.gen(function* () {
      const origin = yield* SettingsOrigin
      const report = yield* origin.apply({ host, visibility })
      return M.value(report).pipe(
        M.withReturnType<Message>(),
        M.tagsExhaustive({
          Snapshot: ({ token, hosts }) => SucceededApply({ token, hosts }),
          Failed: ({ reason }) => FailedApply({ reason }),
        }),
      )
    }),
    () => Effect.succeed(FailedApply({ reason: Unreachable() })),
  ),
)
