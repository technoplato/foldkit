import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

// NOTE: These tests run the script `~/.local/bin/books` runs, as a
// process, with the words a person types, on the made-up library
// (`BOOKS_MADE_UP`): nobody is signed in and no real library is read.
// The other tests hand the player a command already parsed; a fault
// between the shell and the player shows only here.

const here = fileURLToPath(new URL('.', import.meta.url))

const launcher = join(here, '../../scripts/books')

const builtEntry = join(here, '../dist/entry.js')

const newestIn = (directory: string): number =>
  readdirSync(directory, { withFileTypes: true }).reduce(
    (newest, entry) =>
      entry.isDirectory()
        ? Math.max(newest, newestIn(join(directory, entry.name)))
        : entry.name.endsWith('.test.ts')
          ? newest
          : Math.max(newest, statSync(join(directory, entry.name)).mtimeMs),
    0,
  )

const libraries: Array<string> = []

const newLibrary = (): string => {
  const name = `launcher-test-${randomUUID().slice(0, 8)}`
  libraries.push(name)
  return name
}

type Ran = Readonly<{ stdout: string; stderr: string; status: number | null }>

const environmentOf = (
  library: string,
  extra: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv => ({
  ...process.env,
  BOOKS_MADE_UP: library,
  NO_COLOR: '',
  ...extra,
})

const books = (
  library: string,
  words: ReadonlyArray<string>,
  extra: Readonly<Record<string, string>> = {},
): Ran => {
  const ran = spawnSync(launcher, [...words], {
    env: environmentOf(library, extra),
    encoding: 'utf8',
    timeout: 30_000,
  })
  return { stdout: ran.stdout, stderr: ran.stderr, status: ran.status }
}

const firstOutputMs = 6_000

/** What a command that keeps printing wrote first, then it is ended. */
const firstOf = (
  command: string,
  words: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv,
): Promise<Readonly<{ stdout: string; stderr: string }>> =>
  new Promise(resolve => {
    const child = spawn(command, [...words], {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const written = { stdout: '', stderr: '' }
    const finish = (): void => {
      clearTimeout(limit)
      child.kill('SIGINT')
      resolve(written)
    }
    const limit = setTimeout(finish, firstOutputMs)
    child.stdout.on('data', chunk => {
      written.stdout += String(chunk)
      if (written.stdout.includes('\n')) {
        finish()
      }
    })
    child.stderr.on('data', chunk => {
      written.stderr += String(chunk)
      if (written.stderr.includes('Nothing here is called')) {
        finish()
      }
    })
    child.on('exit', finish)
  })

afterEach(() => {
  for (const library of libraries.splice(0)) {
    books(library, ['stop'])
  }
})

// Each test starts processes, a player among them, so it gets minutes,
// not the few seconds a test of a function gets.
const processTestMs = 180_000

describe(
  'the books command a person runs, on the made-up library',
  {
    timeout: processTestMs,
  },
  () => {
    it('is built from the source as it is now', () => {
      const built = statSync(builtEntry).mtimeMs
      expect(
        built,
        'examples/books/cli/dist is older than its source: run `pnpm --filter "books-cli-example..." run build`',
      ).toBeGreaterThanOrEqual(newestIn(join(here, '.')))
    })

    it('plays a title typed as its name, in quotes or as words, and by part of it', () => {
      const library = newLibrary()
      const quoted = books(library, ['listen', 'The Lantern Keeper'])
      expect(quoted.status).toBe(0)
      expect(quoted.stderr).toBe('Starting the Books player…\n')
      expect(quoted.stdout).toContain('Playing The Lantern Keeper')
      const words = books(library, ['listen', 'small', 'hours'])
      expect(words.status).toBe(0)
      expect(words.stdout).toContain('Playing Small Hours')
      const part = books(library, ['listen', 'weather'])
      expect(part.stdout).toContain('Playing A Field Guide to Weather')
      const slug = books(library, ['listen', 'the-lantern-keeper'])
      expect(slug.stdout).toContain('Playing The Lantern Keeper')
      expect(books(library, ['pause']).stdout).toContain('Paused The Lantern')
      const again = books(library, ['listen', 'The Lantern Keeper'])
      expect(again.status).toBe(0)
      expect(again.stderr).toBe('')
      expect(again.stdout).toContain('Playing The Lantern Keeper')
    })

    it('follows the words with flags after and before the topic, down a pipe and with a terminal’s color', async () => {
      const library = newLibrary()
      expect(books(library, ['listen', 'lantern']).status).toBe(0)
      const flagged: ReadonlyArray<ReadonlyArray<string>> = [
        ['follow', 'words'],
        ['follow', 'words', '--each-word'],
        ['follow', '--each-word', 'words'],
        ['follow', 'words', '--json'],
        ['follow', '--json', 'words', '--each-word'],
        ['follow', 'words', '--before', '2', '--after', '1'],
        ['--before', '2', 'follow', 'words', '--after', '1', '--each-word'],
      ]
      for (const words of flagged) {
        for (const extra of [{}, { FORCE_COLOR: '1' }]) {
          const first = await firstOf(
            launcher,
            words,
            environmentOf(library, extra),
          )
          const typed = `books ${words.join(' ')} ${JSON.stringify(extra)}`
          expect(first.stderr, typed).not.toContain('Nothing here is called')
          expect(first.stdout, typed).toMatch(/Lantern Keeper/)
          if (words.includes('--json')) {
            expect(first.stdout, typed).toMatch(/^\{"_tag":"Words/)
          }
        }
      }
    })

    it('follows the words in a real terminal, where the view adds its color flag', async () => {
      if (process.platform !== 'darwin') {
        return
      }
      const library = newLibrary()
      expect(books(library, ['listen', 'lantern']).status).toBe(0)
      const first = await firstOf(
        'script',
        ['-q', '/dev/null', launcher, 'follow', 'words', '--each-word'],
        { ...environmentOf(library), TERM: 'xterm-256color' },
      )
      expect(first.stdout).not.toContain('Nothing here is called')
      expect(first.stdout).toMatch(/Lantern Keeper/)
    })

    it('prints help read from the declarations, and starts no player to do it', () => {
      const library = newLibrary()
      const help = books(library, [])
      expect(help.status).toBe(0)
      expect(help.stdout).toMatch(/^ {2}books listen <title> +Plays this book/mu)
      expect(help.stdout).toMatch(
        /^ {2}books follow \[words\|screen\] \[--each-word\]/mu,
      )
      const one = books(library, ['help', 'find'])
      expect(one.stdout.split('\n').at(0)).toBe('books search <words> [--json]')
      expect(one.stdout).toContain('Also: books find')
      expect(books(library, ['stop']).stdout).toContain(
        'Nothing is playing in this terminal’s player.',
      )
    })

    it('refuses a flag a command does not take, with the nearest, before any player starts', () => {
      const library = newLibrary()
      const refused = books(library, ['follow', 'words', '--each-wrd'])
      expect(refused.status).toBe(2)
      expect(refused.stdout).toBe('')
      expect(refused.stderr.split('\n').filter(line => line !== '')).toEqual([
        'books follow takes no --each-wrd. Did you mean --each-word?',
        'Usage: books follow [words|screen] [--each-word] [--json] [--before <number>] [--after <number>]',
      ])
      const wrongKind = books(library, ['words', '--before', 'two'])
      expect(wrongKind.status).toBe(2)
      expect(wrongKind.stderr).toContain(
        '--before must be a number; got "two".',
      )
      expect(books(library, ['stop']).stdout).toContain(
        'Nothing is playing in this terminal’s player.',
      )
    })

    it('says what it can be asked for as tools a program reads', () => {
      const library = newLibrary()
      const listed = books(library, ['actions', '--json'])
      expect(listed.status).toBe(0)
      const parsed: unknown = JSON.parse(listed.stdout)
      const tools =
        typeof parsed === 'object' && parsed !== null && 'tools' in parsed
          ? parsed.tools
          : []
      const names = Array.isArray(tools)
        ? tools.map((tool: Readonly<{ name: string }>) => tool.name)
        : []
      expect(names).toContain('search')
      expect(names).toContain('listen')
      expect(names).toContain('pause')
    })

    it('answers a command nobody declared in one sentence and leaves no player running', () => {
      const library = newLibrary()
      const unknown = books(library, ['lisen', 'lantern'])
      expect(unknown.status).toBe(2)
      expect(unknown.stdout).toBe('')
      expect(unknown.stderr.split('\n').filter(line => line !== '')).toEqual([
        'Starting the Books player…',
        'Unknown command "lisen lantern". Nearest: books listen <title>. `books actions` lists every command.',
        'The player was started only to read that, and is stopped again.',
      ])
      expect(books(library, ['stop']).stdout).toContain(
        'Nothing is playing in this terminal’s player.',
      )
    })

    it('says no title matches and leaves no player running, when the command started it', () => {
      const library = newLibrary()
      const none = books(library, ['listen', 'moby'])
      expect(none.status).toBe(2)
      expect(none.stdout).toBe('')
      expect(none.stderr).toContain('No title matches "moby".')
      expect(none.stderr).toContain('books listen the-lantern-keeper')
      expect(books(library, ['stop']).stdout).toContain(
        'Nothing is playing in this terminal’s player.',
      )
    })

    it('keeps a player that was already running when a command is refused', () => {
      const library = newLibrary()
      expect(books(library, ['listen', 'lantern']).status).toBe(0)
      expect(books(library, ['lisen']).status).toBe(2)
      expect(books(library, ['pause']).stdout).toContain(
        'Paused The Lantern Keeper',
      )
    })
  },
)
