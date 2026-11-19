import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const command = join(
  appRoot,
  '../../../packages/react-native/bin/foldkit-expo-routes.mjs',
)

const run = (...args: ReadonlyArray<string>) =>
  spawnSync(
    process.execPath,
    [command, ...args, '--navigation', 'books-core-example#SyncedBooks'],
    { cwd: appRoot, encoding: 'utf8' },
  )

describe('the route files of the Books app', () => {
  it('are the ones the Books Program declares: none typed by hand, none stale', () => {
    const checked = run('check')
    expect(checked.stderr).toBe('')
    expect(checked.status).toBe(0)
    expect(checked.stdout).toMatch(/route files are what .* declares/)
  })

  it('fail the check, naming each file, when they are not', () => {
    const empty = relative(appRoot, mkdtempSync(join(tmpdir(), 'no-routes-')))
    const checked = run('check', '--app', empty)
    expect(checked.status).toBe(1)
    expect(checked.stderr).toContain(
      'books/[slug]/listen/index.tsx is missing.',
    )
    expect(checked.stderr).toContain('foldkit-expo-routes generate')
  })
})
