import { Array, Data, Option, Record as Record_, Schema as S } from 'effect'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import {
  StoreInterface,
  type StoreInterfaceClass,
  type StoreInterfaceStoreName,
} from '@instantdb/core'

const InstantStoreState = S.Record(S.String, S.Unknown)
const InstantStoreStateJson = S.fromJsonString(InstantStoreState)

/** Instant file persistence could not read or write the local store. */
export class MultipleCountersV3FileStoreError extends Data.TaggedError(
  'MultipleCountersV3FileStoreError',
)<Readonly<{ cause: unknown; operation: 'Read' | 'Write' }>> {}

const sanitizeSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9_-]+/gu, '_')

const writeJsonFile = (path: string, value: string): void => {
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const temporaryPath = `${path}.${process.pid.toString()}.${randomUUID()}.tmp`
  writeFileSync(temporaryPath, value, { flag: 'wx', mode: 0o600 })
  renameSync(temporaryPath, path)
}

const readStore = (path: string): Readonly<{ readonly [key: string]: unknown }> => {
  if (!existsSync(path)) {
    return {}
  }
  return S.decodeUnknownSync(InstantStoreStateJson)(readFileSync(path, 'utf8'))
}

const writeStore = (
  path: string,
  state: Readonly<{ readonly [key: string]: unknown }>,
): void => {
  writeJsonFile(path, S.encodeSync(InstantStoreStateJson)(state))
}

/** Instant Store class that persists kv, query, and sync maps as JSON files. */
export const makeMultipleCountersV3FileStoreClass = (
  rootDirectory: string,
): StoreInterfaceClass =>
  class MultipleCountersV3FileStore extends StoreInterface {
    readonly #path: string
    #writeChain: Promise<void> = Promise.resolve()

    constructor(appId: string, storeName: StoreInterfaceStoreName) {
      super(appId, storeName)
      this.#path = join(
        rootDirectory,
        'instant',
        sanitizeSegment(appId),
        `${storeName}.json`,
      )
    }

    #enqueue<Value>(
      operation: 'Read' | 'Write',
      body: () => Value,
    ): Promise<Value> {
      const run = this.#writeChain.then(() => body())
      this.#writeChain = run.then(
        () => undefined,
        () => undefined,
      )
      return run.catch(cause => {
        throw new MultipleCountersV3FileStoreError({ cause, operation })
      })
    }

    getItem(key: string): Promise<unknown> {
      return this.#enqueue('Read', () => {
        const state = readStore(this.#path)
        return Option.getOrUndefined(Record_.get(state, key))
      })
    }

    removeItem(key: string): Promise<void> {
      return this.#enqueue('Write', () => {
        writeStore(this.#path, Record_.remove(readStore(this.#path), key))
      })
    }

    multiSet(
      keyValuePairs: ReadonlyArray<readonly [string, unknown]>,
    ): Promise<void> {
      return this.#enqueue('Write', () => {
        writeStore(
          this.#path,
          Array.reduce(keyValuePairs, readStore(this.#path), (state, pair) => {
            const [key, value] = pair
            return Record_.set(state, key, value)
          }),
        )
      })
    }

    getAllKeys(): Promise<Array<string>> {
      return this.#enqueue('Read', () => [...Record_.keys(readStore(this.#path))])
    }
  }
