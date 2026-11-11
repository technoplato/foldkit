import { Array, Effect, Fiber, Option, Stream } from 'effect'
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  graphFolderName,
  readingsOfDirectory,
  recognitionsFileName,
  relationsFileName,
  thingsFileName,
  watchedReadings,
} from './local.node.js'
import type { Readings } from './model.js'

const book = JSON.stringify({
  id: 'thing-made-up',
  kind: 'book',
  status: 'active',
  title: 'A Made-Up Picture Book',
  metadataJSON: JSON.stringify({ authors: ['Nobody'], pageCount: 12 }),
  externalIDsJSON: JSON.stringify({ isbn13: '9780000000002' }),
  updatedAtMs: 1,
})

const pageLine = (page: number): string =>
  JSON.stringify({
    id: `page-${page.toString()}`,
    thingID: 'thing-made-up',
    thingKind: 'book',
    thingRangeStart: page,
    thingRangeEnd: page,
    thingRangeUnit: 'page',
    isOngoing: true,
    startedAtMs: page * 1_000,
    updatedAtMs: page * 1_000,
    detailJSON: JSON.stringify({
      kind: 'page',
      page,
      readingID: 'reading-made-up',
    }),
  })

const illustrator = JSON.stringify({
  id: 'person-made-up',
  kind: 'person',
  status: 'active',
  title: 'Ada Quill',
  updatedAtMs: 1,
})

const illustratorOf = JSON.stringify({
  id: 'relation-made-up',
  subjectID: 'person-made-up',
  subjectKind: 'person',
  predicate: 'illustratorOf',
  objectID: 'thing-made-up',
  objectKind: 'book',
  certainty: 'exact',
  status: 'active',
  updatedAtMs: 1,
})

const creditsOf = (readings: Readings) =>
  Array.map(readings.books, each => each.credits)

const pagesOf = (readings: Readings): ReadonlyArray<number> =>
  Array.map(readings.turns, turn => turn.page)

const withinMs = 4_000

const watchedWithinMs = 1_000

describe('Scribe logs on this machine', () => {
  let directory = ''

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'read-aloud-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reads a folder with no logs yet as no books', async () => {
    const readings = await Effect.runPromise(readingsOfDirectory(directory))
    expect(readings).toEqual({ books: [], turns: [], sittings: [] })
  })

  // Scribe #2182: a reading links the recording it was read in, by the
  // number Michael knows it by, from the folder Scribe keeps it in.
  it('names the recording of each reading by its number, from the recordings folder beside the logs', async () => {
    const things = join(directory, 'things')
    await mkdir(things)
    await mkdir(join(directory, 'recordings', '410 — 2026-11-10 — 725c1dd4'), {
      recursive: true,
    })
    await writeFile(join(things, thingsFileName), `${book}\n`)
    await writeFile(
      join(things, recognitionsFileName),
      `${JSON.stringify({
        id: 'reading-made-up',
        thingID: 'thing-made-up',
        thingKind: 'book',
        isOngoing: false,
        startedAtMs: 1_000,
        updatedAtMs: 2_000,
        recordingID: '725c1dd4-a8fe-4256-b794-5886ae3888de',
        startSeconds: 12.5,
        thingRangeStart: 3,
        thingRangeEnd: 3,
        thingRangeUnit: 'page',
        detailJSON: JSON.stringify({ reached: { atMs: 2_000 } }),
      })}\n`,
    )
    const readings = await Effect.runPromise(readingsOfDirectory(things))
    expect(
      Array.map(readings.sittings, sitting =>
        sitting.maybeMoment.pipe(
          Option.flatMap(moment => moment.maybeRecordingNumber),
        ),
      ),
    ).toEqual([Option.some('410')])
  })

  it('reads the credits Scribe keeps in its graph folder beside the books', async () => {
    await writeFile(join(directory, thingsFileName), `${book}\n`)
    await mkdir(join(directory, graphFolderName))
    await writeFile(
      join(directory, graphFolderName, thingsFileName),
      `${illustrator}\n`,
    )
    await writeFile(
      join(directory, graphFolderName, relationsFileName),
      `${illustratorOf}\n`,
    )
    const readings = await Effect.runPromise(readingsOfDirectory(directory))
    expect(creditsOf(readings)).toEqual([
      [
        {
          role: 'Illustrator',
          contributor: { key: 'ada-quill', name: 'Ada Quill' },
        },
      ],
    ])
  })

  it('sends the readings again when Scribe credits a book in its graph, well before the two-second reread', async () => {
    await writeFile(join(directory, thingsFileName), `${book}\n`)
    await mkdir(join(directory, graphFolderName))
    await writeFile(
      join(directory, graphFolderName, thingsFileName),
      `${illustrator}\n`,
    )
    await writeFile(join(directory, graphFolderName, relationsFileName), '')
    const fiber = Effect.runFork(
      Stream.runCollect(Stream.take(watchedReadings(directory), 2)),
    )
    await Effect.runPromise(Effect.sleep(300))
    const appendedAtMs = Date.now()
    await appendFile(
      join(directory, graphFolderName, relationsFileName),
      `${illustratorOf}\n`,
    )
    const collected = await Effect.runPromise(
      Fiber.join(fiber).pipe(Effect.timeout(withinMs)),
    )
    const elapsedMs = Date.now() - appendedAtMs
    expect(
      Array.map(collected, readings =>
        Array.flatMap(creditsOf(readings), credits =>
          Array.map(credits, credit => credit.role),
        ),
      ),
    ).toEqual([['Author'], ['Illustrator']])
    expect(elapsedMs).toBeLessThan(watchedWithinMs)
  })

  it('sends the readings again when Scribe appends a page, well before the two-second reread', async () => {
    await writeFile(join(directory, thingsFileName), `${book}\n`)
    await writeFile(join(directory, recognitionsFileName), `${pageLine(1)}\n`)
    const fiber = Effect.runFork(
      Stream.runCollect(Stream.take(watchedReadings(directory), 2)),
    )
    await Effect.runPromise(Effect.sleep(300))
    const appendedAtMs = Date.now()
    await appendFile(join(directory, recognitionsFileName), `${pageLine(2)}\n`)
    const collected = await Effect.runPromise(
      Fiber.join(fiber).pipe(Effect.timeout(withinMs)),
    )
    const elapsedMs = Date.now() - appendedAtMs
    expect(Array.map(collected, pagesOf)).toEqual([[1], [2, 1]])
    expect(elapsedMs).toBeLessThan(watchedWithinMs)
  })
})
