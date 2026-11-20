/// <reference types="node" />
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  type LocalSnapshotStore,
  fromPromises,
} from '../runtime/localSnapshot.js'

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT'

const cacheRoot = (): string =>
  process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache')

/**
 * Where a terminal host keeps one local snapshot: a file under the user's
 * cache directory, such as `~/.cache/foldkit/counter.json`.
 *
 * @example
 * ```typescript
 * localSnapshotPath('counter') // '/Users/ada/.cache/foldkit/counter.json'
 * ```
 */
export const localSnapshotPath = (name: string): string =>
  join(cacheRoot(), 'foldkit', `${name}.json`)

/**
 * A local snapshot kept in a file (mode 0600), for the CLI, TUI, OpenTUI, and
 * headless hosts on Node or Bun. Each save writes a unique temporary file and
 * renames it over the old one, so two processes saving at once never leave
 * half a snapshot.
 *
 * @example
 * ```typescript
 * Runtime.startHandle({
 *   program: SyncedCounter,
 *   sync: engine,
 *   localSnapshot: localSnapshotFile(localSnapshotPath('counter')),
 * })
 * ```
 */
export const localSnapshotFile = (path: string): LocalSnapshotStore =>
  fromPromises({
    load: async () => {
      try {
        return await readFile(path, 'utf8')
      } catch (error) {
        if (isMissingFileError(error)) {
          return undefined
        }
        throw error
      }
    },
    save: async text => {
      const temporaryPath = `${path}.${process.pid.toString()}.${randomUUID()}.tmp`
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      await writeFile(temporaryPath, text, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, path)
    },
    remove: async () => {
      try {
        await unlink(path)
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error
        }
      }
    },
  })
