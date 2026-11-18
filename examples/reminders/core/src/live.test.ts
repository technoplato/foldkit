import { Array, Effect } from 'effect'
import { Interaction, Runtime } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { hostCalendar } from './calendar.js'
import { makeTestRemindersStore, sampleBoard, sampleListIds } from './sample.js'
import { SyncedReminders, bindReminders } from './synced.js'

const pollMs = 10
const pollAttempts = 200

const eventually = async (
  isDone: () => boolean,
  attemptsLeft = pollAttempts,
): Promise<void> => {
  if (isDone()) {
    return
  } else if (attemptsLeft === 0) {
    throw new Error('never happened')
  } else {
    await new Promise(resolve => setTimeout(resolve, pollMs))
    return eventually(isDone, attemptsLeft - 1)
  }
}

const startReminders = async () => {
  const today = hostCalendar.localOf(Date.now()).day
  const store = await Effect.runPromise(
    makeTestRemindersStore(sampleBoard(today), hostCalendar),
  )
  const handle = Runtime.startHandle({
    program: SyncedReminders,
    sync: Runtime.Memory({ processor: 'reminders-test' }),
    resources: store.layer,
  })
  return { store, handle, bound: bindReminders(handle) }
}

describe('live Reminders', () => {
  it('reads the board and today, adds a reminder through the store, and shows it', async () => {
    const { store, handle, bound } = await startReminders()
    await Interaction.whenSettled(bound, 2_000)
    await eventually(() => {
      const model = handle.readModel()
      return (
        model._tag === 'Ready' &&
        model.board._tag === 'BoardReady' &&
        model.maybeToday._tag === 'Some'
      )
    })
    bound.press(`OpenList:${sampleListIds.groceries}`)
    bound.press('AddReminder:Basil')
    await eventually(() => {
      const model = handle.readModel()
      return (
        model._tag === 'Ready' &&
        model.board._tag === 'BoardReady' &&
        Array.some(
          model.board.board.reminders,
          reminder => reminder.title === 'Basil',
        )
      )
    })
    const writes = await Effect.runPromise(store.writes)
    expect(Array.map(writes, write => write._tag)).toEqual(['InsertReminder'])
    await handle.stop()
  })
})
