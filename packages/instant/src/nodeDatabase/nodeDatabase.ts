import { Array, Option, Record as Record_ } from 'effect'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { init } from '@instantdb/core'
import {
  StoreInterface,
  type StoreInterfaceClass,
  type StoreInterfaceStoreName,
} from '@instantdb/core'

import {
  type InstantProgramDatabase,
  InstantProgramSchema,
} from '../schema/index.js'

const sanitizeSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9_-]+/gu, '_')

const writeJsonFile = (path: string, value: string): void => {
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const temporaryPath = `${path}.${process.pid.toString()}.${randomUUID()}.tmp`
  writeFileSync(temporaryPath, value, { flag: 'wx', mode: 0o600 })
  renameSync(temporaryPath, path)
}

const readStore = (
  path: string,
): Readonly<{ readonly [key: string]: unknown }> => {
  if (!existsSync(path)) {
    return {}
  }
  return JSON.parse(readFileSync(path, 'utf8')) as {
    readonly [key: string]: unknown
  }
}

const writeStore = (
  path: string,
  state: Readonly<{ readonly [key: string]: unknown }>,
): void => {
  writeJsonFile(path, JSON.stringify(state))
}

/** Instant Store class that persists kv, query, and sync maps as JSON files. */
export const makeNodeInstantStoreClass = (
  rootDirectory: string,
): StoreInterfaceClass =>
  class NodeInstantStore extends StoreInterface {
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

    #enqueue<Value>(body: () => Value): Promise<Value> {
      const run = this.#writeChain.then(() => body())
      this.#writeChain = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    }

    getItem(key: string): Promise<unknown> {
      return this.#enqueue(() => {
        const state = readStore(this.#path)
        return Option.getOrUndefined(Record_.get(state, key))
      })
    }

    removeItem(key: string): Promise<void> {
      return this.#enqueue(() => {
        writeStore(this.#path, Record_.remove(readStore(this.#path), key))
      })
    }

    multiSet(
      keyValuePairs: ReadonlyArray<readonly [string, unknown]>,
    ): Promise<void> {
      return this.#enqueue(() => {
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
      return this.#enqueue(() => [...Record_.keys(readStore(this.#path))])
    }
  }

/** Always-online Instant network listener for Node Clients. */
export class NodeInstantNetworkListener {
  static getIsOnline(): Promise<boolean> {
    return Promise.resolve(true)
  }

  static listen(onChange: (isOnline: boolean) => void): () => void {
    onChange(true)
    return () => undefined
  }
}

/** Initializes Instant core with a file-backed store for one Node Client. */
export const makeNodeInstantProgramDatabase = (
  appId: string,
  stateDirectory: string,
): InstantProgramDatabase =>
  init(
    { appId, schema: InstantProgramSchema },
    makeNodeInstantStoreClass(stateDirectory),
    NodeInstantNetworkListener,
  )

export type { InstantProgramDatabase }
