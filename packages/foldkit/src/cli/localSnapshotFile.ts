/// <reference types="node" />
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  type LocalSnapshotStore,
  fromPromises,
} from '../runtime/localSnapshot.js'

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
 * A local snapshot kept in a file, for the CLI, TUI, OpenTUI, and headless
 * hosts on Node or Bun. Each save writes a temporary file and renames it
 * over the old one, so two processes saving at once never leave half a
 * snapshot.
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
    load: () => readFile(path, 'utf8'),
    save: async text => {
      const temporaryPath = `${path}.${process.pid}.tmp`
      await mkdir(dirname(path), { recursive: true })
      await writeFile(temporaryPath, text, 'utf8')
      await rename(temporaryPath, path)
    },
  })
