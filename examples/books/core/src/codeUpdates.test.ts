import { Array, Effect, Layer, Option, Schema as S, Stream } from 'effect'
import { Catalog, Interaction, Processor, Runtime } from 'foldkit'
import * as CodeUpdates from 'foldkit/code-updates'
import type { ListItem, UiNode } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { init } from './init.js'
import { startMadeUpBooks } from './madeUp.js'
import {
  type Message,
  RestartToUpdate,
  ShowLibrary,
  ShowProfile,
  catalog,
} from './message.js'
import { Model } from './model.js'
import { BooksProgram, isLocalOnlyMessage } from './program.js'
import { profileScreen } from './screen.js'
import { subscriptions } from './subscriptions.js'
import { bindBooks } from './synced.js'
import { update } from './update.js'

const madeAtMs = Date.UTC(2026, 10, 20, 19, 37)

const runningId = '1a2b3c4d-0000-4000-8000-000000000000'

const newerId = '9f8e7d6c-0000-4000-8000-000000000000'

const running = CodeUpdates.Update({
  maybeUpdateId: Option.some(runningId),
  maybeRuntime: Option.some('runtime-1'),
  maybeMadeAtMs: Option.some(madeAtMs),
})

const ready = CodeUpdates.Ready({ maybeUpdateId: Option.some(newerId) })

const said = (newer: CodeUpdates.NewerCode) =>
  CodeUpdates.ObservedCodeStatus({ status: { running, newer } })

const after = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  Array.reduce(messages, model, (state, message) => update(state, message)[0])

const onProfile = after(init()[0], ShowProfile())

const listsIn = (node: UiNode): ReadonlyArray<ReadonlyArray<ListItem>> => {
  if (node._tag === 'List') {
    return [node.label === 'Updates' ? node.items : []]
  } else if ('children' in node) {
    return Array.flatMap(node.children, listsIn)
  } else {
    return []
  }
}

const updateRowsOf = (model: Model): ReadonlyArray<ListItem> =>
  Array.flatten(listsIn(profileScreen(model)))

const updateTextOf = (model: Model): ReadonlyArray<ReadonlyArray<string>> =>
  Array.map(updateRowsOf(model), row => [row.title, ...(row.lines ?? [])])

const synchronization = Option.getOrThrow(
  Option.fromNullishOr(BooksProgram.synchronization),
)

describe('which update Books runs, on the device it runs on', () => {
  it('is nothing until the host says, then what the host said last', () => {
    expect(init()[0].maybeCodeStatus).toEqual(Option.none())
    const told = after(onProfile, said(CodeUpdates.Asking()), said(ready))
    expect(told.maybeCodeStatus).toEqual(Option.some({ running, newer: ready }))
  })

  it('hears the host for as long as it runs', () => {
    expect(Object.keys(subscriptions)).toContain('codeStatus')
  })

  it('never reaches the log: the fact, the restart and what came of it stay on this device', () => {
    expect(isLocalOnlyMessage(said(ready))).toBe(true)
    expect(isLocalOnlyMessage(RestartToUpdate())).toBe(true)
    expect(isLocalOnlyMessage(CodeUpdates.CompletedRestartOnNewerCode())).toBe(
      true,
    )
    expect(
      isLocalOnlyMessage(
        CodeUpdates.FailedRestartOnNewerCode({ reason: 'not now' }),
      ),
    ).toBe(true)
    expect(isLocalOnlyMessage(ShowLibrary())).toBe(false)
  })

  it('survives a refold of the log, which never held it', () => {
    const told = after(onProfile, said(ready))
    const refolded = init()[0]
    expect(
      synchronization.keepOnRefold?.(told, refolded).maybeCodeStatus,
    ).toEqual(told.maybeCodeStatus)
  })

  it('is not kept across a restart, where it would name the update before', () => {
    const told = after(onProfile, said(ready))
    expect(synchronization.projectLocal?.(told).maybeCodeStatus).toEqual(
      Option.none(),
    )
  })

  it('leaves a Model saved before it existed readable, and the saved shape as it was', () => {
    const saved: unknown = S.encodeSync(S.toCodecJson(Model))(init()[0])
    expect(JSON.stringify(saved)).not.toContain('maybeCodeStatus')
    expect(
      S.decodeUnknownSync(S.toCodecJson(Model))(saved).maybeCodeStatus,
    ).toEqual(Option.none())
    const told = after(onProfile, said(ready))
    expect(
      S.decodeUnknownSync(S.toCodecJson(Model))(
        JSON.parse(JSON.stringify(S.encodeSync(S.toCodecJson(Model))(told))),
      ).maybeCodeStatus,
    ).toEqual(told.maybeCodeStatus)
  })
})

describe('Updates on Profile', () => {
  it('is absent where the host says nothing, as in a browser or a terminal', () => {
    expect(updateRowsOf(onProfile)).toEqual([])
    expect(JSON.stringify(profileScreen(onProfile))).not.toContain('Updates')
  })

  it('names the update running and when it was made, then that none is newer', () => {
    expect(
      updateTextOf(after(onProfile, said(CodeUpdates.NoneNewer()))),
    ).toEqual([
      ['Running update 1a2b3c4d', `Made ${CodeUpdates.madeAtTextOf(madeAtMs)}`],
      ['No newer update'],
    ])
  })

  it('says it runs the code it was built with when no update was taken', () => {
    const builtIn = CodeUpdates.BuiltIn({
      maybeUpdateId: Option.some('built-in-id'),
      maybeRuntime: Option.some('runtime-1'),
      maybeMadeAtMs: Option.none(),
    })
    const told = after(
      onProfile,
      CodeUpdates.ObservedCodeStatus({
        status: { running: builtIn, newer: CodeUpdates.NotAsked() },
      }),
    )
    expect(updateTextOf(told)).toEqual([
      ['Running the code this app was built with'],
      ['Has not asked for a newer update'],
    ])
  })

  it('says where asking for a newer update stands, in each state', () => {
    const second = (newer: CodeUpdates.NewerCode) =>
      Option.getOrElse(
        Array.get(updateTextOf(after(onProfile, said(newer))), 1),
        () => [],
      )
    expect(second(CodeUpdates.Asking())).toEqual(['Asking for a newer update…'])
    expect(
      second(CodeUpdates.Found({ maybeUpdateId: Option.some(newerId) })),
    ).toEqual(['A newer update is out', 'Update 9f8e7d6c is not fetched yet'])
    expect(second(CodeUpdates.Fetching())).toEqual(['Fetching a newer update…'])
    expect(second(ready)).toEqual([
      'A newer update is ready',
      'Update 9f8e7d6c runs after a restart',
    ])
    expect(
      second(CodeUpdates.CouldNotAsk({ why: 'The request timed out.' })),
    ).toEqual(['Could not ask for a newer update', 'The request timed out.'])
    expect(
      second(CodeUpdates.CouldNotFetch({ why: 'No space left.' })),
    ).toEqual(['Could not fetch the newer update', 'No space left.'])
  })

  it('offers Restart once a newer update is fetched, and not before', () => {
    const buttonsOf = (newer: CodeUpdates.NewerCode) =>
      Array.map(
        Array.flatMap(
          Array.drop(updateRowsOf(after(onProfile, said(newer))), 1),
          row => row.trailing ?? [],
        ),
        button => [button.label, button.action],
      )
    expect(buttonsOf(ready)).toEqual([['Restart', 'RestartToUpdate']])
    expect(buttonsOf(CodeUpdates.Fetching())).toEqual([])
    expect(buttonsOf(CodeUpdates.NoneNewer())).toEqual([])
  })
})

describe('restarting on the newer update', () => {
  const entryOf = (model: Model) =>
    Array.findFirst(
      Catalog.entries(catalog, model),
      entry => entry.tag === RestartToUpdate.tag,
    )

  it('is an Action in the Catalog, offered only once an update is fetched', () => {
    expect(Option.map(entryOf(onProfile), entry => entry.availability)).toEqual(
      Option.some(
        Catalog.Disabled({ because: 'this device takes no updates' }),
      ),
    )
    expect(
      Option.map(
        entryOf(after(onProfile, said(CodeUpdates.Fetching()))),
        entry => entry.availability,
      ),
    ).toEqual(
      Option.some(
        Catalog.Disabled({ because: 'no newer update is fetched yet' }),
      ),
    )
    expect(
      Option.map(
        entryOf(after(onProfile, said(ready))),
        entry => entry.availability,
      ),
    ).toEqual(Option.some(Catalog.Enabled()))
  })

  it('asks the host to restart, and changes nothing else', () => {
    const told = after(onProfile, said(ready))
    const [next, commands] = update(
      told,
      Option.getOrThrow(Catalog.messageFor(catalog, told, 'RestartToUpdate')),
    )
    expect(next).toEqual(told)
    expect(Array.map(commands, command => command.name)).toEqual([
      CodeUpdates.RestartOnNewerCode.name,
    ])
    expect(Catalog.messageFor(catalog, onProfile, 'RestartToUpdate')).toEqual(
      Option.none(),
    )
  })

  it('says so on Profile when the host refuses', () => {
    const refused = after(
      onProfile,
      said(ready),
      CodeUpdates.FailedRestartOnNewerCode({ reason: 'not now' }),
    )
    expect(refused.maybeNotice).toEqual(
      Option.some('Could not restart: not now'),
    )
    expect(JSON.stringify(profileScreen(refused))).toContain(
      'Could not restart: not now',
    )
    expect(refused.maybeCodeStatus).toEqual(
      Option.some({ running, newer: ready }),
    )
  })
})

describe('a phone that takes updates, beside a device that takes none', () => {
  const settleMs = 3_000

  const waitMs = 20_000

  const testTimeoutMs = 30_000

  const waitUntil = async (isSo: () => boolean): Promise<void> => {
    const deadline = Date.now() + waitMs
    while (!isSo() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  it('keeps what its host says to itself: the other device’s Model and the shared log never hold it, and Restart reaches the host', async () => {
    const store = Runtime.makeMemoryStore()
    const restarts = { count: 0 }
    const phone = await startMadeUpBooks({
      host: Processor.Host.ExpoIos(),
      sync: Runtime.Memory({ processor: 'phone', store }),
      resources: Layer.succeed(CodeUpdates.CodeUpdates, {
        statuses: Stream.make({ running, newer: ready }),
        restart: Effect.sync(() => {
          restarts.count += 1
        }),
      }),
    })
    const terminal = await startMadeUpBooks({
      host: Processor.Host.Cli(),
      sync: Runtime.Memory({ processor: 'terminal', store }),
    })
    const onPhone = bindBooks(phone)
    const onTerminal = bindBooks(terminal)
    await Interaction.whenSettled(onPhone, settleMs)
    await Interaction.whenSettled(onTerminal, settleMs)
    const statusOn = (bound: typeof onPhone) => {
      const model = bound.readModel()
      return model._tag === 'Ready' ? model.maybeCodeStatus : Option.none()
    }
    const addressOn = (bound: typeof onPhone): string =>
      Option.match(bound.navigation(), {
        onNone: () => '',
        onSome: plan => plan.uri,
      })
    await waitUntil(() => Option.isSome(statusOn(onPhone)))
    expect(statusOn(onPhone)).toEqual(Option.some({ running, newer: ready }))

    const startedAt = addressOn(onTerminal)
    expect(onPhone.press('MirrorNavigation')).toBe(true)
    expect(onPhone.press('ShowProfile')).toBe(true)
    await waitUntil(() => addressOn(onTerminal) !== startedAt)
    expect(addressOn(onTerminal)).not.toBe(startedAt)
    expect(addressOn(onTerminal)).toBe(addressOn(onPhone))
    expect(onPhone.press('RestartToUpdate')).toBe(true)
    await waitUntil(() => restarts.count === 1)

    expect(restarts.count).toBe(1)
    expect(statusOn(onPhone)).toEqual(Option.some({ running, newer: ready }))
    expect(statusOn(onTerminal)).toEqual(Option.none())
    expect(onTerminal.press('RestartToUpdate')).toBe(false)
    const shared = JSON.stringify([
      store.messages,
      store.snapshot,
      Array.fromIterable(store.sharedSnapshots.values()),
    ])
    expect(shared).toContain('ShowProfile')
    expect(shared).not.toContain('CodeStatus')
    expect(shared).not.toContain('RestartToUpdate')
    expect(shared).not.toContain(runningId)
    expect(shared).not.toContain(newerId)
    await phone.stop()
    await terminal.stop()
  }, testTimeoutMs)
})
