import { Effect, Stream } from 'effect'
import { Processor } from 'foldkit'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { InstantLogMessageRecord } from '@foldkit/instant'

import { makeMemoryPuzzleSnapshotLogTransport } from './instantMemory.js'
import {
  type PuzzleSnapshotLogTransport,
  emptyInstantPuzzleSnapshot,
  instantReadTimeoutMs,
} from './instantSchema.js'
import { ResetTape } from './message.js'
import { demoModel, emptyModel, uriOf } from './model.js'
import { startLivePuzzle } from './startLive.js'
import { waitForSyncedHandle, waitForSyncedHandleWrite } from './startSynced.js'
import { productOfReady } from './synced.js'
import { TAPE_UUID, TapeRow } from './wire.js'

const processEnv = (): Record<string, string | undefined> | undefined => {
  const runtime = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>
    }
  }
  return runtime.process?.env
}

describe('NodeLive', () => {
  it('prefers an injected transport even when PUZZLE_TAPE=memory', async () => {
    const env = processEnv()
    const previous = env?.['PUZZLE_TAPE']
    if (env !== undefined) {
      env['PUZZLE_TAPE'] = 'memory'
    }
    try {
      const transport = await Effect.runPromise(
        makeMemoryPuzzleSnapshotLogTransport(),
      )
      await Effect.runPromise(
        transport.write({
          message: InstantLogMessageRecord.make({
            createdAtMs: 1,
            from: 'test',
            id: '11111111-1111-4111-8111-111111111111',
            tag: 'ResetTape',
          }),
          snapshot: TapeRow.make({
            id: TAPE_UUID,
            asOf: 'foldkit',
            at: 1,
            steps: [],
            prompt: emptyModel().prompt,
          }),
        }),
      )
      const handle = startLivePuzzle(Processor.Host.Headless(), { transport })
      try {
        const snapshot = await waitForSyncedHandle(handle)
        const product = productOfReady(snapshot)
        expect(product).toBeDefined()
        if (product === undefined) {
          return
        }
        expect(uriOf(product)).toBe(uriOf(emptyModel()))
      } finally {
        await handle.stop()
      }
    } finally {
      if (env !== undefined) {
        env['PUZZLE_TAPE'] = previous
      }
    }
  })

  it('uses a file tape when PUZZLE_TAPE_PATH is set', async () => {
    const env = processEnv()
    const previousTape = env?.['PUZZLE_TAPE']
    const previousPath = env?.['PUZZLE_TAPE_PATH']
    const directory = mkdtempSync(join(tmpdir(), 'puzzle-node-file-'))
    const tapePath = join(directory, 'tape.json')
    if (env !== undefined) {
      delete env['PUZZLE_TAPE']
      env['PUZZLE_TAPE_PATH'] = tapePath
    }
    try {
      const writer = startLivePuzzle(Processor.Host.Headless())
      try {
        const started = await waitForSyncedHandle(writer)
        const startedProduct = productOfReady(started)
        expect(uriOf(startedProduct ?? emptyModel())).toBe(uriOf(demoModel()))
        writer.send(ResetTape())
        await waitForSyncedHandleWrite(writer)
        const reset = productOfReady(writer.readModel())
        expect(uriOf(reset ?? demoModel())).toBe(uriOf(emptyModel()))
      } finally {
        await writer.stop()
      }

      const reader = startLivePuzzle(Processor.Host.Headless())
      try {
        const restored = await waitForSyncedHandle(reader)
        const restoredProduct = productOfReady(restored)
        expect(uriOf(restoredProduct ?? demoModel())).toBe(uriOf(emptyModel()))
      } finally {
        await reader.stop()
      }
    } finally {
      if (env !== undefined) {
        if (previousTape === undefined) {
          delete env['PUZZLE_TAPE']
        } else {
          env['PUZZLE_TAPE'] = previousTape
        }
        if (previousPath === undefined) {
          delete env['PUZZLE_TAPE_PATH']
        } else {
          env['PUZZLE_TAPE_PATH'] = previousPath
        }
      }
      rmSync(directory, { force: true, recursive: true })
    }
  })
  it('settles Ready when Instant subscribe never emits', async () => {
    const transport: PuzzleSnapshotLogTransport = {
      read: () => Effect.succeed({ messages: [], snapshot: undefined }),
      subscribe: Stream.never,
      write: () => Effect.succeed({ _tag: 'Synced' as const }),
    }
    const handle = startLivePuzzle(Processor.Host.Headless(), { transport })
    try {
      const snapshot = await waitForSyncedHandle(handle)
      expect(snapshot._tag).toBe('Ready')
    } finally {
      await handle.stop()
    }
  })

  it(
    'Ready-paints Instant empty after a hanging read, not demoModel',
    async () => {
      const transport: PuzzleSnapshotLogTransport = {
        read: () => Effect.never,
        subscribe: Stream.never,
        write: () => Effect.succeed({ _tag: 'Synced' as const }),
      }
      const handle = startLivePuzzle(Processor.Host.Headless(), { transport })
      try {
        const snapshot = await waitForSyncedHandle(
          handle,
          instantReadTimeoutMs + 2_000,
        )
        expect(snapshot._tag).toBe('Ready')
        const product = productOfReady(snapshot)
        expect(product).toBeDefined()
        if (product === undefined) {
          return
        }
        expect(uriOf(product)).toBe(uriOf(emptyModel()))
        expect(uriOf(product)).not.toBe(uriOf(demoModel()))
      } finally {
        await handle.stop()
      }
    },
    instantReadTimeoutMs + 5_000,
  )

  it('Ready-paints a live Instant tape row, not Program init', async () => {
    const transport: PuzzleSnapshotLogTransport = {
      read: () =>
        Effect.succeed({
          messages: [],
          snapshot: TapeRow.make({
            id: TAPE_UUID,
            asOf: 'foldkit-processor',
            at: 1_700_000_000_000,
            steps: emptyInstantPuzzleSnapshot.steps,
            prompt: emptyInstantPuzzleSnapshot.prompt,
          }),
        }),
      subscribe: Stream.never,
      write: () => Effect.succeed({ _tag: 'Synced' as const }),
    }
    const handle = startLivePuzzle(Processor.Host.Headless(), { transport })
    try {
      const snapshot = await waitForSyncedHandle(handle)
      expect(snapshot._tag).toBe('Ready')
      const product = productOfReady(snapshot)
      expect(product).toBeDefined()
      if (product === undefined) {
        return
      }
      expect(uriOf(product)).toBe(uriOf(emptyModel()))
    } finally {
      await handle.stop()
    }
  })
})
