import { Context, Data, Effect } from 'effect'

import { type AppNotification } from './domain.js'

/** Local delivery failed. The ledger row may still exist. */
export class NotifierError extends Data.TaggedError('NotifierError')<{
  readonly reason: string
}> {}

/** Host-owned local / in-app delivery. Push credentials stay out of core. */
export type NotifierService = Readonly<{
  deliverLocal: (
    notification: AppNotification,
  ) => Effect.Effect<void, NotifierError>
}>

/** Injected local notifier. CLI uses osascript; Expo uses the platform. */
export class Notifier extends Context.Service<Notifier, NotifierService>()(
  'personal-cfo/Notifier',
) {}
