// @vitest-environment node
import { Array, Schema as S } from 'effect'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { BuildDetail, Index, Understanding } from './data'

const dataDirectory = process.env['PERFORMANCE_DATA_DIR'] ?? ''

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'))

describe.skipIf(dataDirectory === '')(
  'the exporter writes what the page reads (PERFORMANCE_DATA_DIR)',
  () => {
    test('index.json decodes', () => {
      const index = S.decodeUnknownSync(Index)(
        readJson(join(dataDirectory, 'index.json')),
      )
      expect(Array.isReadonlyArrayNonEmpty(index.apps)).toBe(true)
    })

    test('every build file decodes', () => {
      const buildsDirectory = join(dataDirectory, 'builds')
      const files = readdirSync(buildsDirectory).flatMap(appId =>
        readdirSync(join(buildsDirectory, appId)).map(file =>
          join(buildsDirectory, appId, file),
        ),
      )
      expect(Array.isArrayNonEmpty(files)).toBe(true)
      files.forEach(file => {
        S.decodeUnknownSync(BuildDetail)(readJson(file))
      })
    })

    test('understanding.json decodes', () => {
      const understanding = S.decodeUnknownSync(Understanding)(
        readJson(join(dataDirectory, 'understanding.json')),
      )
      expect(understanding.schemaVersion).toBe(1)
    })
  },
)
