// Writes made-up Scribe logs for trying Read Aloud: two picture books and a
// reading of one, in the shape Scribe appends to ~/Scribe/things. Point the
// dev endpoint at the folder with READ_ALOUD_THINGS_DIR. It never writes
// Scribe's own folder.
//
//   node scripts/demoReadings.mjs /tmp/read-aloud-demo start 5
//   node scripts/demoReadings.mjs /tmp/read-aloud-demo turn 4
//   node scripts/demoReadings.mjs /tmp/read-aloud-demo finish
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const [directoryArgument, command = 'start', pageArgument] =
  process.argv.slice(2)

if (directoryArgument === undefined) {
  throw new Error('Name the folder to write, such as /tmp/read-aloud-demo.')
}

const directory = resolve(directoryArgument)

if (directory.startsWith(resolve(homedir(), 'Scribe'))) {
  throw new Error("The demo never writes Scribe's own logs.")
}

const thingsPath = join(directory, 'things.jsonl')
const recognitionsPath = join(directory, 'recognitions.jsonl')

const readingId = 'demo-reading-christmas'

const christmas = {
  id: 'demo-thing-christmas',
  kind: 'book',
  status: 'active',
  identification: 'catalog',
  key: 'isbn13:9780544320413',
  title: "Little Blue Truck's Christmas",
  subtitle: 'Alice Schertle · 2014',
  imageURL: 'https://covers.openlibrary.org/b/id/14434529-M.jpg',
  siteName: 'Open Library',
  metadataJSON: JSON.stringify({
    authors: ['Alice Schertle'],
    publishDate: '2014',
    whereToBuy: [
      {
        kind: 'openLibrary',
        label: 'Open Library',
        url: "https://openlibrary.org/books/OL26943944M/Little_Blue_Truck's_Christmas",
        verified: true,
        rank: 1,
      },
      {
        kind: 'worldCat',
        label: 'Find it in a library (WorldCat)',
        url: 'https://search.worldcat.org/search?q=bn:9780544320413',
        verified: true,
        rank: 2,
      },
    ],
  }),
  externalIDsJSON: JSON.stringify({ isbn13: '9780544320413' }),
}

const feelingHappy = {
  id: 'demo-thing-feeling-happy',
  kind: 'book',
  status: 'active',
  identification: 'catalog',
  key: 'isbn13:9780063342705',
  title: 'Little Blue Truck Feeling Happy: a Touch-And-Feel Book',
  subtitle: 'Alice Schertle · 2024',
  imageURL: 'https://covers.openlibrary.org/b/id/15154333-M.jpg',
  siteName: 'Open Library',
  metadataJSON: JSON.stringify({
    authors: ['Alice Schertle'],
    publishers: ['HarperCollins Publishers'],
    publishDate: '2024',
    pageCount: 14,
    whereToBuy: [
      {
        kind: 'openLibrary',
        label: 'Open Library',
        url: 'https://openlibrary.org/books/OL50729385M/Little_Blue_Truck_Feeling_Happy',
        verified: true,
        rank: 1,
      },
      {
        kind: 'worldCat',
        label: 'Find it in a library (WorldCat)',
        url: 'https://search.worldcat.org/search?q=bn:9780063342705',
        verified: true,
        rank: 2,
      },
      {
        kind: 'bookshop',
        label: 'Bookshop.org (independent bookstores)',
        url: 'https://bookshop.org/book/9780063342705',
        verified: false,
        rank: 3,
      },
    ],
  }),
  externalIDsJSON: JSON.stringify({ isbn13: '9780063342705' }),
}

const lineOf = row => `${JSON.stringify(row)}\n`

const thingLine = (thing, atMs) =>
  lineOf({ ...thing, updatedAtMs: atMs, lastRecognizedAtMs: atMs })

const readingLine = (lastPage, isOngoing, atMs) =>
  lineOf({
    id: readingId,
    thingID: christmas.id,
    thingKind: 'book',
    thingRangeStart: 1,
    thingRangeEnd: lastPage,
    thingRangeUnit: 'page',
    isOngoing,
    certainty: 'exact',
    source: 'spoken',
    startedAtMs: atMs,
    updatedAtMs: atMs,
    detailJSON: JSON.stringify({
      pageMarks: [{ page: String(lastPage) }],
      reached: { atMs },
    }),
  })

const pageLine = (page, isOngoing, atMs, startedAtMs = atMs) =>
  lineOf({
    id: `demo-page-${page}-${startedAtMs}`,
    thingID: christmas.id,
    thingKind: 'book',
    thingRangeStart: page,
    thingRangeEnd: page,
    thingRangeUnit: 'page',
    isOngoing,
    certainty: 'exact',
    source: 'spoken',
    startedAtMs,
    updatedAtMs: atMs,
    detailJSON: JSON.stringify({
      kind: 'page',
      page,
      readingID: readingId,
      method: 'spoken',
    }),
  })

const isPageRow = row => JSON.parse(row.detailJSON ?? '{}').kind === 'page'

const lastPageRowOf = async () => {
  const text = await readFile(recognitionsPath, 'utf8').catch(() => '')
  return text
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line))
    .filter(isPageRow)
    .at(-1)
}

const endedLine = row =>
  row === undefined
    ? ''
    : lineOf({ ...row, isOngoing: false, updatedAtMs: Date.now() })

const nowMs = Date.now()

if (command === 'start') {
  const firstPage = pageArgument === undefined ? 1 : Number(pageArgument)
  await mkdir(directory, { recursive: true })
  await writeFile(
    thingsPath,
    thingLine(feelingHappy, nowMs - 86_400_000) + thingLine(christmas, nowMs),
  )
  await writeFile(
    recognitionsPath,
    readingLine(firstPage, true, nowMs) + pageLine(firstPage, true, nowMs),
  )
  console.log(
    `Wrote a reading of ${christmas.title} at page ${firstPage} to ${directory}`,
  )
} else if (command === 'turn') {
  const page = Number(pageArgument)
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('Name the page to turn to, such as `turn 4`.')
  }
  await appendFile(
    recognitionsPath,
    endedLine(await lastPageRowOf()) +
      pageLine(page, true, nowMs) +
      readingLine(page, true, nowMs),
  )
  console.log(`Turned to page ${page} at ${new Date(nowMs).toISOString()}`)
} else if (command === 'finish') {
  const lastRow = await lastPageRowOf()
  const lastPage = lastRow === undefined ? 1 : lastRow.thingRangeStart
  await appendFile(
    recognitionsPath,
    endedLine(lastRow) + readingLine(lastPage, false, nowMs),
  )
  console.log(`Finished the reading at page ${lastPage}`)
} else {
  throw new Error('Commands: start [page], turn <page>, finish.')
}
