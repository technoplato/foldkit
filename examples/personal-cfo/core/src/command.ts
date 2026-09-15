import { Effect, Schema as S } from 'effect'
import { Command } from 'foldkit'

import {
  AccountKind,
  CadenceTag,
  NotifyChannel,
  VaultOrigin,
} from './domain.js'
import { Ledger } from './ledger.js'
import { FailedLedger, SucceededSnapshot } from './message.js'
import { Notifier } from './notifier.js'

const fail = (reason: string) => Effect.succeed(FailedLedger({ error: reason }))

/** Restores the Ledger snapshot. */
export const RestoreSession = Command.define(
  'RestoreSession',
  SucceededSnapshot,
  FailedLedger,
)(
  Ledger.pipe(
    Effect.flatMap(ledger => ledger.restore),
    Effect.map(snapshot => SucceededSnapshot({ snapshot })),
    Effect.catch(error => fail(error.reason)),
  ),
)

/** Opens a Free session. */
export const Login = Command.define(
  'Login',
  { email: S.String },
  SucceededSnapshot,
  FailedLedger,
)(({ email }) =>
  Ledger.pipe(
    Effect.flatMap(ledger => ledger.login(email)),
    Effect.map(snapshot => SucceededSnapshot({ snapshot })),
    Effect.catch(error => fail(error.reason)),
  ),
)

/** Closes the session. */
export const Logout = Command.define(
  'Logout',
  SucceededSnapshot,
  FailedLedger,
)(
  Ledger.pipe(
    Effect.flatMap(ledger => ledger.logout),
    Effect.map(snapshot => SucceededSnapshot({ snapshot })),
    Effect.catch(error => fail(error.reason)),
  ),
)

/** Adds one manual read-only account. */
export const AddAccount = Command.define(
  'AddAccount',
  {
    name: S.String,
    institution: S.String,
    kind: AccountKind,
    balanceCents: S.Number,
  },
  SucceededSnapshot,
  FailedLedger,
)(input =>
  Ledger.pipe(
    Effect.flatMap(ledger => ledger.addAccount(input)),
    Effect.map(snapshot => SucceededSnapshot({ snapshot })),
    Effect.catch(error => fail(error.reason)),
  ),
)

/** Files one vault stub. */
export const AddVault = Command.define(
  'AddVault',
  { title: S.String, origin: VaultOrigin },
  SucceededSnapshot,
  FailedLedger,
)(input =>
  Ledger.pipe(
    Effect.flatMap(ledger => ledger.addVault(input)),
    Effect.map(snapshot => SucceededSnapshot({ snapshot })),
    Effect.catch(error => fail(error.reason)),
  ),
)

/** Arms one Radar job. */
export const ArmRadar = Command.define(
  'ArmRadar',
  {
    question: S.String,
    cadence: CadenceTag,
    everyMinutes: S.Number,
  },
  SucceededSnapshot,
  FailedLedger,
)(input =>
  Ledger.pipe(
    Effect.flatMap(ledger => ledger.armRadar(input)),
    Effect.map(snapshot => SucceededSnapshot({ snapshot })),
    Effect.catch(error => fail(error.reason)),
  ),
)

/** Recomputes armed Radar jobs and delivers findings locally. */
export const TickRadar = Command.define(
  'TickRadar',
  SucceededSnapshot,
  FailedLedger,
)(
  Effect.gen(function* () {
    const ledger = yield* Ledger
    const notifier = yield* Notifier
    const result = yield* ledger.tickRadar
    for (const finding of result.findings) {
      const last = result.snapshot.notifications.find(
        notification => notification.body === finding.answer,
      )
      if (last !== undefined) {
        yield* notifier.deliverLocal(last).pipe(Effect.catch(() => Effect.void))
      }
    }
    return SucceededSnapshot({ snapshot: result.snapshot })
  }).pipe(
    Effect.catch(error =>
      fail('reason' in error ? String(error.reason) : 'Radar tick failed'),
    ),
  ),
)

/** Enqueues a notification and delivers it locally. */
export const EnqueueNotification = Command.define(
  'EnqueueNotification',
  {
    title: S.String,
    body: S.String,
    channel: NotifyChannel,
  },
  SucceededSnapshot,
  FailedLedger,
)(input =>
  Effect.gen(function* () {
    const ledger = yield* Ledger
    const notifier = yield* Notifier
    const snapshot = yield* ledger.enqueueNotification(input)
    const last = snapshot.notifications[snapshot.notifications.length - 1]
    if (last !== undefined) {
      yield* notifier.deliverLocal(last).pipe(Effect.catch(() => Effect.void))
    }
    return SucceededSnapshot({ snapshot })
  }).pipe(
    Effect.catch(error =>
      fail(error instanceof Error ? error.message : 'Notify failed'),
    ),
  ),
)

/** Sends a grounded chat turn. */
export const SendChat = Command.define(
  'SendChat',
  { text: S.String },
  SucceededSnapshot,
  FailedLedger,
)(({ text }) =>
  Ledger.pipe(
    Effect.flatMap(ledger => ledger.sendChat({ text })),
    Effect.map(snapshot => SucceededSnapshot({ snapshot })),
    Effect.catch(error => fail(error.reason)),
  ),
)
