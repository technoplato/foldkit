import type { InstantRules } from '@instantdb/core'

// PERMISSIONS

/**
 * The rules the Reminders example needs on its Instant app. The Reminders
 * V3 namespaces carry exactly the rules `instant-swift-data perms generate
 * --example reminders` prints from `InstantSchemaExamples
 * .remindersV3Permissions`: a list's owner, writers, and readers decide
 * who sees and changes it and its reminders and tags, and only an owner
 * shares it. `programMessage` rows are their writer's alone.
 */
export const rules = {
  $users: {
    allow: {
      view: 'auth.id != null',
      link: {
        ownedRemindersLists:
          "data.id == auth.id && actions.linkedData == 'create'",
        ownedShares: "data.id == auth.id && actions.linkedData == 'create'",
        readableRemindersLists: "auth.id in linkedData.ref('owner.id')",
        shareMemberships: "actions.linkedData == 'create'",
        writableRemindersLists: "auth.id in linkedData.ref('owner.id')",
      },
      unlink: {
        ownedRemindersLists: 'data.id == auth.id',
        ownedShares: 'data.id == auth.id',
        readableRemindersLists: "auth.id in linkedData.ref('owner.id')",
        shareMemberships: "auth.id in linkedData.ref('share.owner.id')",
        writableRemindersLists: "auth.id in linkedData.ref('owner.id')",
      },
    },
  },
  programMessage: {
    allow: {
      view: 'auth.id != null && auth.id == data.ownerUserID',
      create: 'auth.id != null && auth.id == data.ownerUserID',
      update: 'auth.id != null && auth.id == data.ownerUserID',
      delete: 'false',
    },
  },
  reminders: {
    allow: {
      view: 'isOwner || isWriter || isReader',
      create: 'auth.id != null',
      update: 'isOwner || isWriter',
      delete: 'isOwner || isWriter',
    },
    bind: [
      'isOwner',
      "auth.id in data.ref('list.owner.id')",
      'isWriter',
      "auth.id in data.ref('list.writers.id')",
      'isReader',
      "auth.id in data.ref('list.readers.id')",
    ],
  },
  remindersLists: {
    allow: {
      view: 'isOwner || isWriter || isReader',
      create: 'auth.id != null',
      update: 'isOwner || isWriter',
      delete: 'isOwner',
      link: {
        owner:
          "actions.data == 'create' || data.id in auth.ref('$user.ownedRemindersLists.id')",
        readers: "data.id in auth.ref('$user.ownedRemindersLists.id')",
        reminders:
          "data.id in auth.ref('$user.ownedRemindersLists.id') || data.id in auth.ref('$user.writableRemindersLists.id')",
        share: "data.id in auth.ref('$user.ownedRemindersLists.id')",
        writers: "data.id in auth.ref('$user.ownedRemindersLists.id')",
      },
      unlink: {
        owner: "data.id in auth.ref('$user.ownedRemindersLists.id')",
        readers: "data.id in auth.ref('$user.ownedRemindersLists.id')",
        reminders:
          "data.id in auth.ref('$user.ownedRemindersLists.id') || data.id in auth.ref('$user.writableRemindersLists.id')",
        share: "data.id in auth.ref('$user.ownedRemindersLists.id')",
        writers: "data.id in auth.ref('$user.ownedRemindersLists.id')",
      },
    },
    bind: [
      'isOwner',
      "auth.id in data.ref('owner.id')",
      'isWriter',
      "auth.id in data.ref('writers.id')",
      'isReader',
      "auth.id in data.ref('readers.id')",
    ],
  },
  tags: {
    allow: {
      view: 'isOwner || isWriter || isReader',
      create: 'auth.id != null',
      update: 'isOwner || isWriter',
      delete: 'isOwner',
      link: {
        reminders:
          "actions.data == 'create' || actions.linkedData == 'create' || auth.id in linkedData.ref('list.owner.id') || auth.id in linkedData.ref('list.writers.id')",
      },
      unlink: {
        reminders:
          "auth.id in linkedData.ref('list.owner.id') || auth.id in linkedData.ref('list.writers.id')",
      },
    },
    bind: [
      'isOwner',
      "auth.id in data.ref('reminders.list.owner.id')",
      'isWriter',
      "auth.id in data.ref('reminders.list.writers.id')",
      'isReader',
      "auth.id in data.ref('reminders.list.readers.id')",
    ],
  },
  v3_share_memberships: {
    allow: {
      view: 'isSelf || isShareOwner',
      create: 'auth.id != null',
      update: 'isShareOwner',
      delete: 'isShareOwner',
      link: {
        share:
          "actions.data == 'create' || auth.id in data.ref('share.owner.id')",
        user: "actions.data == 'create' || auth.id in data.ref('share.owner.id')",
      },
      unlink: {
        share: "auth.id in data.ref('share.owner.id')",
        user: "auth.id in data.ref('share.owner.id')",
      },
    },
    bind: [
      'isSelf',
      "auth.id in data.ref('user.id')",
      'isShareOwner',
      "auth.id in data.ref('share.owner.id')",
    ],
  },
  v3_shares: {
    allow: {
      view: 'isOwner || isMember',
      create: 'auth.id != null',
      update: 'isOwner',
      delete: 'isOwner',
      link: {
        memberships:
          "actions.data == 'create' || data.id in auth.ref('$user.ownedShares.id')",
        owner: "actions.data == 'create' || auth.id in data.ref('owner.id')",
        root: "actions.data == 'create' || auth.id in data.ref('owner.id')",
      },
      unlink: {
        memberships: "auth.id in data.ref('owner.id')",
        owner: "auth.id in data.ref('owner.id')",
        root: "auth.id in data.ref('owner.id')",
      },
    },
    bind: [
      'isOwner',
      "auth.id in data.ref('owner.id')",
      'isMember',
      "auth.id in data.ref('memberships.user.id')",
    ],
  },
} satisfies InstantRules
