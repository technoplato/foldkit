// @vitest-environment node
import { Array, Schema as S } from 'effect'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { BuildDetail, Index, Pipeline } from './data'
import encodedPipeline from './fixtures/pipeline.example.json'

const dataDirectory = process.env['PERFORMANCE_DATA_DIR'] ?? ''

const pipelinePath = join(dataDirectory, 'pipeline.json')

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'))

describe("the contract's example of pipeline.json", () => {
  test('decodes', () => {
    const pipeline = S.decodeUnknownSync(Pipeline)(encodedPipeline)
    expect(pipeline.verdict.state).toBe('UnderUsed')
    expect(pipeline.measures).toHaveLength(10)
  })

  test('a file of another version does not decode', () => {
    expect(() =>
      S.decodeUnknownSync(Pipeline)({ ...encodedPipeline, schemaVersion: 2 }),
    ).toThrow()
  })

  test('a state the page does not know does not decode', () => {
    expect(() =>
      S.decodeUnknownSync(Pipeline)({
        ...encodedPipeline,
        verdict: { ...encodedPipeline.verdict, state: 'Sleeping' },
      }),
    ).toThrow()
  })

  test('a field the exporter adds is let through', () => {
    expect(() =>
      S.decodeUnknownSync(Pipeline)({ ...encodedPipeline, addedLater: 1 }),
    ).not.toThrow()
  })
})

describe.skipIf(dataDirectory === '')(
  'the exporter writes what the page reads (PERFORMANCE_DATA_DIR)',
  () => {
    test('index.json decodes', () => {
      const index = S.decodeUnknownSync(Index)(
        readJson(join(dataDirectory, 'index.json')),
      )
      expect(Array.isReadonlyArrayNonEmpty(index.apps)).toBe(true)
    })

    test.skipIf(!existsSync(pipelinePath))('pipeline.json decodes', () => {
      const pipeline = S.decodeUnknownSync(Pipeline)(readJson(pipelinePath))
      expect(Array.isReadonlyArrayNonEmpty(pipeline.measures)).toBe(true)
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
  },
)
