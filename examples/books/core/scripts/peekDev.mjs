// Prints the library query's result shape from the throwaway dev app, with ids shortened.
import { init } from '@instantdb/admin'
import { libraryQuery, decodeLibrary } from '../dist/instantLibrary.js'
const database = init({ appId: process.env.INSTANT_APP_ID, adminToken: process.env.INSTANT_APP_ADMIN_TOKEN })
const member = await database.auth.getUser({ email: process.env.BOOKS_DEV_EMAIL ?? 'loopback@knophy.com' })
const scoped = database.asUser({ email: member.email })
const data = await scoped.query(libraryQuery)
const first = data.libraryItems[0]
console.log('items', data.libraryItems.length, 'progress', data.libraryProgress.length, 'bookmarks', data.libraryBookmarks.length)
console.log(JSON.stringify(first, (key, value) => (key === 'id' || key === 'ownerUserID') && typeof value === 'string' ? value.slice(0, 4) : value).slice(0, 900))
const decoded = decodeLibrary(data)
console.log('decoded titles', decoded.shelf.titles.map(title => `${title.slug} ${title.chapters.length}ch ${title.durationMs}ms`).join(', '))
