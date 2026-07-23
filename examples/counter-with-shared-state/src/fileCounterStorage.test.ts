import { Effect, Layer, Option } from 'effect'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { NodeServices } from '@effect/platform-node'

import { CounterStorage, StoredCounter } from './counterStorage.js'
import { makeFileCounterStorageLayer } from './fileCounterStorage.js'

const temporaryDirectories = new Array<string>()

afterEach(() => {
  temporaryDirectories.forEach(directoryPath => {
    rmSync(directoryPath, { recursive: true, force: true })
  })
  temporaryDirectories.splice(0)
})

describe('file CounterStorage', () => {
  it('loads absence and saves a value through Effect FileSystem', async () => {
    const directoryPath = mkdtempSync(
      join(tmpdir(), 'foldkit-counter-storage-'),
    )
    temporaryDirectories.push(directoryPath)
    const stateFilePath = join(directoryPath, 'nested', 'counter.json')

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const storage = yield* CounterStorage
        const beforeSave = yield* storage.load
        yield* storage.save(StoredCounter.make({ count: 12 }))
        const afterSave = yield* storage.load
        return { beforeSave, afterSave }
      }).pipe(
        Effect.provide(
          makeFileCounterStorageLayer(stateFilePath).pipe(
            Layer.provide(NodeServices.layer),
          ),
        ),
      ),
    )

    expect(Option.isNone(result.beforeSave)).toBe(true)
    expect(result.afterSave).toStrictEqual(
      Option.some(StoredCounter.make({ count: 12 })),
    )
  })
})
