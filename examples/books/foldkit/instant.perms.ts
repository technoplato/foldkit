import { notePermissionsBind } from '@foldkit/instant'
import type { InstantRules } from '@instantdb/core'

const isLoggedIn = 'auth.id != null'
const ownsAccount = 'auth.id in data.ref("account.user.id")'
const ownsSelf = 'auth.id in data.ref("user.id")'

const catalog = {
  allow: {
    view: isLoggedIn,
    create: 'false',
    update: 'false',
    delete: 'false',
  },
}

const owned = {
  allow: {
    view: ownsAccount,
    create: ownsAccount,
    update: ownsAccount,
    delete: ownsAccount,
  },
}

const rules = {
  attrs: {
    allow: {
      create: 'false',
    },
  },
  $files: {
    allow: {
      view: isLoggedIn,
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
  $users: {
    allow: {
      view: 'auth.id == data.id',
    },
  },
  accounts: {
    allow: {
      view: isLoggedIn,
      create: isLoggedIn,
      update: ownsSelf,
      delete: 'false',
    },
  },
  preferences: owned,
  shelves: catalog,
  folders: catalog,
  collections: catalog,
  collectionEntries: catalog,
  files: catalog,
  genres: catalog,
  series: catalog,
  authors: catalog,
  narrators: catalog,
  publishers: catalog,
  tags: catalog,
  books: catalog,
  volumes: catalog,
  chapters: catalog,
  renditions: catalog,
  segments: catalog,
  items: catalog,
  bookmarks: owned,
  ...notePermissionsBind(),
  progress: owned,
  shares: {
    allow: {
      view: ownsAccount,
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
} satisfies InstantRules

export default rules
