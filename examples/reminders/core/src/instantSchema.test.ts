import { Array, Record } from 'effect'
import { describe, expect, it } from 'vitest'

import { rules } from './instantPerms.js'
import { schema } from './instantSchema.js'

type Attribute = Readonly<{
  valueType: string
  required: boolean
  indexed: boolean
  unique: boolean
}>

const attribute = (
  valueType: string,
  flags: ReadonlyArray<'optional' | 'indexed' | 'unique'>,
): Attribute => ({
  valueType,
  required: !Array.contains(flags, 'optional'),
  indexed: Array.contains(flags, 'indexed'),
  unique: Array.contains(flags, 'unique'),
})

const remindersV3Attributes: Readonly<
  Record<string, Readonly<Record<string, Attribute>>>
> = {
  $users: {
    email: attribute('string', ['optional', 'indexed', 'unique']),
    displayName: attribute('string', ['optional', 'indexed']),
    username: attribute('string', ['optional', 'indexed']),
    imageURL: attribute('string', ['optional']),
    type: attribute('string', ['optional']),
  },
  remindersLists: {
    title: attribute('string', ['indexed']),
    color: attribute('string', ['indexed']),
    coverFileID: attribute('string', ['optional', 'indexed']),
    position: attribute('number', ['indexed']),
    createdAt: attribute('date', ['indexed']),
  },
  reminders: {
    title: attribute('string', ['indexed']),
    notes: attribute('string', ['indexed']),
    isCompleted: attribute('boolean', ['indexed']),
    isFlagged: attribute('boolean', ['indexed']),
    dueDate: attribute('date', ['optional', 'indexed']),
    priority: attribute('number', ['optional', 'indexed']),
    position: attribute('number', ['indexed']),
    createdAt: attribute('date', ['indexed']),
  },
  tags: {
    title: attribute('string', ['indexed', 'unique']),
  },
  v3_share_memberships: {
    role: attribute('string', ['indexed']),
    acceptedAt: attribute('date', ['indexed']),
    revokedAt: attribute('date', ['optional', 'indexed']),
  },
  v3_shares: {
    token: attribute('string', ['indexed', 'unique']),
    rootNamespace: attribute('string', ['indexed']),
    rootID: attribute('string', ['indexed']),
    createdAt: attribute('date', ['indexed']),
    updatedAt: attribute('date', ['indexed']),
    revokedAt: attribute('date', ['optional', 'indexed']),
  },
}

const remindersV3Links = {
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
  remindersTags: {
    forward: { on: 'reminders', has: 'many', label: 'tags' },
    reverse: { on: 'tags', has: 'many', label: 'reminders' },
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
}

type DeclaredAttribute = Readonly<{
  valueType: string
  required: boolean
  config: Readonly<{ indexed: boolean; unique: boolean }>
}>

const entities: Readonly<
  Record<
    string,
    Readonly<{ attrs: Readonly<Record<string, DeclaredAttribute>> }>
  >
> = schema.entities

const attributesOf = (namespace: string) =>
  Record.map(entities[namespace]?.attrs ?? {}, attr => ({
    valueType: attr.valueType,
    required: attr.required,
    indexed: attr.config.indexed,
    unique: attr.config.unique,
  }))

describe('the Reminders schema', () => {
  it('has exactly Reminders V3’s attributes in each of its namespaces', () => {
    Array.forEach(Record.keys(remindersV3Attributes), namespace => {
      expect(attributesOf(namespace)).toEqual(remindersV3Attributes[namespace])
    })
  })

  it('has exactly Reminders V3’s nine links, each shaped as V3 declares it', () => {
    expect(schema.links).toEqual(remindersV3Links)
  })

  it('adds only Foldkit’s own log beside the V3 namespaces', () => {
    expect(Record.keys(schema.entities).sort()).toEqual(
      [...Record.keys(remindersV3Attributes), 'programMessage'].sort(),
    )
  })

  it('carries V3’s rules for its namespaces and keeps log rows their writer’s', () => {
    expect(rules.reminders.allow).toEqual({
      view: 'isOwner || isWriter || isReader',
      create: 'auth.id != null',
      update: 'isOwner || isWriter',
      delete: 'isOwner || isWriter',
    })
    expect(rules.remindersLists.allow.delete).toBe('isOwner')
    expect(rules.v3_shares.allow.view).toBe('isOwner || isMember')
    expect(rules.programMessage.allow.view).toBe(
      'auth.id != null && auth.id == data.ownerUserID',
    )
  })
})
