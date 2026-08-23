import { Effect, Layer, Option } from 'effect'
import { Processor, Program, Runtime } from 'foldkit'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FoldkitPuzzleV01,
  GuessedNo,
  GuessedYes,
  type Message,
  PuzzleProgram,
  ResetTape,
  SyncedPuzzle,
  type SyncedPuzzleHandle,
  demoModel,
  emptyModel,
  makeMemorySnapshotLogTransport,
  memorySyncedEngine,
  startSyncedPuzzleHandle,
  update,
  uriOf,
  waitForSyncedHandle,
} from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

import { readyCount } from './cliError.js'
import { executeDo, executeReplay, executeShow } from './host.js'
import { puzzleCliProgramId } from './isolation.js'
import { settleAfterSend, waitForReadyCountChange } from './session.js'

process.env['PUZZLE_TAPE'] = 'memory'

const [afterYes] = update(emptyModel(), GuessedYes())
const [afterNo] = update(emptyModel(), GuessedNo())

const writeTape = async (messages: ReadonlyArray<Message>): Promise<string> => {
  const tape = await Effect.runPromise(
    Effect.scoped(
      Runtime.recordReplayTape(PuzzleProgram, Layer.empty, messages),
    ),
  )
  const json = await Effect.runPromise(
    Runtime.encodeReplayTape(PuzzleProgram, tape),
  )
  const dir = mkdtempSync(join(tmpdir(), 'puzzle-tape-'))
  const path = join(dir, 'tape.json')
  writeFileSync(path, json)
  return path
}

describe('Puzzle CLI host', () => {
  it('uses the live Instant app id for daemon isolation', () => {
    expect(puzzleCliProgramId).toBe(FoldkitPuzzleV01.id)
  })

  it('shows the imported initial Model without a Message or chrome', async () => {
    const execution = await Effect.runPromise(executeShow(undefined, undefined))

    expect(execution.initialModel).toEqual(demoModel())
    expect(execution.maybeMessage).toEqual(Option.none())
    expect(execution.finalModel).toBe(execution.initialModel)
    expect(execution.stdout).toContain('uri      /puzzle')
    expect(execution.stdout).toContain(`tape     ${uriOf(demoModel())}`)
    expect(execution.stdout).toContain('valid          false')
    expect(execution.stdout).not.toContain('device')
    expect(execution.stdout).not.toContain('[ y ]')
    expect(execution.stdout).not.toContain('laptop')
  })

  it('wraps the product tree when --device phone is set', async () => {
    const execution = await Effect.runPromise(executeShow('phone', undefined))

    expect(execution.stdout).toContain('device   phone')
    expect(execution.stdout).toContain('[ reset ]')
    expect(execution.stdout).toContain('https://puzzle.knophy.com')
    expect(execution.stdout).toContain('https://replicate.knophy.com')
    expect(execution.stdout).toContain('https://grok.knophy.com')
    expect(execution.stdout).not.toContain('[ y ]')
    expect(execution.stdout).not.toContain('laptop')
    expect(execution.stdout).not.toContain('github.com')
  })

  it('rejects laptop as a Device', async () => {
    await expect(
      Effect.runPromise(executeShow('laptop', undefined)),
    ).rejects.toThrow('Unknown device "laptop"')
  })

  it('settles yes from the local write, not an Instant echo', async () => {
    let model = emptyModel()
    let write = Option.none<{
      readonly link: 'offline' | 'queued' | 'delivered'
    }>()
    const handle: SyncedPuzzleHandle = {
      actions: () => {
        throw new Error('settleAfterSend does not read actions.')
      },
      lastWrite: () => write,
      readModel: () =>
        SyncedPuzzle.Ready({
          product: model,
          actionMenu: Program.Closed(),
        }),
      send: () => {
        const [next] = update(model, GuessedYes())
        model = next
        write = Option.some({ link: 'delivered' })
      },
      stop: () => Promise.resolve(),
      subscribe: () => () => undefined,
    }
    handle.send(GuessedYes())
    const settled = await Effect.runPromise(settleAfterSend(handle))
    expect(settled.model).toEqual(afterYes)
    expect(settled.write).toEqual(Option.some({ link: 'delivered' }))
  })

  it('waits for the tape URI after reset', async () => {
    const handle = startSyncedPuzzleHandle(
      memorySyncedEngine(Processor.Host.Cli()),
    )
    await waitForSyncedHandle(handle)
    const previous = await Effect.runPromise(readyCount(handle.readModel()))
    handle.send(ResetTape())
    const next = await Effect.runPromise(
      waitForReadyCountChange(handle, previous),
    )
    expect(next).toEqual(emptyModel())
    await handle.stop()
  })

  it('sends reset and auto-shows the empty tape', async () => {
    const execution = await Effect.runPromise(executeDo('reset'))

    expect(execution.maybeMessage).toEqual(Option.some(ResetTape()))
    expect(execution.finalModel).toEqual(emptyModel())
    expect(execution.stdout).toContain('reset sent')
    expect(execution.stdout).toContain('from           cli')
    expect(execution.stdout).toContain('via            argv')
    expect(execution.stdout).toContain('tape           appended')
    expect(execution.stdout).toContain('link           offline')
    expect(execution.stdout).toContain(`tape     ${uriOf(emptyModel())}`)
  })

  it('starts no from an empty tape after reset', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(executeDo('reset', { snapshot }))
    const execution = await Effect.runPromise(executeDo('no', { snapshot }))

    expect(execution.maybeMessage).toEqual(Option.some(GuessedNo()))
    expect(execution.finalModel).toEqual(afterNo)
    expect(execution.stdout).toContain('no sent')
  })

  it('logs an invalid yes on ReplicateStep and does not send GuessedYes', async () => {
    const execution = await Effect.runPromise(executeDo('yes'))

    expect(execution.maybeMessage).toEqual(Option.none())
    expect(execution.finalModel).toEqual(demoModel())
    expect(execution.stdout).toContain(
      'log  attempted to invoke invalid action yes',
    )
    expect(execution.stdout).toContain(`state  tape ${uriOf(demoModel())}`)
  })

  it('does not persist the tape into the next process', async () => {
    await Effect.runPromise(executeDo('reset'))
    const shown = await Effect.runPromise(executeShow(undefined, undefined))

    expect(shown.finalModel).toEqual(demoModel())
    expect(shown.stdout).toContain(`tape     ${uriOf(demoModel())}`)
    expect(ResetTape.valid(shown.finalModel, {})).toBe(true)
  })

  it('persists reset then yes on a shared tape snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(executeDo('reset', { snapshot }))
    await Effect.runPromise(executeDo('yes', { snapshot }))
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { snapshot }),
    )

    expect(shown.finalModel).toEqual(afterYes)
    expect(shown.stdout).toContain(`tape     ${uriOf(afterYes)}`)
    expect(ResetTape.valid(shown.finalModel, {})).toBe(true)
  })

  it('lets a second Processor read the same tape snapshot', async () => {
    const snapshot = await Effect.runPromise(makeMemorySnapshotLogTransport())
    await Effect.runPromise(executeDo('reset', { snapshot }))
    await Effect.runPromise(executeDo('yes', { snapshot }))
    const shown = await Effect.runPromise(
      executeShow(undefined, undefined, { snapshot }),
    )
    const again = await Effect.runPromise(executeDo('yes', { snapshot }))
    const [afterTwo] = update(afterYes, GuessedYes())

    expect(shown.finalModel).toEqual(afterYes)
    expect(again.finalModel).toEqual(afterTwo)
    expect(again.link).toBe('delivered')
  })

  it('replays a Program tape through Runtime.replayToFrame', async () => {
    const path = await writeTape([ResetTape(), GuessedYes()])
    const execution = await Effect.runPromise(executeReplay(path))

    expect(execution.models).toEqual([demoModel(), emptyModel(), afterYes])
    expect(execution.stdout).toContain('FRAME 0')
    expect(execution.stdout).toContain('FRAME 1')
    expect(execution.stdout).toContain('FRAME 2')
    expect(execution.stdout).toContain('ResetTape')
    expect(execution.stdout).toContain('GuessedYes')
    expect(execution.stdout).toContain(`tape     ${uriOf(demoModel())}`)
    expect(execution.stdout).toContain(`tape     ${uriOf(emptyModel())}`)
    expect(execution.stdout).toContain(`tape     ${uriOf(afterYes)}`)
    expect(execution.stdout).toContain('yes         true')
    expect(execution.stdout).toContain('reset       false')
    expect(execution.stdout).toContain('reset       true')
    expect(execution.stdout).toContain('[ y ]')
    expect(execution.stdout).toContain('[ reset ]')
  })
})
