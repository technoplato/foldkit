// Prints the dev member's progress, bookmarks, and program log rows on the throwaway dev app.
import { init } from '@instantdb/admin'

const database = init({
  appId: process.env.INSTANT_APP_ID,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN,
})
const member = await database.auth.getUser({
  email: process.env.BOOKS_DEV_EMAIL ?? 'loopback@knophy.com',
})
const scoped = database.asUser({ email: member.email })
const data = await scoped.query({
  libraryProgress: { $: { limit: 20 }, item: {} },
  libraryBookmarks: { $: { limit: 20 }, item: {} },
  programMessage: { $: { where: { app: 'books' }, limit: 50 } },
})
console.log(
  'progress rows',
  data.libraryProgress
    .map(
      row =>
        `${row.relativeMs}ms ${row.finishedKind} owner=${row.ownerUserID === member.id} item=${row.item?.length ?? 0}`,
    )
    .join('; '),
)
console.log(
  'bookmarks',
  data.libraryBookmarks
    .map(row => `${row.relativeMs}ms owner=${row.ownerUserID === member.id}`)
    .join('; '),
)
console.log(
  'log rows',
  data.programMessage.length,
  'owned',
  data.programMessage.filter(row => row.ownerUserID === member.id).length,
  data.programMessage.map(row => row.tag).join(','),
)
