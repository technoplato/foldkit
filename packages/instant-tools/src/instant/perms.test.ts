import { Array, Option, Record, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { InstantToolsEntities } from './instant.js'
import { OwnerEmail, instantToolsOwnerRules } from './perms.js'

const ownerEmail = OwnerEmail.make('owner@example.com')

describe('instantToolsOwnerRules', () => {
  it('lets only a signed-in owner view, create, update, and delete every Instant Tools entity', () => {
    const rules = instantToolsOwnerRules([ownerEmail])

    Array.forEach(
      Array.filter(
        Record.keys(InstantToolsEntities),
        entity => entity !== 'instantToolsIssues',
      ),
      entity => {
      expect(rules[entity]).toEqual({
        allow: {
          view: 'isOwner',
          create: 'isOwner',
          update: 'isOwner',
          delete: 'isOwner',
        },
        bind: [
          'isOwner',
          "auth.id != null && auth.email in ['owner@example.com']",
        ],
      })
      },
    )
  })

  it('refuses an Issue write based on a stale read, and lets a writer that names no read through', () => {
    expect(instantToolsOwnerRules([ownerEmail]).instantToolsIssues).toEqual({
      allow: {
        view: 'isOwner',
        create: 'isOwner',
        update: 'isOwner && isCurrent',
        delete: 'isOwner',
      },
      bind: [
        'isOwner',
        "auth.id != null && auth.email in ['owner@example.com']",
        'isCurrent',
        'ruleParams.expectedUpdatedAtMs == null || data.updatedAtMs == ruleParams.expectedUpdatedAtMs',
      ],
    })
  })

  it('keeps Issue attachments in $files to the owners', () => {
    expect(instantToolsOwnerRules([ownerEmail]).$files).toEqual({
      allow: {
        view: 'isOwner',
        create: 'isOwner',
        delete: 'isOwner',
      },
      bind: [
        'isOwner',
        "auth.id != null && auth.email in ['owner@example.com']",
      ],
    })
  })

  it('lists every owner, lowercased, in one rule', () => {
    const rules = instantToolsOwnerRules([
      OwnerEmail.make('Owner@Example.com'),
      OwnerEmail.make('second@example.com'),
    ])

    expect(rules.instantToolsLogs?.bind).toEqual([
      'isOwner',
      "auth.id != null && auth.email in ['owner@example.com', 'second@example.com']",
    ])
  })

  it('refuses an owner email that could break out of the rule', () => {
    const decodeOwnerEmail = S.decodeUnknownOption(OwnerEmail)

    expect(decodeOwnerEmail("owner@example.com'] || true || ['")).toEqual(
      Option.none(),
    )
    expect(decodeOwnerEmail('not-an-email')).toEqual(Option.none())
    expect(decodeOwnerEmail('owner@example.com')).toEqual(
      Option.some('owner@example.com'),
    )
  })
})
