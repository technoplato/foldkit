import { Effect, Layer } from 'effect'
import { Interaction, Processor, Runtime } from 'foldkit'
import { runProgramCommand } from 'foldkit/cli'
import {
  type BoundReminders,
  SyncedReminders,
  bindReminders,
  hostCalendar,
  makeTestLinkSharing,
  makeTestRemindersStore,
  sampleBoard,
  sampleListIds,
  whenBoardOpened,
} from 'reminders-core-example'
import { afterEach, describe, expect, it } from 'vitest'

const started: Array<{ stop: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(started.splice(0).map(handle => handle.stop()))
})

const oatMilk = '00000000-0000-4000-8003-000000000001'

const pollMs = 20

const openReminders = async (): Promise<BoundReminders> => {
  const store = await Effect.runPromise(
    makeTestRemindersStore(
      sampleBoard(hostCalendar.localOf(Date.now()).day),
      hostCalendar,
    ),
  )
  const sharing = await Effect.runPromise(makeTestLinkSharing())
  const handle = Runtime.startHandle({
    program: SyncedReminders,
    sync: Runtime.Memory({ processor: 'cli-test' }),
    resources: Layer.mergeAll(store.layer, sharing.layer),
    host: Processor.Host.Cli(),
  })
  started.push(handle)
  const bound = bindReminders(handle)
  await Interaction.whenSettled(bound, 2_000)
  await whenBoardOpened(handle, 2_000)
  return bound
}

const run = (bound: BoundReminders, ...words: ReadonlyArray<string>) =>
  runProgramCommand(bound, 'reminders', words, {})

const eventuallyPainted = (
  bound: BoundReminders,
  isPainted: (stdout: string) => boolean,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const startedAtMs = Date.now()
    const check = (): void => {
      const { stdout } = run(bound)
      if (isPainted(stdout)) {
        resolve(stdout)
      } else if (Date.now() - startedAtMs > 2_000) {
        reject(new Error(`never painted as expected:\n${stdout}`))
      } else {
        setTimeout(check, pollMs)
      }
    }
    check()
  })

describe('reminders CLI', () => {
  it('paints home and every Action with its command', async () => {
    const bound = await openReminders()
    const { stdout } = run(bound)
    expect(stdout).toMatch(/Groceries/)
    expect(stdout).toMatch(/#chores/)
    expect(stdout).toMatch(/^ {2}add-reminder <title> +Adds a reminder/m)
    expect(stdout).toMatch(/^ {2}open-smart-list <smart-list> +Opens a smart/m)
  })

  it('opens a list at its address, then adds a reminder there with its words', async () => {
    const bound = await openReminders()
    const at = `/reminders/lists/${sampleListIds.groceries}`
    expect(run(bound, 'open', at).exitCode).toBe(0)
    expect(run(bound, 'where').stdout).toBe(at)
    expect(run(bound, 'add-reminder', 'Buy', 'bread').exitCode).toBe(0)
    expect(
      await eventuallyPainted(bound, out => out.includes('Buy bread')),
    ).toMatch(/Buy bread/)
  })

  it('ticks a reminder done by its id, and it leaves the open list', async () => {
    const bound = await openReminders()
    run(bound, 'open', `/reminders/lists/${sampleListIds.groceries}`)
    expect(run(bound).stdout).toMatch(/Oat milk/)
    expect(run(bound, 'complete', oatMilk).exitCode).toBe(0)
    expect(
      await eventuallyPainted(bound, out => !out.includes('Oat milk')),
    ).toMatch(/Sourdough loaf/)
  })
})
