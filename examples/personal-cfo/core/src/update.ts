import { Match as M, Option } from 'effect'
import { Command } from 'foldkit'

import {
  AddAccount,
  AddVault,
  ArmRadar,
  EnqueueNotification,
  Login,
  Logout,
  RestoreSession,
  SendChat,
  TickRadar,
} from './command.js'
import { parseEmail } from './domain.js'
import type { Ledger } from './ledger.js'
import { type Message } from './message.js'
import { Model, emptyModel, withSnapshot } from './model.js'
import type { Notifier } from './notifier.js'

type Resources = Ledger | Notifier

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, Resources>>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const working = (model: Model): Model =>
  Model.make({
    ...model,
    status: 'working',
    maybeError: Option.none(),
  })

const gated = (
  model: Model,
  commands: ReadonlyArray<Command.Command<Message, never, Resources>>,
): UpdateReturn => {
  if (model.session._tag !== 'Authenticated' || model.status !== 'idle') {
    return [model, []]
  }
  return [working(model), commands]
}

/** Applies one Personal CFO Message. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      RequestedRestore: () =>
        model.status === 'idle'
          ? [working(model), [RestoreSession()]]
          : [model, []],
      RequestedLogin: ({ email }) => {
        if (model.session._tag !== 'Anonymous' || model.status !== 'idle') {
          return [model, []]
        }
        const parsed = parseEmail(email)
        if (Option.isNone(parsed)) {
          return [
            Model.make({
              ...model,
              maybeError: Option.some('Email is not valid.'),
            }),
            [],
          ]
        }
        return [working(model), [Login({ email: parsed.value })]]
      },
      RequestedLogout: () =>
        model.session._tag === 'Authenticated' && model.status === 'idle'
          ? [working(model), [Logout()]]
          : [model, []],
      RequestedOpen: ({ screen }) => {
        if (model.status !== 'idle') {
          return [model, []]
        }
        if (model.session._tag === 'Anonymous') {
          return [Model.make({ ...model, screen: 'sign-in' }), []]
        }
        if (screen === 'sign-in') {
          return [Model.make({ ...model, screen: 'dashboard' }), []]
        }
        return [Model.make({ ...model, screen }), []]
      },
      RequestedAddAccount: ({ name, institution, kind, balanceCents }) =>
        gated(model, [AddAccount({ name, institution, kind, balanceCents })]),
      RequestedAddVault: ({ title, origin }) =>
        gated(model, [AddVault({ title, origin })]),
      RequestedArmRadar: ({ question, cadence, everyMinutes }) =>
        gated(model, [ArmRadar({ question, cadence, everyMinutes })]),
      RequestedRadarTick: () => gated(model, [TickRadar()]),
      RequestedNotify: ({ title, body, channel }) =>
        gated(model, [EnqueueNotification({ title, body, channel })]),
      RequestedChat: ({ text }) => gated(model, [SendChat({ text })]),
      SucceededSnapshot: ({ snapshot }) => [withSnapshot(model, snapshot), []],
      FailedLedger: ({ error }) => [
        Model.make({
          ...model,
          status: 'idle',
          maybeError: Option.some(error),
        }),
        [],
      ],
    }),
  )

export { emptyModel }
