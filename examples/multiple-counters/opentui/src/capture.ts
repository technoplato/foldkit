#!/usr/bin/env bun
/**
 * Writes the frame OpenTUI paints at each screen of the Multiple Counters
 * into a folder, one text file a screen. The Client Matrix shows them.
 *
 *   bun src/capture.ts ../../client-matrix/foldkit/src/captures/open-tui
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { paintAt } from './paintAt.js'

const screens: ReadonlyArray<
  Readonly<{ file: string; presses: ReadonlyArray<string> }>
> = [
  { file: 'list.txt', presses: [] },
  { file: 'detail.txt', presses: ['Open:1'] },
  { file: 'delete.txt', presses: ['Open:1', 'Delete'] },
]

const folder = process.argv[2]
if (folder === undefined) {
  throw new Error('Name the folder to write into.')
}

mkdirSync(folder, { recursive: true })
for (const screen of screens) {
  const frame = await paintAt(screen.presses)
  const trimmed = frame
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trimEnd()
  writeFileSync(join(folder, screen.file), `${trimmed}\n`)
}
process.exit(0)
