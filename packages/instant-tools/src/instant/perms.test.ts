import { Array, Option, Record, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { InstantToolsEntities } from './instant.js'
import { OwnerEmail, instantToolsOwnerRules } from './perms.js'

const ownerEmail = OwnerEmail.make('owner@example.com')

describe('instantToolsOwnerRules', () => {
  it('lets only a signed-in owner view, create, update, and delete every Instant Tools entity', () => {
    const rules = instantToolsOwnerRules([ownerEmail])

    Array.forEach(Record.keys(InstantToolsEntities), entity => {
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

    expect(rules.instantToolsIssues?.bind).toEqual([
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
