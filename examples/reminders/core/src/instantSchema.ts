import { type InstantCoreDatabase, i } from '@instantdb/core'

// SCHEMA

/**
 * The Reminders V3 entities, as `instant-swift-data schema generate
 * --example reminders` prints them from `InstantSchemaExamples
 * .remindersV3Document`: lists, reminders, tags, and the list shares and
 * their members, on Instant's own `$users`. The Swift app and this one
 * read and write the same rows.
 */
export const remindersV3Entities = {
  $users: i.entity({
    displayName: i.string().optional().indexed(),
    email: i.string().optional().indexed().unique(),
    imageURL: i.string().optional(),
    type: i.string().optional(),
    username: i.string().optional().indexed(),
  }),
  reminders: i.entity({
    createdAt: i.date().indexed(),
    dueDate: i.date().optional().indexed(),
    isCompleted: i.boolean().indexed(),
    isFlagged: i.boolean().indexed(),
    notes: i.string().indexed(),
    position: i.number().indexed(),
    priority: i.number().optional().indexed(),
    title: i.string().indexed(),
  }),
  remindersLists: i.entity({
    color: i.string().indexed(),
    coverFileID: i.string().optional().indexed(),
    createdAt: i.date().indexed(),
    position: i.number().indexed(),
    title: i.string().indexed(),
  }),
  tags: i.entity({
    title: i.string().indexed().unique(),
  }),
  v3_share_memberships: i.entity({
    acceptedAt: i.date().indexed(),
    revokedAt: i.date().optional().indexed(),
    role: i.string().indexed(),
  }),
  v3_shares: i.entity({
    createdAt: i.date().indexed(),
    revokedAt: i.date().optional().indexed(),
    rootID: i.string().indexed(),
    rootNamespace: i.string().indexed(),
    token: i.string().indexed().unique(),
    updatedAt: i.date().indexed(),
  }),
}

/**
 * Foldkit's log of the Actions a person took, one row per Action, owned
 * by the person who took it: `AddReminder` with `{ title: 'Buy milk' }`.
 * Reminders V3 never reads it.
 */
export const programMessageEntity = i.entity({
  app: i.string().indexed(),
  programVersion: i.number(),
  tag: i.string(),
  payload: i.json<Readonly<Record<string, unknown>>>(),
  from: i.string().indexed(),
  createdAtMs: i.number().indexed(),
  ownerUserID: i.string().indexed(),
})

/**
 * The schema the Reminders example needs on its Instant app: Reminders
 * V3's entities and links, unchanged, and Foldkit's owner-scoped
 * `programMessage` log beside them.
 */
export const schema = i.schema({
  entities: { ...remindersV3Entities, programMessage: programMessageEntity },
  links: {
    remindersList: {
      forward: {
        on: 'reminders',
        has: 'one',
        label: 'list',
        required: true,
        onDelete: 'cascade',
      },
      reverse: { on: 'remindersLists', has: 'many', label: 'reminders' },
    },
    remindersListsOwner: {
      forward: {
        on: 'remindersLists',
        has: 'one',
        label: 'owner',
        required: true,
      },
      reverse: { on: '$users', has: 'many', label: 'ownedRemindersLists' },
    },
    remindersListsReaders: {
      forward: { on: 'remindersLists', has: 'many', label: 'readers' },
      reverse: { on: '$users', has: 'many', label: 'readableRemindersLists' },
    },
    remindersListsWriters: {
      forward: { on: 'remindersLists', has: 'many', label: 'writers' },
      reverse: { on: '$users', has: 'many', label: 'writableRemindersLists' },
    },
    remindersTags: {
      forward: { on: 'reminders', has: 'many', label: 'tags' },
      reverse: { on: 'tags', has: 'many', label: 'reminders' },
    },
    v3_share_membershipsShare: {
      forward: {
        on: 'v3_share_memberships',
        has: 'one',
        label: 'share',
        required: true,
        onDelete: 'cascade',
      },
      reverse: { on: 'v3_shares', has: 'many', label: 'memberships' },
    },
    v3_share_membershipsUser: {
      forward: {
        on: 'v3_share_memberships',
        has: 'one',
        label: 'user',
        required: true,
      },
      reverse: { on: '$users', has: 'many', label: 'shareMemberships' },
    },
    v3_sharesOwner: {
      forward: { on: 'v3_shares', has: 'one', label: 'owner', required: true },
      reverse: { on: '$users', has: 'many', label: 'ownedShares' },
    },
    v3_sharesRoot: {
      forward: { on: 'v3_shares', has: 'one', label: 'root', required: true },
      reverse: { on: 'remindersLists', has: 'one', label: 'share' },
    },
  },
})

/** An Instant core client opened on the Reminders schema. */
export type RemindersInstantDatabase = InstantCoreDatabase<typeof schema>
