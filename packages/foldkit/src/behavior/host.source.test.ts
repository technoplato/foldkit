import { Array } from 'effect'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import * as Shelf from '../test/shelf.js'

// NOTE: a painter never learns a part's name: it reads bindings. This
// test reads the painters' own source to hold that, so a part cannot be
// wired into a painter by hand without failing here.

const painterFolders: ReadonlyArray<string> = [
  join(import.meta.dirname, '../renderers'),
  join(import.meta.dirname, '../../../react/src/paintReact'),
  join(import.meta.dirname, '../../../react-native/src/interaction'),
]

const isSource = (name: string): boolean =>
  /\.tsx?$/u.test(name) && !/\.test\.tsx?$/u.test(name)

const painterFiles: ReadonlyArray<string> = Array.flatMap(
  painterFolders,
  folder =>
    Array.map(Array.filter(readdirSync(folder), isSource), name =>
      join(folder, name),
    ),
)

const partNames: ReadonlyArray<string> = [Shelf.TitleMenu.name, Shelf.Pin.name]

const partModules =
  /behavior\/(?!gesture|slot|host|longPress|placement|pace|part|transcriptFollow|reader|block)[a-zA-Z]+\.js/u

describe('a painter and the parts it hosts', () => {
  it('reads every painter file there is', () => {
    expect(painterFiles.length).toBeGreaterThan(30)
    expect(
      Array.filter(painterFiles, file =>
        /(renderers\/htmlHost\.ts|paintReact\/host\.tsx|interaction\/host\.ts)$/u.test(
          file,
        ),
      ),
    ).toHaveLength(3)
  })

  it('spells no part’s name in any painter file', () => {
    const named = Array.flatMap(painterFiles, file => {
      const source = readFileSync(file, 'utf8')
      return Array.filter(partNames, name =>
        new RegExp(`\\b${name}\\b`, 'u').test(source),
      ).map(name => `${file} names ${name}`)
    })
    expect(named).toEqual([])
  })

  it('imports no part’s own module into a painter file', () => {
    const imported = Array.filter(painterFiles, file =>
      partModules.test(readFileSync(file, 'utf8')),
    )
    expect(imported).toEqual([])
  })
})
