import { Array, Match as M, Schema as S } from 'effect'
import * as Program from 'foldkit/program'

import {
  Message,
  WireMessageV0,
  WireMessageV1,
  counterAdjustedEventId,
  upgradeV0ToV1,
  upgradeV1ToCurrent,
} from './message.js'

/** The Model reconstructed by every supported Message version. */
export const Model = S.Struct({ count: S.Int })
/** The Model reconstructed by every supported Message version. */
export type Model = typeof Model.Type

const EncodedTransitionFields = {
  sequence: S.Int,
  source: S.Json,
  operationId: S.optionalKey(S.Int),
  isOperationSettled: S.Boolean,
  commands: S.Array(S.Json),
  timestamp: S.Number,
}

const EncodedTapeV0 = S.Struct({
  formatVersion: S.Literal(1),
  programId: S.Literal('message-versioning'),
  programVersion: S.Literal(0),
  initialModel: Model,
  initialCommands: S.Array(S.Json),
  transitions: S.Array(
    S.Struct({ ...EncodedTransitionFields, message: WireMessageV0 }),
  ),
})

const EncodedTapeV1 = S.Struct({
  formatVersion: S.Literal(1),
  programId: S.Literal('message-versioning'),
  programVersion: S.Literal(1),
  initialModel: Model,
  initialCommands: S.Array(S.Json),
  transitions: S.Array(
    S.Struct({ ...EncodedTransitionFields, message: WireMessageV1 }),
  ),
})

const EncodedTapeV2 = S.Struct({
  formatVersion: S.Literal(1),
  programId: S.Literal('message-versioning'),
  programVersion: S.Literal(2),
  initialModel: Model,
  initialCommands: S.Array(S.Json),
  transitions: S.Array(
    S.Struct({ ...EncodedTransitionFields, message: Message }),
  ),
})

const migrateTapeV0ToV1 = (encodedTape: S.Json): S.Json => {
  const tape = S.decodeUnknownSync(EncodedTapeV0)(encodedTape)
  return EncodedTapeV1.make({
    ...tape,
    programVersion: 1,
    transitions: Array.map(tape.transitions, transition => ({
      ...transition,
      message: upgradeV0ToV1(transition.message),
    })),
  })
}

const migrateTapeV1ToV2 = (encodedTape: S.Json): S.Json => {
  const tape = S.decodeUnknownSync(EncodedTapeV1)(encodedTape)
  return EncodedTapeV2.make({
    ...tape,
    programVersion: 2,
    transitions: Array.map(tape.transitions, transition => ({
      ...transition,
      message: upgradeV1ToCurrent(transition.message),
    })),
  })
}

/** Applies one current Message without depending on its historical wire shape. */
export const update = (
  model: Model,
  message: Message,
): readonly [Model, ReadonlyArray<never>] =>
  M.value(message).pipe(
    M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
    M.tagsExhaustive({
      AdjustedCounter: ({ amount }) => [{ count: model.count + amount }, []],
    }),
  )

/** The current Program with deterministic replay migrations from v0 and v1. */
export const MessageVersioningProgram: Program.Program<Model, Message> =
  Program.make({
    id: 'message-versioning',
    version: 2,
    Model,
    Message,
    init: () => [Model.make({ count: 0 }), []],
    update,
    migrations: [
      { fromVersion: 0, toVersion: 1, migrate: migrateTapeV0ToV1 },
      { fromVersion: 1, toVersion: 2, migrate: migrateTapeV1ToV2 },
    ],
  })

/** A valid v0 replay tape fixture used to prove current replay compatibility. */
export const replayTapeV0 = EncodedTapeV0.make({
  formatVersion: 1,
  programId: 'message-versioning',
  programVersion: 0,
  initialModel: Model.make({ count: 0 }),
  initialCommands: [],
  transitions: [
    {
      sequence: 1,
      message: WireMessageV0.make({
        eventId: counterAdjustedEventId,
        version: 0,
        payload: { delta: 3 },
      }),
      source: { _tag: 'Host', actionName: 'adjust' },
      isOperationSettled: true,
      commands: [],
      timestamp: 1,
    },
  ],
})
