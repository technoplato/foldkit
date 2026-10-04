// Seeds the throwaway books dev app (bd40c50a) with the made-up sample
// library, owned by one development member. Never run it against production.
import { createHash } from 'node:crypto'

import { init } from '@instantdb/admin'

import { sampleTitles } from '../dist/sample.js'

const appId = process.env.INSTANT_APP_ID ?? ''
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN ?? ''
const email = process.env.BOOKS_DEV_EMAIL ?? 'loopback@knophy.com'
const chunkSize = 40

if (appId === '' || adminToken === '') {
  throw new Error('Run through scripts/with-books-dev-env.')
}

const uuidOf = name => {
  const hash = createHash('sha1').update(`books-dev/${name}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const database = init({ appId, adminToken })
await database.auth.createToken({ email })
const member = await database.auth.getUser({ email })
const nowMs = Date.now()
const owned = { ownerUserID: member.id, formatVersion: 1 }
const shelfId = uuidOf(`${member.id}/shelf/home`)

const steps = [
  database.tx.libraryShelves[shelfId].update({
    ...owned,
    name: 'Home',
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  }),
]

for (const title of sampleTitles) {
  const key = `${member.id}/${title.slug}`
  const bookId = uuidOf(`${key}/book`)
  const renditionId = uuidOf(`${key}/rendition/audio`)
  const itemId = uuidOf(`${key}/item`)
  steps.push(
    database.tx.libraryBooks[bookId].update({
      ...owned,
      title: title.name,
      identifiersJSON: '{}',
      bindingKind: 'Audiobook',
      publishedKind: 'Unknown',
      explicitKind: 'Clean',
      matchKind: 'None',
      language: 'en',
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    }),
    database.tx.libraryRenditions[renditionId]
      .update({
        ...owned,
        bodyKind: 'Audio',
        originKind: 'Seed',
        language: 'en',
        durationMs: title.durationMs,
        volumeKind: 'Single',
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
      })
      .link({ book: bookId }),
    database.tx.libraryItems[itemId]
      .update({
        ...owned,
        preferredKind: 'Audio',
        presenceKind: 'Present',
        addedAtMs: nowMs,
      })
      .link({ book: bookId, shelf: shelfId, preferredAudio: renditionId }),
  )
  for (const name of title.authors) {
    const authorId = uuidOf(`${member.id}/author/${name}`)
    steps.push(
      database.tx.libraryAuthors[authorId]
        .update({ ...owned, name, sortName: name })
        .link({ books: bookId }),
    )
  }
  for (const name of title.narrators) {
    const narratorId = uuidOf(`${member.id}/narrator/${name}`)
    steps.push(
      database.tx.libraryNarrators[narratorId]
        .update({ ...owned, name, sortName: name })
        .link({ books: bookId }),
    )
  }
  for (const chapter of title.chapters) {
    steps.push(
      database.tx.libraryChapters[
        uuidOf(`${key}/chapter/${chapter.chapterNumber}`)
      ]
        .update({
          ...owned,
          index: chapter.chapterNumber - 1,
          title: chapter.name,
          startMs: chapter.startMs,
          endMs: chapter.endMs,
          bindingKind: 'Chapter',
        })
        .link({ book: bookId }),
    )
  }
}

const coverPalette = ['#1e3a5f', '#5f1e3a', '#2f5f1e']

const coverSvgOf = (name, color) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="${color}"/><text x="150" y="225" font-family="Georgia, serif" font-size="28" fill="#f5f0e6" text-anchor="middle">${name}</text><text x="150" y="400" font-family="Georgia, serif" font-size="14" fill="#f5f0e6" opacity="0.7" text-anchor="middle">a made-up book</text></svg>`,
  )

for (const [position, title] of sampleTitles.entries()) {
  const key = `${member.id}/${title.slug}`
  const path = `library/${member.id}/covers/${title.slug}.svg`
  const bytes = coverSvgOf(title.name, coverPalette[position % coverPalette.length])
  const uploaded = await database.storage.uploadFile(path, bytes, {
    contentType: 'image/svg+xml',
  })
  const coverFileId = uuidOf(`${key}/file/cover`)
  steps.push(
    database.tx.libraryFiles[coverFileId]
      .update({
        ...owned,
        name: `${title.slug}.svg`,
        path,
        size: bytes.length,
        presenceKind: 'Present',
        bodyKind: 'Cover',
        addedAtMs: nowMs,
        updatedAtMs: nowMs,
      })
      .link({ blob: uploaded.data.id, coverFor: uuidOf(`${key}/book`) }),
  )
}

for (let start = 0; start < steps.length; start += chunkSize) {
  await database.transact(steps.slice(start, start + chunkSize))
}

const check = await database.query({
  libraryItems: {
    $: { where: { ownerUserID: member.id }, limit: 50 },
    book: { authors: {}, narrators: {}, chapters: {} },
    preferredAudio: {},
  },
})
console.log(
  `seeded ${check.libraryItems.length} titles for the dev member, ${steps.length} writes`,
)
console.log(
  'shape:',
  JSON.stringify(
    Object.fromEntries(
      Object.entries(check.libraryItems[0] ?? {}).map(([field, value]) => [
        field,
        Array.isArray(value) ? `array(${value.length})` : typeof value,
      ]),
    ),
  ),
)
