// Michael's Audible library, metadata only, into the universal app's library* entities (ADR 0052): title, subtitle,
// authors, narrators, series position, release year, runtime, ASIN, purchase date, the cover (uploaded to Instant
// storage), and chapters when the library data carries them. It never fetches or decrypts audio. A title arrives with
// an audio rendition that has no files, which the Books reader shows as "its audio is not in the library yet".
//
// The input is the parsed object that fetch_library.py writes to library.json (Audible's GET 1.0/library), so the
// Books server can pass Audible's answer straight in. Three functions:
//   planAudibleImport   reads the owner's library and returns each title's rows and its classification (create,
//                       update, or skip, each with a reason). It writes nothing.
//   applyAudibleImport  writes a plan as the owner (admin SDK asUser), uploads and checks the covers, verifies the
//                       result, and returns a journal of what it created and changed.
//   deleteAudibleImport rolls back what the importer added, by id, and restores what it changed on existing rows.
// Ids come from the owner and the ASIN, so a re-run lands on the same rows and writes nothing when nothing changed.
//
// Matching an existing book: by ASIN first, then by normalized title and first author. A matched book keeps its own
// rows (its audio, chapters, and cover stay). The import only fills what is missing and records the purchase date.
// Kindred and Dune, the old reader's demo rows, are never touched (DEMO_BOOK_IDS): Michael decides about them.
//
// Not carried, because the library schema has no place for it yet: the publisher, the series title, the full release
// date (the year is kept), and contributors credited with a role ("- foreword"). Each title's plan lists them under
// notCarried, so nothing is dropped silently.
//
// The reader lists only titles with at least one chapter (examples/books/core/src/model.ts, Title.chapters is a
// NonEmptyArray), and fetch_library.py asks Audible for no chapters. The plan flags such titles noChapters.
//
// This file imports only node:crypto and takes the admin database as an argument, so it can be vendored as it is.

import { createHash } from 'node:crypto'

// MARK: - Vocabulary

/** The library entities this import writes. */
export type LibraryNamespace =
  | 'libraryAuthors'
  | 'libraryNarrators'
  | 'libraryBooks'
  | 'libraryRenditions'
  | 'libraryItems'
  | 'libraryChapters'
  | 'libraryFiles'

/** The order rows are written in, so every link's two ends exist before the link is made. */
export const WRITE_ORDER: ReadonlyArray<LibraryNamespace> = [
  'libraryAuthors',
  'libraryNarrators',
  'libraryBooks',
  'libraryRenditions',
  'libraryItems',
  'libraryChapters',
  'libraryFiles',
]

/**
 * Production's demo rows from the old reader (ingest-books.ts): Kindred and Dune. Michael does not own them. A title
 * that matches one is skipped, never attached and never duplicated.
 */
export const DEMO_BOOK_IDS: ReadonlyArray<string> = [
  '6dec5ed4-bc64-5510-b2be-c9902fbf9e8f',
  'b49d424f-f28f-5af2-9b13-a4580d219410',
]

/** The hosts Audible's product images come from. Covers are fetched from these only, over HTTPS. */
export const AUDIBLE_COVER_HOSTS: ReadonlyArray<string> = [
  'm.media-amazon.com',
  'images-na.ssl-images-amazon.com',
  'images-eu.ssl-images-amazon.com',
  'images-fe.ssl-images-amazon.com',
  'images.amazon.com',
]

/** The reader reads at most this many items (examples/books/core/src/instantLibrary.ts, rowsLimit). */
export const READER_ITEM_LIMIT = 500

const ID_SEED = 'library-audible'
const PAGE_SIZE = 500
const ID_CHUNK = 100
const WRITE_CHUNK = 50
const WRITE_PAUSE_MS = 300
const COVER_INTERVAL_MS = 400
const TIMEOUT_MS = 5_000
const ATTEMPTS = 3
const MAX_COVER_BYTES = 15 * 1024 * 1024
const TITLE_LIMIT = 500
const NAME_LIMIT = 300
const SERIES_INDEX_LIMIT = 32
const MINUTE_MS = 60_000
const ASIN_PATTERN = /^[A-Z0-9]{10}$/
const ISBN13_PATTERN = /^97[89][0-9]{10}$/

const PODCAST_DELIVERY_TYPES: ReadonlySet<string> = new Set(['PodcastParent', 'PodcastEpisode', 'PodcastSeason', 'PodcastSeries', 'Periodical'])
const PART_DELIVERY_TYPES: ReadonlySet<string> = new Set(['AudioPart'])
const PODCAST_RELATIONSHIPS: ReadonlySet<string> = new Set(['episode', 'season'])
const MEMBER_BENEFIT_PLANS: ReadonlySet<string> = new Set(['ComplimentaryOriginalMemberBenefit', 'SpecialBenefit'])
const NAME_SUFFIXES: ReadonlySet<string> = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'dds', 'esq', 'mba'])
const UPDATED_AT: ReadonlySet<LibraryNamespace> = new Set(['libraryBooks', 'libraryRenditions', 'libraryFiles'])

const LANGUAGE_CODES: Readonly<Record<string, string>> = {
  english: 'en',
  spanish: 'es',
  castilian: 'es',
  german: 'de',
  french: 'fr',
  italian: 'it',
  portuguese: 'pt',
  brazilian_portuguese: 'pt',
  japanese: 'ja',
  chinese: 'zh',
  mandarin_chinese: 'zh',
  dutch: 'nl',
  russian: 'ru',
  polish: 'pl',
  swedish: 'sv',
  danish: 'da',
  norwegian: 'no',
  finnish: 'fi',
  hindi: 'hi',
  korean: 'ko',
  turkish: 'tr',
  arabic: 'ar',
  hebrew: 'he',
  greek: 'el',
  czech: 'cs',
  hungarian: 'hu',
  romanian: 'ro',
  ukrainian: 'uk',
  catalan: 'ca',
}

type Scalar = string | number | boolean
type Fields = Readonly<Record<string, Scalar>>
type Row = Readonly<Record<string, unknown>>

// MARK: - Ids

/** A version-5-bits UUID from SHA-256 of `name`: ADR 0048's construction, the same as books-knophy-transform.mjs. */
export function stableUUID(name: string): string {
  const bytes = Buffer.from(createHash('sha256').update(name).digest().subarray(0, 16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const seededID = (parts: ReadonlyArray<string>): string => stableUUID([ID_SEED, ...parts].join('|'))

/** The ids of one title's rows, from the owner and the ASIN alone, so a re-run lands on the same rows. */
export function audibleTitleIDs(owner: string, asin: string) {
  const ownerKey = owner.toLowerCase()
  return {
    book: seededID(['book', ownerKey, asin]),
    item: seededID(['item', ownerKey, asin]),
    rendition: seededID(['rendition', ownerKey, asin]),
    coverFile: seededID(['cover', ownerKey, asin]),
    chapter: (index: number): string => seededID(['chapter', ownerKey, asin, String(index)]),
  }
}

/** An author or narrator the import adds, from the owner and the normalized name. */
export function audiblePersonID(kind: 'author' | 'narrator', owner: string, name: string): string {
  return seededID([kind, owner.toLowerCase(), normalizedText(name)])
}

// MARK: - Reading Audible's answer

const isRecord = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)
const recordOf = (value: unknown): Row => (isRecord(value) ? value : {})
const listOf = (value: unknown): ReadonlyArray<unknown> => (Array.isArray(value) ? value : [])
const isAbsent = (value: unknown): boolean => value === undefined || value === null
const textOf = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed === '' ? undefined : trimmed
}
const numberOf = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
const scalarOf = (value: unknown): Scalar | null =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null
const timeOf = (value: unknown): number | undefined => {
  const text = textOf(value)
  if (text === undefined) return undefined
  const ms = Date.parse(text)
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined
}
const truncated = (text: string, limit: number): string => (text.length <= limit ? text : text.slice(0, limit))
const same = (left: Scalar | null | undefined, right: Scalar | null | undefined): boolean => (left ?? null) === (right ?? null)

/** Lower case, accents and punctuation gone, any script kept: "Jordan B. Peterson" and "jordan b peterson" are equal. */
export function normalizedText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Audible lists a contributor's role after a dash: "Norman Doidge MD - foreword". Authors are the ones with none. */
export function splitContributor(raw: string): Readonly<{ name: string; role?: string }> {
  const match = /^(.+?)\s+[-–—]\s+(\p{L}[\p{L} ,&/.]*)$/u.exec(raw)
  const name = match?.[1]?.trim()
  const role = match?.[2]?.trim()
  return name !== undefined && role !== undefined ? { name, role } : { name: raw }
}

/** "Jordan B. Peterson" sorts as "Peterson, Jordan B.", the shape the library's existing rows use. */
export function sortNameOf(name: string): string {
  const words = name.split(' ').filter((word) => word !== '')
  const suffixes: Array<string> = []
  while (words.length > 2 && NAME_SUFFIXES.has((words.at(-1) ?? '').toLowerCase().replace(/[.,]/g, ''))) {
    suffixes.unshift(words.pop() ?? '')
  }
  const surname = words.pop()
  if (surname === undefined || words.length === 0) return name
  return [`${surname}, ${words.join(' ')}`, ...suffixes].join(', ')
}

/** An ISO language code for Audible's language name ("english" is "en"), or "und" when it is not known. */
export function languageCodeOf(value: unknown): string {
  const name = (textOf(value) ?? '').toLowerCase().replace(/\s+/g, '_')
  const code = LANGUAGE_CODES[name]
  if (code !== undefined) return code
  return /^[a-z]{2,3}$/.test(name) ? name : 'und'
}

/** The size-suffix-free URL of an Amazon product image, or undefined when the URL is not one. */
export function nativeCoverURL(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    const match = /^\/images\/I\/([^/.]+)(?:\.[^/]*)?\.jpe?g$/i.exec(parsed.pathname)
    return match?.[1] === undefined ? undefined : `${parsed.origin}/images/I/${match[1]}.jpg`
  } catch {
    return undefined
  }
}

/**
 * The cover's URLs, best first: the largest image the CDN has (its URL with the size suffix removed:
 * `…/images/I/51T1NWIkR4L._SL500_.jpg` becomes `…/images/I/51T1NWIkR4L.jpg`, which is how Libation asks for the
 * native size), then the largest size Audible listed, as a fallback.
 */
export function coverURLsOf(productImages: unknown): ReadonlyArray<string> {
  const listed = Object.entries(recordOf(productImages))
    .flatMap(([size, url]) => (typeof url === 'string' ? [{ size: Number(size) || 0, url }] : []))
    .sort((left, right) => right.size - left.size)
  const largest = listed[0]?.url
  if (largest === undefined) return []
  const native = nativeCoverURL(largest)
  return native !== undefined && native !== largest ? [native, largest] : [largest]
}

/** A chapter the library data carries, in Audible's content_metadata.chapter_info shape (leaves only, flattened). */
export type AudibleChapter = Readonly<{ index: number; title: string; startMs: number; endMs: number }>

/**
 * The chapters of an item, if its data carries Audible's chapter_info (GET 1.0/content/<asin>/metadata), under
 * content_metadata or at the top. fetch_library.py asks for no chapter group, so its items have none. Nested chapters
 * are flattened to their leaves, as the old reader's ingest-audible.ts did.
 */
export function chaptersOf(item: Row): ReadonlyArray<AudibleChapter> {
  const nested = recordOf(item['content_metadata'])['chapter_info']
  const info = isRecord(nested) ? nested : recordOf(item['chapter_info'])
  const leaves: Array<AudibleChapter> = []
  const visit = (nodes: ReadonlyArray<unknown>): void => {
    for (const node of nodes) {
      const chapter = recordOf(node)
      const children = listOf(chapter['chapters'])
      if (children.length > 0) {
        visit(children)
        continue
      }
      const startMs = numberOf(chapter['start_offset_ms']) ?? leaves.at(-1)?.endMs ?? 0
      const lengthMs = numberOf(chapter['length_ms']) ?? 0
      if (startMs < 0 || lengthMs < 0) continue
      const index = leaves.length
      leaves.push({
        index,
        title: truncated(textOf(chapter['title']) ?? `Chapter ${index + 1}`, TITLE_LIMIT),
        startMs: Math.round(startMs),
        endMs: Math.round(startMs + lengthMs),
      })
    }
  }
  visit(listOf(info['chapters']))
  return leaves
}

/** A series an item belongs to, as Audible lists it. */
export type AudibleSeries = Readonly<{ title: string; sequence?: string; asin?: string }>

/** One item of the library, read into the fields the import uses. */
export type AudibleTitle = Readonly<{
  position: number
  asin: string
  title: string
  subtitle?: string
  authors: ReadonlyArray<string>
  contributors: ReadonlyArray<string>
  narrators: ReadonlyArray<string>
  series: ReadonlyArray<AudibleSeries>
  publisher?: string
  releaseDate?: string
  releaseYear?: number
  runtimeMs?: number
  purchasedAtMs?: number
  coverURLs: ReadonlyArray<string>
  language: string
  isbn13?: string
  chapters: ReadonlyArray<AudibleChapter>
  isPodcast: boolean
  isPart: boolean
  isAudiblePlus: boolean
  isAdult: boolean
  isPreorder: boolean
  status?: string
  originType?: string
  freeReason?: string
  partOf?: string
}>

/** An item that cannot be imported at all, and why. */
export type MalformedItem = Readonly<{ position: number; asin?: string; reason: string }>

const releaseYearOf = (releaseDate: string | undefined): number | undefined => {
  const year = Number(/^(\d{4})-\d{2}-\d{2}/.exec(releaseDate ?? '')?.[1])
  return Number.isInteger(year) && year >= 1000 && year <= 9999 ? year : undefined
}

const freeReasonOf = (item: Row): string | undefined => {
  if (item['origin_type'] === 'AudibleComplimentaryOriginal') return 'a complimentary Audible Original'
  const plans = listOf(item['plans']).map((plan) => textOf(recordOf(plan)['plan_name']) ?? '')
  if (plans.some((plan) => MEMBER_BENEFIT_PLANS.has(plan))) return 'a member benefit'
  const listPrice = numberOf(recordOf(recordOf(item['price'])['list_price'])['base'])
  return listPrice === 0 ? 'its list price is 0' : undefined
}

const peopleIn = (value: unknown): ReadonlyArray<Readonly<{ name: string; role?: string }>> =>
  listOf(value).flatMap((person) => {
    const name = textOf(recordOf(person)['name'])
    return name === undefined ? [] : [splitContributor(name)]
  })

/** One library item read into an AudibleTitle, or the reason it cannot be. Pure. */
export function readAudibleItem(raw: unknown, position: number, nowMs: number): AudibleTitle | MalformedItem {
  const item = recordOf(raw)
  const asin = textOf(item['asin'])?.toUpperCase()
  if (asin === undefined) return { position, reason: 'it has no ASIN' }
  if (!ASIN_PATTERN.test(asin)) return { position, asin, reason: `its ASIN ${JSON.stringify(asin)} is not 10 letters and digits` }
  const title = textOf(item['title'])
  if (title === undefined) return { position, asin, reason: 'it has no title' }
  if (title.length > TITLE_LIMIT) return { position, asin, reason: `its title is over ${TITLE_LIMIT} characters` }
  const credited = peopleIn(item['authors'])
  const authors = [...new Set(credited.filter((person) => person.role === undefined).map((person) => person.name))]
  const contributors = credited.flatMap((person) => (person.role === undefined ? [] : [`${person.name} (${person.role})`]))
  const narrators = [...new Set(peopleIn(item['narrators']).map((person) => person.name))]
  const series = listOf(item['series']).flatMap((entry): ReadonlyArray<AudibleSeries> => {
    const seriesTitle = textOf(recordOf(entry)['title'])
    if (seriesTitle === undefined) return []
    const sequence = textOf(recordOf(entry)['sequence'])
    const seriesASIN = textOf(recordOf(entry)['asin'])
    return [{ title: seriesTitle, ...(sequence === undefined ? {} : { sequence }), ...(seriesASIN === undefined ? {} : { asin: seriesASIN }) }]
  })
  const relationships = listOf(item['relationships']).map(recordOf)
  const deliveryType = textOf(item['content_delivery_type'])
  const isPodcast =
    item['content_type'] === 'Podcast' ||
    (deliveryType !== undefined && PODCAST_DELIVERY_TYPES.has(deliveryType)) ||
    relationships.some((relationship) => PODCAST_RELATIONSHIPS.has(String(relationship['relationship_type'])))
  const parent = relationships.find(
    (relationship) => relationship['relationship_to_product'] === 'parent' && relationship['relationship_type'] === 'component',
  )
  const releaseDate = textOf(item['release_date']) ?? textOf(item['issue_date'])
  const releaseYear = releaseYearOf(releaseDate)
  const releaseMs = timeOf(releaseDate)
  const runtimeMinutes = numberOf(item['runtime_length_min'])
  const purchasedAtMs = timeOf(item['purchase_date']) ?? timeOf(recordOf(item['library_status'])['date_added'])
  const isbn = textOf(item['isbn'])?.replace(/[\s-]/g, '')
  const subtitle = textOf(item['subtitle'])
  const publisher = textOf(item['publisher_name'])
  const status = textOf(item['status'])
  const originType = textOf(item['origin_type'])
  const freeReason = freeReasonOf(item)
  const partOf = textOf(parent?.['asin'])?.toUpperCase()
  return {
    position,
    asin,
    title,
    ...(subtitle === undefined ? {} : { subtitle: truncated(subtitle, TITLE_LIMIT) }),
    authors: authors.filter((name) => name.length <= NAME_LIMIT),
    contributors,
    narrators: narrators.filter((name) => name.length <= NAME_LIMIT),
    series,
    ...(publisher === undefined ? {} : { publisher }),
    ...(releaseDate === undefined ? {} : { releaseDate }),
    ...(releaseYear === undefined ? {} : { releaseYear }),
    ...(runtimeMinutes === undefined || runtimeMinutes < 0 ? {} : { runtimeMs: Math.round(runtimeMinutes * MINUTE_MS) }),
    ...(purchasedAtMs === undefined ? {} : { purchasedAtMs }),
    coverURLs: coverURLsOf(item['product_images']),
    language: languageCodeOf(item['language']),
    ...(isbn !== undefined && ISBN13_PATTERN.test(isbn) ? { isbn13: isbn } : {}),
    chapters: chaptersOf(item),
    isPodcast,
    isPart: deliveryType !== undefined && PART_DELIVERY_TYPES.has(deliveryType),
    isAudiblePlus: item['is_ayce'] === true || originType === 'AudibleChannels',
    isAdult: item['is_adult_product'] === true,
    isPreorder: recordOf(item['library_status'])['is_preordered'] === true || (releaseMs !== undefined && releaseMs > nowMs),
    ...(status === undefined ? {} : { status }),
    ...(originType === undefined ? {} : { originType }),
    ...(freeReason === undefined ? {} : { freeReason }),
    ...(partOf === undefined ? {} : { partOf }),
  }
}

const isMalformed = (read: AudibleTitle | MalformedItem): read is MalformedItem => !('title' in read)

/** What the Books server's audible_bridge.py `details` command found for one title: its chapters and exact runtime. */
export type AudibleDetails = Readonly<{ chapters: ReadonlyArray<AudibleChapter>; runtimeMs?: number }>

/**
 * The `details` lines by ASIN: `{ asin, chapters: [{ title, startMs, lengthMs }], runtimeMs }` from
 * `GET 1.0/content/<asin>/metadata` (chapter_info). A line with an error, the closing `{ done: true }`, and anything else
 * that is not a title's details are left out.
 */
export function detailsByASIN(details: unknown): ReadonlyMap<string, AudibleDetails> {
  const byASIN = new Map<string, AudibleDetails>()
  for (const line of listOf(details).map(recordOf)) {
    const asin = textOf(line['asin'])?.toUpperCase()
    if (asin === undefined || !ASIN_PATTERN.test(asin) || line['error'] !== undefined) continue
    const chapters = listOf(line['chapters'])
      .map(recordOf)
      .flatMap((chapter) => {
        const startMs = numberOf(chapter['startMs'])
        const lengthMs = numberOf(chapter['lengthMs'])
        return startMs === undefined || lengthMs === undefined || startMs < 0 || lengthMs < 0 ? [] : [{ title: textOf(chapter['title']), startMs, lengthMs }]
      })
      .sort((left, right) => left.startMs - right.startMs)
      .map((chapter, index): AudibleChapter => ({
        index,
        title: truncated(chapter.title ?? `Chapter ${index + 1}`, TITLE_LIMIT),
        startMs: Math.round(chapter.startMs),
        endMs: Math.round(chapter.startMs + chapter.lengthMs),
      }))
    const runtimeMs = numberOf(line['runtimeMs'])
    byASIN.set(asin, { chapters, ...(runtimeMs === undefined || runtimeMs < 0 ? {} : { runtimeMs: Math.round(runtimeMs) }) })
  }
  return byASIN
}

/** A title with its details: the details' chapters when the item carries none, and the details' exact runtime. */
const withDetails = (read: AudibleTitle | MalformedItem, details: ReadonlyMap<string, AudibleDetails>): AudibleTitle | MalformedItem => {
  if (isMalformed(read)) return read
  const found = details.get(read.asin)
  if (found === undefined) return read
  const runtimeMs = found.runtimeMs ?? read.runtimeMs
  return { ...read, chapters: read.chapters.length > 0 ? read.chapters : found.chapters, ...(runtimeMs === undefined ? {} : { runtimeMs }) }
}

/** The items of a parsed library.json: `{ total_results, items: [...] }`, the shape fetch_library.py writes. */
export function libraryItemsOf(library: unknown): ReadonlyArray<unknown> {
  const items = recordOf(library)['items']
  if (!Array.isArray(items)) {
    throw new AudibleImportError('the library has no items array: expected the object fetch_library.py writes to library.json')
  }
  return items
}

/** An import that cannot go on, with what to do about it in the message. */
export class AudibleImportError extends Error {
  override name = 'AudibleImportError'
}

// MARK: - The owner's library as it is

/** A row the import may change or link, as the owner's query returned it. */
export type ExistingRow = Readonly<{
  id: string
  fields: Readonly<Record<string, Scalar | null>>
  links: Readonly<Record<string, ReadonlyArray<string>>>
}>

/** An owner's book with what matching and attaching need. */
export type ExistingBook = Readonly<{
  id: string
  fields: Readonly<Record<string, Scalar | null>>
  authors: ReadonlyArray<Readonly<{ id: string; name: string }>>
  narrators: ReadonlyArray<Readonly<{ id: string; name: string }>>
  items: ReadonlyArray<ExistingRow>
  coverIDs: ReadonlyArray<string>
  hasCoverBytes: boolean
  audioRenditionIDs: ReadonlyArray<string>
  chapterCount: number
}>

/** What the plan reads: the owner's books, people, shelves, and items, and the rows at the importer's ids. */
export type LibrarySnapshot = Readonly<{
  books: ReadonlyArray<ExistingBook>
  authors: ReadonlyArray<Readonly<{ id: string; name: string }>>
  narrators: ReadonlyArray<Readonly<{ id: string; name: string }>>
  shelves: ReadonlyArray<Readonly<{ id: string; name: string; createdAtMs: number }>>
  rows: Readonly<Partial<Record<LibraryNamespace, Readonly<Record<string, ExistingRow>>>>>
  itemCount: number
}>

// MARK: - The plan

/** A row to write: all of it when it is new, else only the fields that change. Has-one links go in the same step. */
export type RowWrite = Readonly<{
  namespace: LibraryNamespace
  id: string
  isCreate: boolean
  fields: Fields
  links: Readonly<Record<string, string>>
}>

/** A link to add between two rows that exist by the time links are written. */
export type LinkWrite = Readonly<{ namespace: LibraryNamespace; id: string; label: string; to: string }>

/** A cover to fetch, upload under the owner's library path, and link (two writes, ADR 0052 finding 11). */
export type CoverWrite = Readonly<{
  bookID: string
  fileID: string
  name: string
  storagePath: string
  urls: ReadonlyArray<string>
  hasFileRow: boolean
}>

/** One field the import changes on a row that is already there. On a row it did not create, the journal keeps it. */
export type FieldChange = Readonly<{
  asin: string
  namespace: LibraryNamespace
  id: string
  field: string
  before: Scalar | null
  after: Scalar
}>

/** Why a title is skipped. */
export type SkipKind =
  | 'malformed'
  | 'podcast'
  | 'audiblePlus'
  | 'inactive'
  | 'part'
  | 'duplicate'
  | 'ambiguous'
  | 'demoRow'
  | 'unchanged'

/** Something about a title worth Michael's eyes, whatever the import does with it. */
export type TitleFlag =
  | 'podcast'
  | 'audiblePlus'
  | 'free'
  | 'notPurchase'
  | 'adult'
  | 'duplicate'
  | 'preorder'
  | 'noChapters'
  | 'noCover'

/** What a title brings that the library schema has no place for yet. */
export type NotCarried = Readonly<{
  publisher?: string
  series?: ReadonlyArray<AudibleSeries>
  releaseDate?: string
  contributors?: ReadonlyArray<string>
}>

/** One library item's place in the plan. */
export type PlannedTitle = Readonly<{
  position: number
  asin?: string
  title: string
  authors: ReadonlyArray<string>
  action: 'create' | 'update' | 'skip'
  match: 'none' | 'asin' | 'titleAndAuthor' | 'imported'
  reason: string
  skip?: SkipKind
  flags: ReadonlyArray<TitleFlag>
  bookID?: string
  chapters: number
  notCarried: NotCarried
  rows: ReadonlyArray<RowWrite>
  links: ReadonlyArray<LinkWrite>
  cover?: CoverWrite
  changes: ReadonlyArray<FieldChange>
}>

/** The plan's counts, for the dry run and the app's confirmation screen. */
export type PlanSummary = Readonly<{
  libraryItems: number
  selected: number
  unknownASINs: ReadonlyArray<string>
  wouldCreate: number
  wouldUpdate: number
  wouldSkip: number
  matchedExisting: number
  alreadyImported: number
  coversToFetch: number
  withoutChapters: number
  skipped: Readonly<Partial<Record<SkipKind, number>>>
  flags: Readonly<Partial<Record<TitleFlag, number>>>
  notCarried: Readonly<{ publisher: number; series: number; releaseDate: number; contributors: number }>
  rows: Readonly<Partial<Record<LibraryNamespace, Readonly<{ create: number; update: number }>>>>
  links: number
  readerItems: Readonly<{ after: number; limit: number }>
}>

/** Everything an import would write, and why. Plain JSON, so a server can show it, keep it, and apply it later. */
export type AudibleImportPlan = Readonly<{
  kind: 'audibleImportPlan'
  formatVersion: 1
  owner: Readonly<{ id: string; email: string }>
  nowMs: number
  people: ReadonlyArray<RowWrite>
  titles: ReadonlyArray<PlannedTitle>
  summary: PlanSummary
}>

/** The inputs of the pure planner. */
export type PlanInput = Readonly<{
  library: unknown
  owner: Readonly<{ id: string; email: string }>
  snapshot: LibrarySnapshot
  asins?: ReadonlyArray<string>
  demoBookIDs?: ReadonlyArray<string>
  details?: unknown
  nowMs: number
}>

const parsedIdentifiers = (identifiersJSON: Scalar | null | undefined): ReadonlyArray<unknown> => {
  try {
    return listOf(JSON.parse(String(identifiersJSON ?? '[]')))
  } catch {
    return []
  }
}

/** The ASINs a book's identifiersJSON holds, upper case. */
export function asinsIn(identifiersJSON: Scalar | null | undefined): ReadonlyArray<string> {
  return parsedIdentifiers(identifiersJSON).flatMap((entry) => {
    const kind = textOf(recordOf(entry)['kind'])?.toLowerCase()
    const value = textOf(recordOf(entry)['value'])?.toUpperCase()
    return kind === 'asin' && value !== undefined ? [value] : []
  })
}

const slugOf = (title: string): string =>
  normalizedText(title).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'cover'

const titleKey = (title: string, author: string | undefined): string => `${normalizedText(title)}|${normalizedText(author ?? '')}`

const tally = <K extends string>(keys: ReadonlyArray<K>): Partial<Record<K, number>> => {
  const counts: Partial<Record<K, number>> = {}
  for (const key of keys) counts[key] = (counts[key] ?? 0) + 1
  return counts
}

const dedupeLinks = (links: ReadonlyArray<LinkWrite>): ReadonlyArray<LinkWrite> => {
  const seen = new Set<string>()
  return links.filter((link) => {
    const key = `${link.namespace}|${link.id}|${link.label}|${link.to}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

type TitleContext = Readonly<{
  read: AudibleTitle
  base: Readonly<{ position: number; asin: string; title: string; authors: ReadonlyArray<string>; notCarried: NotCarried }>
  flags: Set<TitleFlag>
  ownerID: string
  nowMs: number
  ids: ReturnType<typeof audibleTitleIDs>
  personFor: (kind: 'author' | 'narrator', name: string) => string
  homeShelfID: string | undefined
  snapshot: LibrarySnapshot
}>

type DesiredRow = Readonly<{ sourced: Fields; createOnly: Fields; links?: Readonly<Record<string, string>> }>

/** The rows a title of the importer's own should have, from Audible's data. Sourced fields stay in step with it. */
function desiredRows(context: TitleContext) {
  const { read, ownerID, nowMs, ids, homeShelfID } = context
  const owned = { ownerUserID: ownerID, formatVersion: 1 }
  const identifiers = [{ kind: 'asin', value: read.asin }, ...(read.isbn13 === undefined ? [] : [{ kind: 'isbn13', value: read.isbn13 }])]
  const seriesIndex = read.series[0]?.sequence
  const book: DesiredRow = {
    sourced: {
      title: read.title,
      ...(read.subtitle === undefined ? {} : { subtitle: read.subtitle }),
      identifiersJSON: JSON.stringify(identifiers),
      ...(read.isbn13 === undefined ? {} : { isbn13: read.isbn13 }),
      bindingKind: 'audiobook',
      publishedKind: read.releaseYear === undefined ? 'unknown' : 'year',
      ...(read.releaseYear === undefined ? {} : { publishedYear: read.releaseYear }),
      explicitKind: read.isAdult ? 'explicit' : 'unknown',
      matchKind: 'matched',
      matchProvider: 'audible',
      matchValue: read.asin,
      ...(seriesIndex === undefined ? {} : { seriesIndex: truncated(seriesIndex, SERIES_INDEX_LIMIT) }),
      language: read.language,
    },
    createOnly: { ...owned, createdAtMs: nowMs, updatedAtMs: nowMs },
  }
  const rendition: DesiredRow = {
    sourced: {
      bodyKind: 'audio',
      originKind: 'audible',
      language: read.language,
      title: truncated(`${read.title} audio`, TITLE_LIMIT),
      ...(read.runtimeMs === undefined ? {} : { durationMs: read.runtimeMs }),
      volumeKind: 'single',
    },
    createOnly: { ...owned, createdAtMs: nowMs, updatedAtMs: nowMs },
    links: { book: ids.book },
  }
  const item: DesiredRow = {
    sourced: { preferredKind: 'audio', presenceKind: 'audible', ...(read.purchasedAtMs === undefined ? {} : { addedAtMs: read.purchasedAtMs }) },
    createOnly: { ...owned, ...(read.purchasedAtMs === undefined ? { addedAtMs: nowMs } : {}) },
    links: { book: ids.book, preferredAudio: ids.rendition, ...(homeShelfID === undefined ? {} : { shelf: homeShelfID }) },
  }
  return { book, rendition, item, chapters: chapterRows(read, ids, ownerID, ids.book) }
}

const chapterRows = (read: AudibleTitle, ids: ReturnType<typeof audibleTitleIDs>, ownerID: string, bookID: string) =>
  read.chapters.map((chapter) => ({
    id: ids.chapter(chapter.index),
    desired: {
      sourced: { index: chapter.index, title: chapter.title, startMs: chapter.startMs, endMs: chapter.endMs, bindingKind: 'audiobook' },
      createOnly: { ownerUserID: ownerID, formatVersion: 1 },
      links: { book: bookID },
    },
  }))

type Reconciled = Readonly<{ row?: RowWrite; links: ReadonlyArray<LinkWrite>; changes: ReadonlyArray<FieldChange> }>

/**
 * A row's write against what is there: all of it when it is new, only the fields that differ when not, and nothing
 * when they are equal. A has-one link is added only where the row has none, so a link set since is never replaced.
 */
function reconcileRow(asin: string, namespace: LibraryNamespace, id: string, desired: DesiredRow, existing: ExistingRow | undefined, nowMs: number): Reconciled {
  if (existing === undefined) {
    return { row: { namespace, id, isCreate: true, fields: { ...desired.sourced, ...desired.createOnly }, links: desired.links ?? {} }, links: [], changes: [] }
  }
  const changed = Object.entries(desired.sourced).filter(([field, value]) => !same(existing.fields[field], value))
  const links = Object.entries(desired.links ?? {})
    .filter(([label]) => (existing.links[label] ?? []).length === 0)
    .map(([label, to]): LinkWrite => ({ namespace, id, label, to }))
  if (changed.length === 0) return { links, changes: [] }
  const updatedAtMs = Math.max(nowMs, Number(existing.fields['updatedAtMs'] ?? 0))
  return {
    row: { namespace, id, isCreate: false, fields: { ...Object.fromEntries(changed), ...(UPDATED_AT.has(namespace) ? { updatedAtMs } : {}) }, links: {} },
    links,
    changes: changed.map(([field, after]): FieldChange => ({ asin, namespace, id, field, before: existing.fields[field] ?? null, after })),
  }
}

function coverFor(context: TitleContext, book: ExistingBook | undefined, bookID: string): CoverWrite | undefined {
  const { read, ids, ownerID, snapshot } = context
  const hasCover = book !== undefined && book.coverIDs.length > 0
  if (hasCover && (book.hasCoverBytes || !book.coverIDs.includes(ids.coverFile))) return undefined
  if (read.coverURLs.length === 0) return undefined
  const name = `${slugOf(read.title)}.jpg`
  return {
    bookID,
    fileID: ids.coverFile,
    name,
    storagePath: `library/${ownerID}/files/${ids.coverFile}/${name}`,
    urls: read.coverURLs,
    hasFileRow: snapshot.rows.libraryFiles?.[ids.coverFile] !== undefined,
  }
}

const peopleLinks = (
  read: AudibleTitle,
  personFor: TitleContext['personFor'],
  bookID: string,
  linkedAuthorIDs: ReadonlySet<string>,
  linkedNarratorIDs: ReadonlySet<string>,
): ReadonlyArray<LinkWrite> =>
  dedupeLinks([
    ...read.authors
      .map((name) => personFor('author', name))
      .filter((id) => !linkedAuthorIDs.has(id))
      .map((id): LinkWrite => ({ namespace: 'libraryAuthors', id, label: 'books', to: bookID })),
    ...read.narrators
      .map((name) => personFor('narrator', name))
      .filter((id) => !linkedNarratorIDs.has(id))
      .map((id): LinkWrite => ({ namespace: 'libraryNarrators', id, label: 'books', to: bookID })),
  ])

/** A title new to the library, or one the importer made before: its rows, kept in step with Audible's data. */
function reconcileImported(context: TitleContext & Readonly<{ imported: ExistingBook | undefined }>): PlannedTitle {
  const { read, base, flags, nowMs, ids, personFor, snapshot, imported } = context
  const desired = desiredRows(context)
  const existingRow = (namespace: LibraryNamespace, id: string): ExistingRow | undefined =>
    namespace === 'libraryBooks' ? (imported === undefined ? undefined : { id, fields: imported.fields, links: {} }) : snapshot.rows[namespace]?.[id]
  const results: ReadonlyArray<Reconciled> = [
    reconcileRow(read.asin, 'libraryBooks', ids.book, desired.book, existingRow('libraryBooks', ids.book), nowMs),
    reconcileRow(read.asin, 'libraryRenditions', ids.rendition, desired.rendition, existingRow('libraryRenditions', ids.rendition), nowMs),
    reconcileRow(read.asin, 'libraryItems', ids.item, desired.item, existingRow('libraryItems', ids.item), nowMs),
    ...desired.chapters.map((chapter) => reconcileRow(read.asin, 'libraryChapters', chapter.id, chapter.desired, existingRow('libraryChapters', chapter.id), nowMs)),
  ]
  const rows = results.flatMap((result) => (result.row === undefined ? [] : [result.row]))
  const links = [
    ...results.flatMap((result) => result.links),
    ...peopleLinks(
      read,
      personFor,
      ids.book,
      new Set(imported?.authors.map((author) => author.id) ?? []),
      new Set(imported?.narrators.map((narrator) => narrator.id) ?? []),
    ),
  ]
  const cover = coverFor(context, imported, ids.book)
  const chapters = Math.max(read.chapters.length, imported?.chapterCount ?? 0)
  if (chapters === 0) flags.add('noChapters')
  if (read.coverURLs.length === 0 && (imported?.coverIDs.length ?? 0) === 0) flags.add('noCover')
  const isNew = imported === undefined
  const hasWork = rows.length > 0 || links.length > 0 || cover !== undefined
  const unchanged: SkipKind = 'unchanged'
  return {
    ...base,
    action: isNew ? 'create' : hasWork ? 'update' : 'skip',
    match: isNew ? 'none' : 'imported',
    reason: isNew ? 'new to the library' : hasWork ? 'imported before; brings its rows in step with Audible' : 'imported before; nothing changed',
    ...(isNew || hasWork ? {} : { skip: unchanged }),
    flags: [...flags],
    bookID: ids.book,
    chapters,
    rows,
    links,
    ...(cover === undefined ? {} : { cover }),
    changes: results.flatMap((result) => result.changes),
  }
}

/**
 * A title Michael already has in the library, from before the importer. Its own rows stay (audio, chapters, cover).
 * The import fills only what is missing: the ASIN, subtitle, release year, series position, ISBN-13, an explicit mark,
 * authors, narrators, chapters, an item, and a cover. It also records the Audible purchase date on the book's one item.
 * Each change keeps its old value, for the journal.
 */
function attachToExisting(context: TitleContext & Readonly<{ existing: ExistingBook; match: 'asin' | 'titleAndAuthor' }>): PlannedTitle {
  const { read, base, flags, existing, match, nowMs, ids, personFor, homeShelfID, ownerID } = context
  const fields = existing.fields
  const fills: Array<readonly [string, Scalar]> = []
  if (!asinsIn(fields['identifiersJSON']).includes(read.asin)) {
    fills.push(['identifiersJSON', JSON.stringify([...parsedIdentifiers(fields['identifiersJSON']), { kind: 'asin', value: read.asin }])])
  }
  if ((fields['subtitle'] ?? '') === '' && read.subtitle !== undefined) fills.push(['subtitle', read.subtitle])
  if (isAbsent(fields['publishedYear']) && read.releaseYear !== undefined) {
    fills.push(['publishedYear', read.releaseYear])
    if (fields['publishedKind'] !== 'year') fills.push(['publishedKind', 'year'])
  }
  const seriesIndex = read.series[0]?.sequence
  if (isAbsent(fields['seriesIndex']) && seriesIndex !== undefined) fills.push(['seriesIndex', truncated(seriesIndex, SERIES_INDEX_LIMIT)])
  if (isAbsent(fields['isbn13']) && read.isbn13 !== undefined) fills.push(['isbn13', read.isbn13])
  if (fields['explicitKind'] === 'unknown' && read.isAdult) fills.push(['explicitKind', 'explicit'])

  const rows: Array<RowWrite> = []
  const links: Array<LinkWrite> = []
  const changes: Array<FieldChange> = []
  const notes: Array<string> = []
  if (fills.length > 0) {
    const updatedAtMs = Math.max(nowMs, Number(fields['updatedAtMs'] ?? 0))
    rows.push({ namespace: 'libraryBooks', id: existing.id, isCreate: false, fields: { ...Object.fromEntries(fills), updatedAtMs }, links: {} })
    changes.push(...fills.map(([field, after]): FieldChange => ({ asin: read.asin, namespace: 'libraryBooks', id: existing.id, field, before: fields[field] ?? null, after })))
  }
  const [onlyItem, ...otherItems] = existing.items
  if (onlyItem === undefined) {
    const [preferredAudio, ...otherAudio] = existing.audioRenditionIDs
    rows.push({
      namespace: 'libraryItems',
      id: ids.item,
      isCreate: true,
      fields: { ownerUserID: ownerID, formatVersion: 1, preferredKind: 'audio', presenceKind: 'audible', addedAtMs: read.purchasedAtMs ?? nowMs },
      links: {
        book: existing.id,
        ...(preferredAudio === undefined || otherAudio.length > 0 ? {} : { preferredAudio }),
        ...(homeShelfID === undefined ? {} : { shelf: homeShelfID }),
      },
    })
  } else if (otherItems.length === 0) {
    if (read.purchasedAtMs !== undefined && !same(onlyItem.fields['addedAtMs'], read.purchasedAtMs)) {
      rows.push({ namespace: 'libraryItems', id: onlyItem.id, isCreate: false, fields: { addedAtMs: read.purchasedAtMs }, links: {} })
      changes.push({ asin: read.asin, namespace: 'libraryItems', id: onlyItem.id, field: 'addedAtMs', before: onlyItem.fields['addedAtMs'] ?? null, after: read.purchasedAtMs })
    }
  } else {
    notes.push(`it has ${existing.items.length} items, so no purchase date is recorded`)
  }
  if (existing.chapterCount === 0) rows.push(...chapterRows(read, ids, ownerID, existing.id).map((chapter): RowWrite => ({ namespace: 'libraryChapters', id: chapter.id, isCreate: true, fields: { ...chapter.desired.sourced, ...chapter.desired.createOnly }, links: chapter.desired.links })))
  const missingPeople = {
    ...read,
    authors: existing.authors.length === 0 ? read.authors : [],
    narrators: existing.narrators.length === 0 ? read.narrators : [],
  }
  links.push(...peopleLinks(missingPeople, personFor, existing.id, new Set(), new Set()))
  const cover = existing.coverIDs.length === 0 ? coverFor(context, existing, existing.id) : undefined
  const chapters = existing.chapterCount > 0 ? existing.chapterCount : read.chapters.length
  if (chapters === 0) flags.add('noChapters')
  if (existing.coverIDs.length === 0 && read.coverURLs.length === 0) flags.add('noCover')
  const hasWork = rows.length > 0 || links.length > 0 || cover !== undefined
  const how = match === 'asin' ? 'by ASIN' : 'by title and first author'
  const name = String(fields['title'] ?? existing.id)
  const unchanged: SkipKind = 'unchanged'
  return {
    ...base,
    action: hasWork ? 'update' : 'skip',
    match,
    reason: hasWork
      ? `matched ${name} ${how}; attaches the Audible metadata to it${notes.length > 0 ? ` (${notes.join('; ')})` : ''}`
      : `matched ${name} ${how}; nothing to attach`,
    ...(hasWork ? {} : { skip: unchanged }),
    flags: [...flags],
    bookID: existing.id,
    chapters,
    rows,
    links,
    ...(cover === undefined ? {} : { cover }),
    changes,
  }
}

/**
 * The plan for a library against the owner's library as it is. Pure: the snapshot comes in, the rows and their reasons
 * come out, and the same inputs give the same plan. Tested alone; planAudibleImport reads the snapshot first.
 */
export function planFromSnapshot(input: PlanInput): AudibleImportPlan {
  const { owner, snapshot, nowMs } = input
  const ownerID = owner.id
  const demoBookIDs = new Set(input.demoBookIDs ?? DEMO_BOOK_IDS)
  const rawItems = libraryItemsOf(input.library)
  const details = detailsByASIN(input.details)
  const reads = rawItems.map((raw, position) => withDetails(readAudibleItem(raw, position, nowMs), details))
  const wanted = input.asins === undefined ? undefined : new Set(input.asins.map((asin) => asin.trim().toUpperCase()))
  const selected = reads.filter((read) => wanted === undefined || (read.asin !== undefined && wanted.has(read.asin)))
  const knownASINs = new Set(reads.flatMap((read) => (read.asin === undefined ? [] : [read.asin])))
  const unknownASINs = wanted === undefined ? [] : [...wanted].filter((asin) => !knownASINs.has(asin))
  const titlesByASIN = new Map(reads.flatMap((read): ReadonlyArray<readonly [string, string]> => (isMalformed(read) ? [] : [[read.asin, read.title]])))
  const isPartOfLibrary = (read: AudibleTitle) => read.partOf !== undefined && titlesByASIN.has(read.partOf)
  const isEligible = (read: AudibleTitle | MalformedItem): read is AudibleTitle =>
    !isMalformed(read) && !read.isPodcast && !read.isPart && !read.isAudiblePlus && (read.status ?? 'Active') === 'Active' && !isPartOfLibrary(read)

  // People: one row per normalized name. An existing author or narrator with that name is linked instead.
  const byName = (rows: LibrarySnapshot['authors']) => {
    const index = new Map<string, Array<Readonly<{ id: string; name: string }>>>()
    for (const person of rows) index.set(normalizedText(person.name), [...(index.get(normalizedText(person.name)) ?? []), person])
    return index
  }
  const authorsByName = byName(snapshot.authors)
  const narratorsByName = byName(snapshot.narrators)
  const people = new Map<string, RowWrite>()
  const personFor = (kind: 'author' | 'narrator', name: string): string => {
    const known = (kind === 'author' ? authorsByName : narratorsByName).get(normalizedText(name)) ?? []
    const ownID = audiblePersonID(kind, ownerID, name)
    const found = known.find((person) => person.id === ownID) ?? [...known].sort((left, right) => left.id.localeCompare(right.id))[0]
    if (found !== undefined) return found.id
    const namespace: LibraryNamespace = kind === 'author' ? 'libraryAuthors' : 'libraryNarrators'
    people.set(ownID, {
      namespace,
      id: ownID,
      isCreate: true,
      fields: { ownerUserID: ownerID, formatVersion: 1, name, sortName: truncated(sortNameOf(name), NAME_LIMIT) },
      links: {},
    })
    return ownID
  }

  const home = [...snapshot.shelves]
    .filter((shelf) => shelf.name.trim().toLowerCase() === 'home')
    .sort((left, right) => left.createdAtMs - right.createdAtMs)[0]
  const booksByID = new Map(snapshot.books.map((book) => [book.id, book]))
  const importerBookIDs = new Set(reads.flatMap((read) => (read.asin === undefined ? [] : [audibleTitleIDs(ownerID, read.asin).book])))
  // The books the importer did not make, indexed by ASIN and by normalized title, so matching is a lookup.
  const booksByASIN = new Map<string, Array<ExistingBook>>()
  const booksByTitle = new Map<string, Array<Readonly<{ book: ExistingBook; authors: ReadonlySet<string> }>>>()
  for (const book of snapshot.books.filter((candidate) => !importerBookIDs.has(candidate.id))) {
    for (const asin of new Set(asinsIn(book.fields['identifiersJSON']))) booksByASIN.set(asin, [...(booksByASIN.get(asin) ?? []), book])
    const key = normalizedText(String(book.fields['title'] ?? ''))
    booksByTitle.set(key, [...(booksByTitle.get(key) ?? []), { book, authors: new Set(book.authors.map((author) => normalizedText(author.name))) }])
  }

  // Duplicates inside the library: one ASIN listed twice, or one title and first author under two ASINs (two
  // editions). The edition bought first stands; the others are skipped and flagged for Michael.
  const duplicateOf = new Map<number, string>()
  const firstByASIN = new Map<string, AudibleTitle>()
  const byTitleKey = new Map<string, Array<AudibleTitle>>()
  for (const read of selected.filter(isEligible)) {
    if (firstByASIN.has(read.asin)) {
      duplicateOf.set(read.position, `${read.asin} is listed twice; the first listing stands`)
      continue
    }
    firstByASIN.set(read.asin, read)
    const key = titleKey(read.title, read.authors[0])
    byTitleKey.set(key, [...(byTitleKey.get(key) ?? []), read])
  }
  for (const group of byTitleKey.values()) {
    const [kept, ...others] = [...group].sort(
      (left, right) => (left.purchasedAtMs ?? Number.MAX_SAFE_INTEGER) - (right.purchasedAtMs ?? Number.MAX_SAFE_INTEGER) || left.position - right.position,
    )
    if (kept === undefined) continue
    for (const other of others) duplicateOf.set(other.position, `another edition, ${kept.title} (${kept.asin}), has the same title and first author and stands`)
  }

  const skipped = (read: AudibleTitle | MalformedItem, skip: SkipKind, reason: string, flags: ReadonlyArray<TitleFlag>): PlannedTitle => ({
    position: read.position,
    ...(read.asin === undefined ? {} : { asin: read.asin }),
    title: isMalformed(read) ? '' : read.title,
    authors: isMalformed(read) ? [] : read.authors,
    action: 'skip',
    match: 'none',
    reason,
    skip,
    flags,
    chapters: isMalformed(read) ? 0 : read.chapters.length,
    notCarried: {},
    rows: [],
    links: [],
    changes: [],
  })

  const titles = selected.map((read): PlannedTitle => {
    if (isMalformed(read)) return skipped(read, 'malformed', `not imported: ${read.reason}`, [])
    const flags = new Set<TitleFlag>()
    if (read.freeReason !== undefined) flags.add('free')
    if (read.originType !== undefined && read.originType !== 'Purchase' && !read.isAudiblePlus && read.freeReason === undefined) flags.add('notPurchase')
    if (read.isAdult) flags.add('adult')
    if (read.isPreorder) flags.add('preorder')
    if (read.isPodcast) return skipped(read, 'podcast', 'a podcast, not a book', ['podcast'])
    if (read.isAudiblePlus) return skipped(read, 'audiblePlus', 'an Audible Plus loan: in the library through the membership, not owned', ['audiblePlus'])
    if ((read.status ?? 'Active') !== 'Active') return skipped(read, 'inactive', `its library status is ${read.status ?? ''}`, [...flags])
    if (read.isPart) return skipped(read, 'part', 'a part of a multi-part book (AudioPart), which is imported whole', [...flags])
    if (read.partOf !== undefined && isPartOfLibrary(read)) {
      return skipped(read, 'part', `a part of ${titlesByASIN.get(read.partOf) ?? read.partOf} (${read.partOf}), which is imported whole`, [...flags])
    }
    const duplicate = duplicateOf.get(read.position)
    if (duplicate !== undefined) return skipped(read, 'duplicate', duplicate, [...flags, 'duplicate'])

    const ids = audibleTitleIDs(ownerID, read.asin)
    const imported = booksByID.get(ids.book)
    const byASIN = booksByASIN.get(read.asin) ?? []
    const firstAuthor = read.authors[0]
    const byTitle =
      firstAuthor === undefined
        ? []
        : (booksByTitle.get(normalizedText(read.title)) ?? []).filter(({ authors }) => authors.has(normalizedText(firstAuthor))).map(({ book }) => book)
    const notCarried: NotCarried = {
      ...(read.publisher === undefined ? {} : { publisher: read.publisher }),
      ...(read.series.length === 0 ? {} : { series: read.series }),
      ...(read.releaseDate === undefined ? {} : { releaseDate: read.releaseDate }),
      ...(read.contributors.length === 0 ? {} : { contributors: read.contributors }),
    }
    const context: TitleContext = {
      read,
      base: { position: read.position, asin: read.asin, title: read.title, authors: read.authors, notCarried },
      flags,
      ownerID,
      nowMs,
      ids,
      personFor,
      homeShelfID: home?.id,
      snapshot,
    }
    if (imported === undefined) {
      const matches = byASIN.length > 0 ? byASIN : byTitle
      const match = byASIN.length > 0 ? 'asin' : 'titleAndAuthor'
      const demo = matches.find((book) => demoBookIDs.has(book.id))
      if (demo !== undefined) {
        return skipped(read, 'demoRow', `matches the demo row ${String(demo.fields['title'] ?? demo.id)} (${demo.id}), which Michael decides about`, [...flags])
      }
      if (matches.length > 1) {
        return skipped(read, 'ambiguous', `matches ${matches.length} existing books (${matches.map((book) => book.id).join(', ')}): resolve the duplicate first`, [...flags, 'duplicate'])
      }
      const [existing] = matches
      if (existing !== undefined) return attachToExisting({ ...context, existing, match })
    } else if (byASIN.length > 0 || byTitle.length > 0) {
      flags.add('duplicate')
    }
    return reconcileImported({ ...context, imported })
  })

  const peopleRows = [...people.values()]
  const acting = titles.filter((title) => title.action !== 'skip')
  const rowCounts: Partial<Record<LibraryNamespace, { create: number; update: number }>> = {}
  for (const row of [...peopleRows, ...titles.flatMap((title) => title.rows)]) {
    const counts = rowCounts[row.namespace] ?? { create: 0, update: 0 }
    rowCounts[row.namespace] = row.isCreate ? { ...counts, create: counts.create + 1 } : { ...counts, update: counts.update + 1 }
  }
  const newItems = titles.reduce((sum, title) => sum + title.rows.filter((row) => row.namespace === 'libraryItems' && row.isCreate).length, 0)
  const listed = titles.filter((title) => title.action !== 'skip' || title.skip === 'unchanged')
  const summary: PlanSummary = {
    libraryItems: rawItems.length,
    selected: selected.length,
    unknownASINs,
    wouldCreate: titles.filter((title) => title.action === 'create').length,
    wouldUpdate: titles.filter((title) => title.action === 'update').length,
    wouldSkip: titles.filter((title) => title.action === 'skip').length,
    matchedExisting: titles.filter((title) => title.match === 'asin' || title.match === 'titleAndAuthor').length,
    alreadyImported: titles.filter((title) => title.match === 'imported').length,
    coversToFetch: titles.filter((title) => title.cover !== undefined).length,
    withoutChapters: listed.filter((title) => title.flags.includes('noChapters')).length,
    skipped: tally(titles.flatMap((title) => (title.skip === undefined ? [] : [title.skip]))),
    flags: tally(titles.flatMap((title) => title.flags)),
    notCarried: {
      publisher: acting.filter((title) => title.notCarried.publisher !== undefined).length,
      series: acting.filter((title) => title.notCarried.series !== undefined).length,
      releaseDate: acting.filter((title) => title.notCarried.releaseDate !== undefined).length,
      contributors: acting.filter((title) => title.notCarried.contributors !== undefined).length,
    },
    rows: rowCounts,
    links: titles.reduce((sum, title) => sum + title.links.length, 0),
    readerItems: { after: snapshot.itemCount + newItems, limit: READER_ITEM_LIMIT },
  }
  return { kind: 'audibleImportPlan', formatVersion: 1, owner, nowMs, people: peopleRows, titles, summary }
}

// MARK: - The admin database it is given

/** One step of a transaction, as the admin SDK's `db.tx.<namespace>[id]` builds it. */
export interface TransactionStep {
  update(fields: Readonly<Record<string, unknown>>): TransactionStep
  link(links: Readonly<Record<string, string>>): TransactionStep
  unlink(links: Readonly<Record<string, string>>): TransactionStep
  delete(): TransactionStep
}

/** What one identity's queries and writes need: the admin SDK's `db.asUser(...)`. */
export interface ScopedDatabase {
  query(query: object): Promise<unknown>
  transact(steps: ReadonlyArray<TransactionStep>): Promise<unknown>
}

/** The parts of `init({ appId, adminToken })` from `@instantdb/admin` this import uses (0.22 and 1.0 both have them). */
export interface AdminDatabase extends ScopedDatabase {
  auth: { getUser(params: { email: string }): Promise<unknown> }
  asUser(options: { email: string } | { guest: true }): ScopedDatabase
  tx: unknown
  storage: {
    uploadFile(path: string, file: Uint8Array, metadata?: { contentType?: string; fileSize?: number }): Promise<unknown>
    delete(path: string): Promise<unknown>
  }
}

/**
 * The database `init({ appId, adminToken })` from `@instantdb/admin` returns, 0.22 or 1.0. Its types differ between
 * versions, so the import takes any object and checks the parts it uses (adminDatabaseOf) before it reads or writes.
 */
export type InstantAdmin = object

/** The admin database as the import uses it, or an error naming what it lacks. */
export function adminDatabaseOf(database: InstantAdmin): AdminDatabase {
  const candidate = recordOf(database)
  const members: ReadonlyArray<readonly [string, unknown]> = [
    ['auth.getUser', recordOf(candidate['auth'])['getUser']],
    ['asUser', candidate['asUser']],
    ['query', candidate['query']],
    ['transact', candidate['transact']],
    ['storage.uploadFile', recordOf(candidate['storage'])['uploadFile']],
    ['storage.delete', recordOf(candidate['storage'])['delete']],
  ]
  const missing = [...members.filter(([, member]) => typeof member !== 'function').map(([name]) => name), ...(isRecord(candidate['tx']) ? [] : ['tx'])]
  if (missing.length > 0) throw new AudibleImportError(`the database is not an @instantdb/admin database: it has no ${missing.join(', ')}`)
  return database as AdminDatabase
}

const sleepFor = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Runs `work` with Instant's five-second bound, again after a 429, a 5xx, or a timeout, at most three times. */
async function bounded<A>(work: () => Promise<A>, label: string, sleep: (ms: number) => Promise<void>): Promise<A> {
  for (let attempt = 1; ; attempt += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new AudibleImportError(`Instant did not answer ${label} within ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS)
        }),
      ])
    } catch (error) {
      const status = recordOf(error)['status']
      const isRetryable = status === 429 || (typeof status === 'number' && status >= 500) || error instanceof AudibleImportError
      if (!isRetryable || attempt >= ATTEMPTS) throw error
      const retryAfter = Number(recordOf(recordOf(error)['hint'])['retry-after'] ?? 0)
      await sleep(1000 * (retryAfter > 0 ? retryAfter : attempt) + 250)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
}

/** The admin SDK's transaction builder for one row. Its `tx` is a proxy, so this is the one untyped edge. */
const stepOf = (database: AdminDatabase, namespace: LibraryNamespace, id: string): TransactionStep => {
  const step: unknown = recordOf(recordOf(database.tx)[namespace])[id]
  if (!isRecord(step) || typeof step['update'] !== 'function') throw new AudibleImportError(`the database has no ${namespace} table`)
  return step as unknown as TransactionStep
}

const rowsOf = (result: unknown, namespace: string): ReadonlyArray<Row> => listOf(recordOf(result)[namespace]).map(recordOf)

const linkedRows = (value: unknown): ReadonlyArray<Row> => (Array.isArray(value) ? value.map(recordOf) : isRecord(value) ? [value] : [])

const idsOfLink = (value: unknown): ReadonlyArray<string> =>
  linkedRows(value).flatMap((linked) => (typeof linked['id'] === 'string' ? [linked['id']] : []))

const scalarFields = (row: Row): Record<string, Scalar | null> => {
  const fields: Record<string, Scalar | null> = {}
  for (const [field, value] of Object.entries(row)) {
    if (field !== 'id' && (value === null || typeof value !== 'object')) fields[field] = scalarOf(value)
  }
  return fields
}

const existingRowOf = (row: Row, labels: ReadonlyArray<string>): ExistingRow => ({
  id: String(row['id']),
  fields: scalarFields(row),
  links: Object.fromEntries(labels.map((label) => [label, idsOfLink(row[label])])),
})

const chunked = <A>(values: ReadonlyArray<A>, size: number): ReadonlyArray<ReadonlyArray<A>> =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, index * size + size))

/**
 * The owner by email. `getUser` answers null when no user matches and throws on a real failure, which is retried and
 * then reported as itself: an outage never reads as "no such user".
 */
const ownerOf = async (database: AdminDatabase, email: string, sleep: (ms: number) => Promise<void>): Promise<Readonly<{ id: string; email: string }>> => {
  const user = await bounded(() => database.auth.getUser({ email }), 'the owner lookup', sleep)
  const id = recordOf(user)['id']
  if (typeof id !== 'string') throw new AudibleImportError('no user has that email: the import never creates one, so sign in to the app first')
  return { id, email }
}

/** Every row of one namespace the owner holds, a bounded page at a time. */
async function ownedRows(scoped: ScopedDatabase, namespace: string, ownerID: string, include: Row, sleep: (ms: number) => Promise<void>): Promise<ReadonlyArray<Row>> {
  const all: Array<Row> = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = { [namespace]: { $: { where: { ownerUserID: ownerID }, limit: PAGE_SIZE, offset, order: { serverCreatedAt: 'asc' } }, ...include } }
    const page = rowsOf(await bounded(() => scoped.query(query), `the ${namespace} page at ${offset}`, sleep), namespace)
    all.push(...page)
    if (page.length < PAGE_SIZE) return all
  }
}

/** Rows by id, in bounded chunks, with the links named in `include`. */
async function rowsByID(scoped: ScopedDatabase, namespace: string, ids: ReadonlyArray<string>, include: Row, sleep: (ms: number) => Promise<void>): Promise<ReadonlyArray<Row>> {
  const all: Array<Row> = []
  for (const chunk of chunked([...new Set(ids)], ID_CHUNK)) {
    const result = await bounded(() => scoped.query({ [namespace]: { $: { where: { id: { $in: chunk } } }, ...include } }), `${namespace} by id`, sleep)
    all.push(...rowsOf(result, namespace))
  }
  return all
}

const namedPeople = (rows: ReadonlyArray<Row>): ReadonlyArray<Readonly<{ id: string; name: string }>> =>
  rows.flatMap((row) => (typeof row['id'] === 'string' && typeof row['name'] === 'string' ? [{ id: row['id'], name: row['name'] }] : []))

/**
 * The owner's library as the plan needs it, read through the owner's own queries, each top level and bounded: books
 * with their people, items, cover, and renditions; authors, narrators, shelves, and items; and, for the books a title
 * could land on, their chapters.
 */
export async function readLibrarySnapshot(
  admin: InstantAdmin,
  owner: Readonly<{ id: string; email: string }>,
  library: unknown,
  sleep: (ms: number) => Promise<void> = sleepFor,
): Promise<LibrarySnapshot> {
  const scoped = adminDatabaseOf(admin).asUser({ email: owner.email })
  const reads = libraryItemsOf(library).flatMap((raw, position) => {
    const read = readAudibleItem(raw, position, 0)
    return isMalformed(read) ? [] : [read]
  })
  const bookRows = await ownedRows(scoped, 'libraryBooks', owner.id, { authors: {}, narrators: {}, items: {}, cover: { blob: {} }, renditions: {} }, sleep)
  const authors = namedPeople(await ownedRows(scoped, 'libraryAuthors', owner.id, {}, sleep))
  const narrators = namedPeople(await ownedRows(scoped, 'libraryNarrators', owner.id, {}, sleep))
  const shelves = await ownedRows(scoped, 'libraryShelves', owner.id, {}, sleep)
  const items = await ownedRows(scoped, 'libraryItems', owner.id, { book: {}, preferredAudio: {}, shelf: {} }, sleep)
  const titleIDs = reads.map((read) => audibleTitleIDs(owner.id, read.asin))
  const renditionRows = await rowsByID(scoped, 'libraryRenditions', titleIDs.map((ids) => ids.rendition), { book: {} }, sleep)
  const fileRows = await rowsByID(scoped, 'libraryFiles', titleIDs.map((ids) => ids.coverFile), { blob: {}, coverFor: {} }, sleep)

  // Chapters only for the books a title could land on: the importer's own, and those its ASINs or titles name.
  const libraryASINs = new Set(reads.map((read) => read.asin))
  const libraryTitles = new Set(reads.map((read) => normalizedText(read.title)))
  const importerBooks = new Set(titleIDs.map((ids) => ids.book))
  const candidateBooks = bookRows
    .filter(
      (row) =>
        importerBooks.has(String(row['id'])) ||
        libraryTitles.has(normalizedText(String(row['title'] ?? ''))) ||
        asinsIn(scalarOf(row['identifiersJSON'])).some((asin) => libraryASINs.has(asin)),
    )
    .map((row) => String(row['id']))
  const chapterRows: Array<Row> = []
  for (const chunk of chunked(candidateBooks, ID_CHUNK)) {
    const result = await bounded(() => scoped.query({ libraryChapters: { $: { where: { 'book.id': { $in: chunk } } }, book: {} } }), 'chapters by book', sleep)
    chapterRows.push(...rowsOf(result, 'libraryChapters'))
  }
  const chaptersByBook = new Map<string, number>()
  for (const chapter of chapterRows) for (const bookID of idsOfLink(chapter['book'])) chaptersByBook.set(bookID, (chaptersByBook.get(bookID) ?? 0) + 1)
  const itemsByID = new Map(items.map((row) => [String(row['id']), existingRowOf(row, ['book', 'preferredAudio', 'shelf'])]))
  const books = bookRows.map((row): ExistingBook => {
    const covers = linkedRows(row['cover'])
    return {
      id: String(row['id']),
      fields: scalarFields(row),
      authors: namedPeople(linkedRows(row['authors'])),
      narrators: namedPeople(linkedRows(row['narrators'])),
      items: idsOfLink(row['items']).flatMap((id) => {
        const item = itemsByID.get(id)
        return item === undefined ? [] : [item]
      }),
      coverIDs: idsOfLink(row['cover']),
      hasCoverBytes: covers.some((cover) => linkedRows(cover['blob']).length > 0),
      audioRenditionIDs: linkedRows(row['renditions']).flatMap((rendition) =>
        rendition['bodyKind'] === 'audio' && typeof rendition['id'] === 'string' ? [rendition['id']] : [],
      ),
      chapterCount: chaptersByBook.get(String(row['id'])) ?? 0,
    }
  })
  const keyed = (rows: ReadonlyArray<Row>, labels: ReadonlyArray<string>): Record<string, ExistingRow> =>
    Object.fromEntries(rows.map((row) => [String(row['id']), existingRowOf(row, labels)]))
  return {
    books,
    authors,
    narrators,
    shelves: shelves.flatMap((row) =>
      typeof row['id'] === 'string' && typeof row['name'] === 'string' ? [{ id: row['id'], name: row['name'], createdAtMs: Number(row['createdAtMs'] ?? 0) }] : [],
    ),
    rows: {
      libraryItems: Object.fromEntries(itemsByID),
      libraryRenditions: keyed(renditionRows, ['book']),
      libraryFiles: keyed(fileRows, ['blob', 'coverFor']),
      libraryChapters: keyed(chapterRows, ['book']),
    },
    itemCount: items.length,
  }
}

/**
 * The plan for importing `library` into the owner's library: every title's rows and its classification (create,
 * update, or skip, with a reason). It reads through the owner's own queries and writes nothing. `asins` limits it to
 * the titles Michael picked. `details` is the bridge's `details` output for them (detailsByASIN): with it, a title gets
 * its chapters, so the reader lists it, and its exact runtime.
 *
 * @example
 *   const library = { items: bridgeLibrary.items }
 *   const plan = await planAudibleImport({ library, ownerEmail, database: init({ appId, adminToken }), asins, details })
 *   plan.summary.wouldCreate // 41
 */
export async function planAudibleImport(
  input: Readonly<{
    library: unknown
    ownerEmail: string
    database: InstantAdmin
    asins?: ReadonlyArray<string>
    demoBookIDs?: ReadonlyArray<string>
    details?: unknown
    nowMs?: number
    sleep?: (ms: number) => Promise<void>
  }>,
): Promise<AudibleImportPlan> {
  libraryItemsOf(input.library)
  const database = adminDatabaseOf(input.database)
  const owner = await ownerOf(database, input.ownerEmail, input.sleep ?? sleepFor)
  const snapshot = await readLibrarySnapshot(database, owner, input.library, input.sleep ?? sleepFor)
  return planFromSnapshot({
    library: input.library,
    owner,
    snapshot,
    nowMs: input.nowMs ?? Date.now(),
    ...(input.asins === undefined ? {} : { asins: input.asins }),
    ...(input.demoBookIDs === undefined ? {} : { demoBookIDs: input.demoBookIDs }),
    ...(input.details === undefined ? {} : { details: input.details }),
  })
}

// MARK: - Covers

/** Where covers may come from: Audible's image hosts over HTTPS. A test may add a loopback host over HTTP. */
export type CoverPolicy = Readonly<{ hosts: ReadonlyArray<string>; allowLoopbackHTTP: boolean }>

/** Audible's image hosts, HTTPS only. */
export const DEFAULT_COVER_POLICY: CoverPolicy = { hosts: AUDIBLE_COVER_HOSTS, allowLoopbackHTTP: false }

/** Whether the policy lets the import fetch this URL. */
export function isCoverURLAllowed(url: string, policy: CoverPolicy = DEFAULT_COVER_POLICY): boolean {
  try {
    const parsed = new URL(url)
    if (!policy.hosts.includes(parsed.host)) return false
    if (parsed.protocol === 'https:') return true
    return policy.allowLoopbackHTTP && parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
  } catch {
    return false
  }
}

/** Whether bytes are a whole JPEG: they open on SOI (FF D8 FF), and an EOI (FF D9) sits at or near the end. */
export function isWholeJPEG(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return false
  for (let index = bytes.length - 2; index >= Math.max(0, bytes.length - 4096); index -= 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) return true
  }
  return false
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** The fetch the import uses for covers: the global one, or a test's. */
export type CoverFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>

/** A cover's bytes from the first URL that answers with a whole JPEG, or why none did. */
export async function downloadCover(
  urls: ReadonlyArray<string>,
  options: Readonly<{ fetch: CoverFetch; policy: CoverPolicy; sleep: (ms: number) => Promise<void>; pace: () => Promise<void> }>,
): Promise<Readonly<{ bytes: Uint8Array; url: string }> | Readonly<{ problem: string }>> {
  const problems: Array<string> = []
  for (const url of urls) {
    if (!isCoverURLAllowed(url, options.policy)) {
      problems.push(`${url} is not on an allowed cover host`)
      continue
    }
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      await options.pace()
      try {
        const response = await options.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
        if (response.status === 429 || response.status >= 500) {
          problems.push(`${url} answered ${response.status}`)
          await options.sleep(1000 * (Number(response.headers.get('retry-after')) || attempt))
          continue
        }
        if (!response.ok) {
          problems.push(`${url} answered ${response.status}`)
          break
        }
        const declared = Number(response.headers.get('content-length') ?? Number.NaN)
        if (declared > MAX_COVER_BYTES) {
          problems.push(`${url} is ${declared} bytes, over ${MAX_COVER_BYTES}`)
          break
        }
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (Number.isFinite(declared) && declared !== bytes.length) {
          problems.push(`${url} sent ${bytes.length} of ${declared} bytes`)
          continue
        }
        if (bytes.length > MAX_COVER_BYTES || !isWholeJPEG(bytes)) {
          problems.push(`${url} is not a whole JPEG of at most ${MAX_COVER_BYTES} bytes (${response.headers.get('content-type') ?? 'no content type'})`)
          break
        }
        return { bytes, url }
      } catch (error) {
        problems.push(`${url} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  return { problem: problems.join('; ') || 'no cover URL' }
}

// MARK: - Applying a plan

/** A link the importer added between two rows it did not create, for the title with this ASIN. */
export type JournalLink = LinkWrite & Readonly<{ asin: string }>

/** What the importer created and changed, so deleteAudibleImport can undo exactly that. Keep it with the import. */
export type AudibleImportJournal = Readonly<{
  kind: 'audibleImportJournal'
  formatVersion: 1
  ownerID: string
  created: Readonly<Partial<Record<LibraryNamespace, ReadonlyArray<string>>>>
  storagePaths: ReadonlyArray<string>
  changes: ReadonlyArray<FieldChange>
  linksAdded: ReadonlyArray<JournalLink>
}>

/** An empty journal for an owner. */
export const emptyJournal = (ownerID: string): AudibleImportJournal => ({
  kind: 'audibleImportJournal',
  formatVersion: 1,
  ownerID,
  created: {},
  storagePaths: [],
  changes: [],
  linksAdded: [],
})

const changeKey = (change: FieldChange): string => `${change.namespace}|${change.id}|${change.field}`
const linkKey = (link: LinkWrite): string => `${link.namespace}|${link.id}|${link.label}|${link.to}`

/** Two journals as one: every created id and path once, and each field's oldest value kept. */
export function mergeJournals(older: AudibleImportJournal, newer: AudibleImportJournal): AudibleImportJournal {
  if (older.ownerID !== newer.ownerID) throw new AudibleImportError('the two journals are for different owners')
  const created: Partial<Record<LibraryNamespace, ReadonlyArray<string>>> = {}
  for (const namespace of WRITE_ORDER) {
    const ids = [...new Set([...(older.created[namespace] ?? []), ...(newer.created[namespace] ?? [])])]
    if (ids.length > 0) created[namespace] = ids
  }
  const kept = new Set(older.changes.map(changeKey))
  const linked = new Set(older.linksAdded.map(linkKey))
  return {
    ...older,
    created,
    storagePaths: [...new Set([...older.storagePaths, ...newer.storagePaths])],
    changes: [...older.changes, ...newer.changes.filter((change) => !kept.has(changeKey(change)))],
    linksAdded: [...older.linksAdded, ...newer.linksAdded.filter((link) => !linked.has(linkKey(link)))],
  }
}

/** One title's result after applying. */
export type AppliedTitle = Readonly<{
  asin?: string
  title: string
  action: PlannedTitle['action']
  ok: boolean
  problems: ReadonlyArray<string>
  cover?: Readonly<{ url?: string; bytes?: number; sha256?: string; verified: boolean; problem?: string }>
}>

/** What applying a plan did, and the journal to keep. */
export type AppliedAudibleImport = Readonly<{
  ok: boolean
  writes: number
  titles: ReadonlyArray<AppliedTitle>
  guestReads: number
  journal: AudibleImportJournal
}>

type CoverResult = NonNullable<AppliedTitle['cover']>

const stepFor = (database: AdminDatabase, row: RowWrite): TransactionStep => {
  const step = stepOf(database, row.namespace, row.id).update(row.fields)
  return Object.keys(row.links).length === 0 ? step : step.link(row.links)
}

/**
 * Writes a plan as its owner, under the app's rules: people, then books, renditions, items, and chapters, then links,
 * then covers. A cover is fetched at most once every 400 ms, checked to be a whole JPEG, uploaded under
 * library/<owner>/files/<file id>/<name>, and linked in two writes; its download's SHA-256 is checked. Every title is
 * verified through the owner's query, and a guest must read none of them. Returns the journal to keep.
 */
export async function applyAudibleImport(
  plan: AudibleImportPlan,
  options: Readonly<{
    database: InstantAdmin
    fetch?: CoverFetch
    sleep?: (ms: number) => Promise<void>
    now?: () => number
    coverPolicy?: CoverPolicy
    onProgress?: (line: string) => void
  }>,
): Promise<AppliedAudibleImport> {
  const database = adminDatabaseOf(options.database)
  const sleep = options.sleep ?? sleepFor
  const now = options.now ?? Date.now
  const fetchCover: CoverFetch = options.fetch ?? ((url, init) => fetch(url, init))
  const progress = options.onProgress ?? (() => undefined)
  const owner = await ownerOf(database, plan.owner.email, sleep)
  if (owner.id !== plan.owner.id) throw new AudibleImportError('the plan is for another owner than the one this app knows by that email: plan again')
  const asOwner = database.asUser({ email: owner.email })

  // A field the plan changes on a row that is already there must still hold the value the plan read: that value is
  // what the journal restores.
  const stale = new Set<string>()
  for (const namespace of WRITE_ORDER) {
    const changes = plan.titles.flatMap((title) => title.changes).filter((change) => change.namespace === namespace)
    if (changes.length === 0) continue
    const rows = new Map((await rowsByID(asOwner, namespace, changes.map((change) => change.id), {}, sleep)).map((row) => [String(row['id']), row]))
    for (const change of changes) {
      const row = rows.get(change.id)
      if (row === undefined || !same(scalarOf(row[change.field]), change.before)) stale.add(change.id)
    }
  }
  const checked = plan.titles.map((title) => ({
    title,
    problems: title.changes.some((change) => stale.has(change.id)) ? ['a row it changes moved since the plan: plan again'] : [],
  }))
  const acting = checked.filter(({ title, problems }) => title.action !== 'skip' && problems.length === 0).map(({ title }) => title)

  let writes = 0
  const transact = async (steps: ReadonlyArray<TransactionStep>, label: string): Promise<void> => {
    for (const chunk of chunked(steps, WRITE_CHUNK)) {
      await bounded(() => asOwner.transact(chunk), label, sleep)
      writes += chunk.length
      await sleep(WRITE_PAUSE_MS)
    }
  }
  const linkedPeople = new Set(acting.flatMap((title) => title.links.map((link) => link.id)))
  const peopleRows = plan.people.filter((row) => linkedPeople.has(row.id))
  const rows = [...peopleRows, ...acting.flatMap((title) => title.rows)]
  for (const namespace of WRITE_ORDER) {
    const batch = rows.filter((row) => row.namespace === namespace)
    if (batch.length === 0) continue
    await transact(batch.map((row) => stepFor(database, row)), `${namespace} rows`)
    progress(`wrote ${batch.length} ${namespace} row${batch.length === 1 ? '' : 's'}`)
  }
  const links = acting.flatMap((title) => title.links.map((link): JournalLink => ({ ...link, asin: title.asin ?? '' })))
  if (links.length > 0) {
    await transact(links.map((link) => stepOf(database, link.namespace, link.id).link({ [link.label]: link.to })), 'links')
    progress(`wrote ${links.length} link${links.length === 1 ? '' : 's'}`)
  }

  // Covers, one at a time and paced.
  let lastRequestMs = 0
  const pace = async (): Promise<void> => {
    const wait = lastRequestMs + COVER_INTERVAL_MS - now()
    if (wait > 0) await sleep(wait)
    lastRequestMs = now()
  }
  const policy = options.coverPolicy ?? DEFAULT_COVER_POLICY
  const covers = new Map<string, CoverResult>()
  const uploadedPaths: Array<string> = []
  const createdFiles: Array<string> = []
  const storedFile = async (storagePath: string): Promise<Row | undefined> =>
    rowsOf(await bounded(() => database.query({ $files: { $: { where: { path: storagePath } } } }), 'a stored file', sleep), '$files')[0]
  for (const title of acting) {
    const cover = title.cover
    if (cover === undefined) continue
    const downloaded = await downloadCover(cover.urls, { fetch: fetchCover, policy, sleep, pace })
    if ('problem' in downloaded) {
      covers.set(cover.bookID, { verified: false, problem: downloaded.problem })
      progress(`no cover for ${title.title}: ${downloaded.problem}`)
      continue
    }
    let file = await storedFile(cover.storagePath)
    if (file === undefined) {
      await bounded(
        () => database.storage.uploadFile(cover.storagePath, downloaded.bytes, { contentType: 'image/jpeg', fileSize: downloaded.bytes.length }),
        `the upload of ${cover.name}`,
        sleep,
      )
      uploadedPaths.push(cover.storagePath)
      file = await storedFile(cover.storagePath)
    }
    const blobID = file?.['id']
    if (typeof blobID !== 'string') {
      covers.set(cover.bookID, { url: downloaded.url, verified: false, problem: `uploaded, but no $files row is at ${cover.storagePath}` })
      continue
    }
    const nowMs = now()
    const fileRow = {
      ownerUserID: plan.owner.id,
      formatVersion: 1,
      name: cover.name,
      path: cover.storagePath,
      size: downloaded.bytes.length,
      presenceKind: 'local',
      bodyKind: 'image',
      ...(cover.hasFileRow ? {} : { addedAtMs: nowMs }),
      updatedAtMs: nowMs,
    }
    // Two writes: a one-to-one link's forward rule cannot see a row created in the same write (ADR 0052 finding 11).
    await transact([stepOf(database, 'libraryFiles', cover.fileID).update(fileRow).link({ blob: blobID })], `the cover file of ${title.title}`)
    await transact([stepOf(database, 'libraryBooks', cover.bookID).link({ cover: cover.fileID })], `the cover link of ${title.title}`)
    if (!cover.hasFileRow) createdFiles.push(cover.fileID)
    covers.set(cover.bookID, { url: downloaded.url, bytes: downloaded.bytes.length, sha256: sha256(downloaded.bytes), verified: false })
    progress(`linked the cover of ${title.title} (${downloaded.bytes.length} bytes)`)
  }

  // Verify through the owner's query: each title's book has its item and chapters, and its cover's bytes match.
  const bookIDs = acting.flatMap((title) => (title.bookID === undefined ? [] : [title.bookID]))
  const seen = new Map(
    (await rowsByID(asOwner, 'libraryBooks', bookIDs, { items: {}, chapters: {}, cover: { blob: {} } }, sleep)).map((row) => [String(row['id']), row]),
  )
  const results: Array<AppliedTitle> = []
  for (const { title, problems } of checked) {
    const found = title.bookID === undefined ? undefined : seen.get(title.bookID)
    const titleProblems: Array<string> = [...problems]
    let cover = title.bookID === undefined ? undefined : covers.get(title.bookID)
    if (title.action !== 'skip' && problems.length === 0) {
      if (found === undefined) {
        titleProblems.push('its book is not readable by the owner')
      } else {
        if (idsOfLink(found['items']).length === 0) titleProblems.push('its book has no item, so the reader does not list it')
        const expectedChapters = title.rows.filter((row) => row.namespace === 'libraryChapters').length
        const foundChapters = idsOfLink(found['chapters']).length
        if (foundChapters < expectedChapters) titleProblems.push(`its book has ${foundChapters} of ${expectedChapters} chapters`)
        if (cover?.sha256 !== undefined) {
          const url = linkedRows(linkedRows(found['cover'])[0]?.['blob'])[0]?.['url']
          const response = typeof url === 'string' ? await fetchCover(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => undefined) : undefined
          const bytes = response?.ok === true ? new Uint8Array(await response.arrayBuffer()) : undefined
          cover = { ...cover, verified: bytes !== undefined && sha256(bytes) === cover.sha256 }
          if (!cover.verified) titleProblems.push('its cover download does not match the upload')
        } else if (cover?.problem !== undefined) {
          titleProblems.push(`no cover: ${cover.problem}`)
        }
      }
    }
    results.push({
      ...(title.asin === undefined ? {} : { asin: title.asin }),
      title: title.title,
      action: title.action,
      ok: titleProblems.length === 0,
      problems: titleProblems,
      ...(cover === undefined ? {} : { cover }),
    })
  }
  const guestReads = (await rowsByID(database.asUser({ guest: true }), 'libraryBooks', bookIDs, {}, sleep)).length

  // The journal: the rows this run created, and on rows it did not create, the old values and the links it added.
  const created: Partial<Record<LibraryNamespace, ReadonlyArray<string>>> = {}
  for (const namespace of WRITE_ORDER) {
    const ids = [...rows.filter((row) => row.isCreate && row.namespace === namespace).map((row) => row.id), ...(namespace === 'libraryFiles' ? createdFiles : [])]
    if (ids.length > 0) created[namespace] = [...new Set(ids)]
  }
  const matched = acting.filter((title) => title.match === 'asin' || title.match === 'titleAndAuthor')
  const journal: AudibleImportJournal = {
    ...emptyJournal(plan.owner.id),
    created,
    storagePaths: uploadedPaths,
    changes: matched.flatMap((title) => title.changes),
    linksAdded: matched.flatMap((title) => title.links.map((link): JournalLink => ({ ...link, asin: title.asin ?? '' }))),
  }
  return { ok: results.every((result) => result.ok) && guestReads === 0, writes, titles: results, guestReads, journal }
}

// MARK: - Rolling back

/** What a rollback did, and the journal of what is left. */
export type DeletedAudibleImport = Readonly<{
  ok: boolean
  deleted: Readonly<Partial<Record<LibraryNamespace, number>>>
  storageDeleted: number
  restored: number
  unlinked: number
  kept: ReadonlyArray<string>
  remaining: ReadonlyArray<string>
  journal: AudibleImportJournal
}>

/**
 * Rolls back what the importer added, by id: its books (their items, renditions, and chapters go with them), the items
 * and chapters it put on existing books, its cover files and their bytes, and the authors and narrators it made once no
 * book uses them. With the journal it also restores the old values of what it changed on existing rows, and removes the
 * links it added to them. A title whose item holds Michael's progress, notes, or bookmarks, or whose book has shares,
 * is kept unless `force` is set. Ids come from the journal and from the library, so either one is enough.
 */
export async function deleteAudibleImport(
  options: Readonly<{
    database: InstantAdmin
    ownerEmail: string
    journal?: AudibleImportJournal
    library?: unknown
    asins?: ReadonlyArray<string>
    force?: boolean
    sleep?: (ms: number) => Promise<void>
    onProgress?: (line: string) => void
  }>,
): Promise<DeletedAudibleImport> {
  const database = adminDatabaseOf(options.database)
  const sleep = options.sleep ?? sleepFor
  const progress = options.onProgress ?? (() => undefined)
  const owner = await ownerOf(database, options.ownerEmail, sleep)
  const journal = options.journal ?? emptyJournal(owner.id)
  if (journal.ownerID !== owner.id) throw new AudibleImportError('the journal is for another owner')
  const asOwner = database.asUser({ email: owner.email })
  const wanted = options.asins === undefined ? undefined : new Set(options.asins.map((asin) => asin.trim().toUpperCase()))
  const isWanted = (asin: string) => wanted === undefined || wanted.has(asin)
  const reads =
    options.library === undefined
      ? []
      : libraryItemsOf(options.library).flatMap((raw, position) => {
          const read = readAudibleItem(raw, position, 0)
          return isMalformed(read) || !isWanted(read.asin) ? [] : [read]
        })
  const fromLibrary = reads.map((read) => ({ read, ids: audibleTitleIDs(owner.id, read.asin) }))
  const inScope = new Set(fromLibrary.flatMap(({ read, ids }) => [ids.book, ids.item, ids.rendition, ids.coverFile, ...read.chapters.map((chapter) => ids.chapter(chapter.index))]))
  const journaled = (namespace: LibraryNamespace): ReadonlyArray<string> => (journal.created[namespace] ?? []).filter((id) => wanted === undefined || inScope.has(id))
  const people = (kind: 'author' | 'narrator', namespace: LibraryNamespace) => [
    ...new Set([...journaled(namespace).filter(() => wanted === undefined), ...reads.flatMap((read) => (kind === 'author' ? read.authors : read.narrators).map((name) => audiblePersonID(kind, owner.id, name)))]),
  ]
  const candidates = {
    books: [...new Set([...journaled('libraryBooks'), ...fromLibrary.map(({ ids }) => ids.book)])],
    items: [...new Set([...journaled('libraryItems'), ...fromLibrary.map(({ ids }) => ids.item)])],
    renditions: [...new Set([...journaled('libraryRenditions'), ...fromLibrary.map(({ ids }) => ids.rendition)])],
    files: [...new Set([...journaled('libraryFiles'), ...fromLibrary.map(({ ids }) => ids.coverFile)])],
    chapters: [...new Set([...journaled('libraryChapters'), ...(await importerChapterIDs(database, owner.id, reads.map((read) => read.asin), sleep))])],
    authors: people('author', 'libraryAuthors'),
    narrators: people('narrator', 'libraryNarrators'),
  }

  // Michael's own rows stop a title's rollback: deleting its book or item would delete them too. The admin query sees
  // every member's rows, not only the owner's.
  const items = await rowsByID(database, 'libraryItems', candidates.items, { book: {}, progress: {}, notes: {}, bookmarks: {} }, sleep)
  const books = await rowsByID(database, 'libraryBooks', candidates.books, { items: { progress: {}, notes: {}, bookmarks: {} }, shares: {} }, sleep)
  const holds = (row: Row, labels: ReadonlyArray<string>): boolean => labels.some((label) => idsOfLink(row[label]).length > 0)
  const kept: Array<string> = []
  const keptBooks = new Set<string>()
  const keptItems = new Set<string>()
  if (options.force !== true) {
    for (const item of items) {
      if (!holds(item, ['progress', 'notes', 'bookmarks'])) continue
      kept.push(`item ${String(item['id'])} holds progress, notes, or bookmarks`)
      keptItems.add(String(item['id']))
      for (const bookID of idsOfLink(item['book'])) if (candidates.books.includes(bookID)) keptBooks.add(bookID)
    }
    for (const book of books) {
      const bookID = String(book['id'])
      if (holds(book, ['shares']) || linkedRows(book['items']).some((item) => holds(item, ['progress', 'notes', 'bookmarks']))) {
        kept.push(`book ${bookID} has shares or an item with progress, notes, or bookmarks`)
        keptBooks.add(bookID)
      }
    }
  }
  const onKeptBook = (row: Row, label: string): boolean => idsOfLink(row[label]).some((bookID) => keptBooks.has(bookID))
  const bookIDs = books.map((book) => String(book['id'])).filter((id) => !keptBooks.has(id))
  const itemIDs = items.filter((item) => !keptItems.has(String(item['id'])) && !onKeptBook(item, 'book')).map((item) => String(item['id']))
  const renditionIDs = (await rowsByID(database, 'libraryRenditions', candidates.renditions, { book: {} }, sleep)).filter((row) => !onKeptBook(row, 'book')).map((row) => String(row['id']))
  const fileRows = (await rowsByID(database, 'libraryFiles', candidates.files, { coverFor: {} }, sleep)).filter((row) => !onKeptBook(row, 'coverFor'))
  const chapterIDs = (await rowsByID(database, 'libraryChapters', candidates.chapters, { book: {} }, sleep)).filter((row) => !onKeptBook(row, 'book')).map((row) => String(row['id']))

  const deleted: Partial<Record<LibraryNamespace, number>> = {}
  const remove = async (namespace: LibraryNamespace, ids: ReadonlyArray<string>): Promise<void> => {
    for (const chunk of chunked(ids, WRITE_CHUNK)) {
      await bounded(() => asOwner.transact(chunk.map((id) => stepOf(database, namespace, id).delete())), `deleting ${namespace}`, sleep)
      deleted[namespace] = (deleted[namespace] ?? 0) + chunk.length
      await sleep(WRITE_PAUSE_MS)
    }
  }
  const left = async (namespace: LibraryNamespace, ids: ReadonlyArray<string>): Promise<ReadonlyArray<string>> =>
    (await rowsByID(database, namespace, ids, {}, sleep)).map((row) => String(row['id']))

  // Restore the old values of what the import changed on existing rows, and remove the links it added to them.
  const changes = journal.changes.filter((change) => isWanted(change.asin))
  const linksAdded = journal.linksAdded.filter((link) => isWanted(link.asin))
  let restored = 0
  const byRow = new Map<string, Array<FieldChange>>()
  for (const change of changes) byRow.set(`${change.namespace}|${change.id}`, [...(byRow.get(`${change.namespace}|${change.id}`) ?? []), change])
  for (const rowChanges of byRow.values()) {
    const [first] = rowChanges
    if (first === undefined) continue
    const current = (await rowsByID(asOwner, first.namespace, [first.id], {}, sleep))[0]
    if (current === undefined) continue
    const fields: Record<string, Scalar | null> = Object.fromEntries(rowChanges.map((change) => [change.field, change.before]))
    if (UPDATED_AT.has(first.namespace)) fields['updatedAtMs'] = Math.max(Date.now(), Number(current['updatedAtMs'] ?? 0))
    await bounded(() => asOwner.transact([stepOf(database, first.namespace, first.id).update(fields)]), `restoring ${first.namespace} ${first.id}`, sleep)
    restored += rowChanges.length
    await sleep(WRITE_PAUSE_MS)
  }
  let unlinked = 0
  for (const chunk of chunked(linksAdded, WRITE_CHUNK)) {
    await bounded(() => asOwner.transact(chunk.map((link) => stepOf(database, link.namespace, link.id).unlink({ [link.label]: link.to }))), 'unlinking', sleep)
    unlinked += chunk.length
    await sleep(WRITE_PAUSE_MS)
  }

  // Cover files first (no cascade reaches them) and their bytes; then the books, which take their items, renditions,
  // and chapters; then whatever the import created on books it did not create.
  const fileIDs = fileRows.map((row) => String(row['id']))
  await remove('libraryFiles', fileIDs)
  let storageDeleted = 0
  const paths = [
    ...new Set([
      ...fileRows.flatMap((row) => (typeof row['path'] === 'string' ? [row['path']] : [])),
      ...journal.storagePaths.filter((storagePath) => fileIDs.some((id) => storagePath.includes(`/files/${id}/`))),
    ]),
  ]
  for (const storagePath of paths) {
    if ((await storedFiles(database, storagePath, sleep)) === 0) continue
    await bounded(() => database.storage.delete(storagePath), `deleting ${storagePath}`, sleep)
    storageDeleted += 1
  }
  await remove('libraryBooks', bookIDs)
  await remove('libraryItems', await left('libraryItems', itemIDs))
  await remove('libraryRenditions', await left('libraryRenditions', renditionIDs))
  await remove('libraryChapters', await left('libraryChapters', chapterIDs))
  const peopleKinds: ReadonlyArray<readonly [LibraryNamespace, ReadonlyArray<string>]> = [
    ['libraryAuthors', candidates.authors],
    ['libraryNarrators', candidates.narrators],
  ]
  const removedPeople = new Map<LibraryNamespace, ReadonlyArray<string>>()
  for (const [namespace, ids] of peopleKinds) {
    const rows = await rowsByID(database, namespace, ids, { books: {} }, sleep)
    const unused = rows.filter((row) => idsOfLink(row['books']).length === 0).map((row) => String(row['id']))
    for (const row of rows) if (idsOfLink(row['books']).length > 0) kept.push(`${namespace} ${String(row['id'])} is still used by a book`)
    await remove(namespace, unused)
    removedPeople.set(namespace, unused)
  }
  progress(`deleted ${Object.values(deleted).reduce((sum, count) => sum + (count ?? 0), 0)} rows and ${storageDeleted} stored covers`)

  // Verify: nothing it deleted is left, and each restored field holds its old value again.
  const remaining: Array<string> = []
  const removedKinds: ReadonlyArray<readonly [LibraryNamespace, ReadonlyArray<string>]> = [
    ['libraryBooks', bookIDs],
    ['libraryItems', itemIDs],
    ['libraryRenditions', renditionIDs],
    ['libraryChapters', chapterIDs],
    ['libraryFiles', fileIDs],
    ['libraryAuthors', removedPeople.get('libraryAuthors') ?? []],
    ['libraryNarrators', removedPeople.get('libraryNarrators') ?? []],
  ]
  for (const [namespace, ids] of removedKinds) for (const id of await left(namespace, ids)) remaining.push(`${namespace} ${id} is still there`)
  for (const rowChanges of byRow.values()) {
    const [first] = rowChanges
    if (first === undefined) continue
    const current = (await rowsByID(asOwner, first.namespace, [first.id], {}, sleep))[0]
    for (const change of rowChanges) {
      if (current !== undefined && !same(scalarOf(current[change.field]), change.before)) remaining.push(`${change.namespace} ${change.id}.${change.field} was not restored`)
    }
  }
  for (const storagePath of paths) if ((await storedFiles(database, storagePath, sleep)) > 0) remaining.push(`${storagePath} is still stored`)

  // The journal of what is left: everything outside the rollback's scope, and what it kept.
  const gone = new Set([...bookIDs, ...itemIDs, ...renditionIDs, ...chapterIDs, ...fileIDs, ...[...removedPeople.values()].flat()])
  const created: Partial<Record<LibraryNamespace, ReadonlyArray<string>>> = {}
  for (const namespace of WRITE_ORDER) {
    const ids = (journal.created[namespace] ?? []).filter((id) => !gone.has(id))
    if (ids.length > 0) created[namespace] = ids
  }
  const remainingJournal: AudibleImportJournal = {
    ...journal,
    created,
    storagePaths: journal.storagePaths.filter((storagePath) => !paths.includes(storagePath)),
    changes: journal.changes.filter((change) => !isWanted(change.asin)),
    linksAdded: journal.linksAdded.filter((link) => !isWanted(link.asin)),
  }
  return { ok: remaining.length === 0, deleted, storageDeleted, restored, unlinked, kept, remaining, journal: remainingJournal }
}

/**
 * The owner's chapters that the import made for these ASINs, found without a journal: each one's id is the importer's id
 * for its own stored index, `stableUUID("library-audible|chapter|<owner>|<ASIN>|<index>")`.
 */
async function importerChapterIDs(database: AdminDatabase, ownerID: string, asins: ReadonlyArray<string>, sleep: (ms: number) => Promise<void>): Promise<ReadonlyArray<string>> {
  if (asins.length === 0) return []
  const chapters = await ownedRows(database, 'libraryChapters', ownerID, {}, sleep)
  const indexes = [...new Set(chapters.flatMap((row) => (Number.isInteger(row['index']) && Number(row['index']) >= 0 ? [Number(row['index'])] : [])))]
  const ours = new Set(asins.flatMap((asin) => indexes.map((index) => audibleTitleIDs(ownerID, asin).chapter(index))))
  return chapters.map((row) => String(row['id'])).filter((id) => ours.has(id))
}

const storedFiles = async (database: AdminDatabase, storagePath: string, sleep: (ms: number) => Promise<void>): Promise<number> =>
  rowsOf(await bounded(() => database.query({ $files: { $: { where: { path: storagePath } } } }), 'a stored file', sleep), '$files').length
