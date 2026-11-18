import { catalog } from 'books-core-example'
import { Catalog } from 'foldkit'
import * as Declaration from 'foldkit/declaration'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { hostTree, playerDeclared, viewDeclared } from './declared.js'
import { booksCommandName } from './settings.js'

const sourceDirectory = join(process.cwd(), 'src')

describe('what the Books terminal declares', () => {
  it('is sound: a what and a why about the user, one subject, true examples', () => {
    expect(
      [...viewDeclared, ...playerDeclared].flatMap(declared =>
        Declaration.problemsOf(declared.declaration),
      ),
    ).toEqual([])
  })

  it('answers to each name once', () => {
    expect(Declaration.collisionsOf(hostTree)).toEqual([])
  })

  it('has a declaration for every Action of the library, needing no Model', () => {
    expect(Catalog.declarationsOf(catalog).map(({ name }) => name)).toEqual(
      catalog.actions.map(action => action.tag),
    )
  })
})

// NOTE: A usage or help line typed by hand is how `books listen <title>`
// came to name a parameter the command did not take. Text that says how
// to run a command is spelled from a declaration; this fails when a
// string in this folder types a command after the program's name.

const typedCommandPattern = new RegExp(
  `(?:\\b${booksCommandName}|\\$\\{booksCommandName\\}) [a-z][a-z-]*`,
  'u',
)

const literalPattern =
  /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gu

const commentPattern = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu

const handTypedIn = (file: string): ReadonlyArray<string> =>
  [
    ...readFileSync(join(sourceDirectory, file), 'utf8')
      .replace(commentPattern, '')
      .matchAll(literalPattern),
  ]
    .map(([literal]) => literal)
    .filter(literal => typedCommandPattern.test(literal))
    .map(literal => `${file}: ${literal}`)

const usageTablePattern = new RegExp(
  `^\\s*(?:\\*|//)\\s{2,}${booksCommandName} [a-z]`,
  'mu',
)

describe('the Books terminal’s source', () => {
  const files = readdirSync(sourceDirectory).filter(
    file => file.endsWith('.ts') && !file.endsWith('.test.ts'),
  )

  it('types no command by hand in a string; each is spelled from a declaration', () => {
    expect(files.flatMap(handTypedIn)).toEqual([])
  })

  it('keeps no table of commands in a comment; help is derived', () => {
    expect(
      files.filter(file =>
        usageTablePattern.test(
          readFileSync(join(sourceDirectory, file), 'utf8'),
        ),
      ),
    ).toEqual([])
  })
})
