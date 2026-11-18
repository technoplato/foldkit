import { Clock, Effect, Option, Stream } from 'effect'
import { Subscription } from 'foldkit'

import { hostCalendar } from './calendar.js'
import {
  FailedReadBoard,
  type Message,
  ReachedDay,
  ReceivedBoard,
  ReceivedSignedOut,
} from './message.js'
import type { Model } from './model.js'
import type { RemindersServices } from './services.js'
import { RemindersStore } from './store.js'

// SUBSCRIPTION

const dayCheckEvery = '1 minute'

/**
 * Today on this device's calendar: once when the Program starts, then
 * again whenever the day turns over. The clock is read each minute, so a
 * laptop that slept past midnight catches up within a minute of waking.
 */
export const todayStream: Stream.Stream<Message> = Stream.tick(
  dayCheckEvery,
).pipe(
  Stream.mapEffect(() =>
    Effect.map(
      Clock.currentTimeMillis,
      nowMs => hostCalendar.localOf(nowMs).day,
    ),
  ),
  Stream.changes,
  Stream.map(today => ReachedDay({ today })),
)

/**
 * What Reminders listens to for as long as it runs: the board from the
 * store, sent again on every change from any device and from the Swift
 * app, and today on this device's calendar.
 */
export const subscriptions = Subscription.make<
  Model,
  Message,
  RemindersServices
>()(entry => ({
  board: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const store = yield* RemindersStore
            return store.board.pipe(
              Stream.map(maybeBoard =>
                Option.match(maybeBoard, {
                  onNone: () => ReceivedSignedOut(),
                  onSome: board => ReceivedBoard({ board }),
                }),
              ),
              Stream.catch(error =>
                Stream.make(FailedReadBoard({ reason: error.reason })),
              ),
            )
          }),
        ),
    },
  ),
  today: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () => todayStream,
    },
  ),
}))
