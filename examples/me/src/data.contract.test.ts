// @vitest-environment node
import { Array, Schema as S } from 'effect'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { Understanding } from './data'

const usersDirectory = process.env['ME_USERS_DIR'] ?? ''

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'))

describe.skipIf(usersDirectory === '')(
  'the exporter writes what the page reads (ME_USERS_DIR)',
  () => {
    test('every user folder is named by a SHA-256 and holds only files the page reads', () => {
      const folders = readdirSync(usersDirectory)
      expect(Array.isArrayNonEmpty(folders)).toBe(true)
      folders.forEach(folder => {
        expect(folder).toMatch(/^[0-9a-f]{64}$/)
        readdirSync(join(usersDirectory, folder)).forEach(file => {
          expect(file).toMatch(/^[a-z0-9][a-z0-9-]*\.json$/)
        })
      })
    })

    test('every understanding.json decodes', () => {
      readdirSync(usersDirectory).forEach(folder => {
        const path = join(usersDirectory, folder, 'understanding.json')
        if (existsSync(path)) {
          expect(
            S.decodeUnknownSync(Understanding)(readJson(path)).schemaVersion,
          ).toBe(1)
        }
      })
    })
  },
)
