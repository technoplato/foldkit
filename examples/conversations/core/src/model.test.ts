/*
 * BreakdownEntry kinds are closed Body/Author tags, not S.String.
 *
 * Instant issue: https://issues.knophy.com/issues/202
 *
 * This suite proves:
 * - stringly bodyKind/authorKind values fail Schema decode
 * - adding a Body or Author variant fails this file at compile time
 * - breakdown still filters by the presentation names hosts display
 */
import { Array, Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  type Author,
  AuthorKind,
  AuthorKindAgent,
  AuthorKindHuman,
  AuthorKindSystem,
  type Body,
  BodyKind,
  BodyKindEdit,
  BodyKindText,
  BodyKindThought,
  BodyKindTool,
  BreakdownEntry,
  authorKind,
  authorKindName,
  bodyKind,
  bodyKindName,
  breakdown,
  cmuxConversation,
  debugConversation,
  filterBreakdown,
  messageBodyText,
} from './index.js'

/**
 * Adding a Body variant without a BodyKind constructor fails compilation here.
 */
const bodyKindCoversEveryBodyTag = {
  BodyText: BodyKindText,
  BodyThought: BodyKindThought,
  BodyTool: BodyKindTool,
  BodyEdit: BodyKindEdit,
} satisfies Record<Body['_tag'], () => BodyKind>

/**
 * Adding an Author variant without an AuthorKind constructor fails compilation here.
 */
const authorKindCoversEveryAuthorTag = {
  AuthorHuman: AuthorKindHuman,
  AuthorAgent: AuthorKindAgent,
  AuthorSystem: AuthorKindSystem,
} satisfies Record<Author['_tag'], () => AuthorKind>

describe('breakdown kinds', () => {
  test('rejects leftover stringly bodyKind and authorKind', () => {
    expect(() =>
      S.decodeUnknownSync(BreakdownEntry)({
        messageId: 'm-1',
        index: 0,
        bodyKind: 'text',
        authorKind: 'human',
        label: 'hello',
      }),
    ).toThrow()
  })

  test('constructs from closed BodyKind and AuthorKind', () => {
    const entry = BreakdownEntry.make({
      messageId: 'm-1',
      index: 0,
      bodyKind: BodyKindText(),
      authorKind: AuthorKindHuman(),
      label: 'hello',
    })
    expect(entry.bodyKind).toEqual(BodyKindText())
    expect(entry.authorKind).toEqual(AuthorKindHuman())
  })

  test('BodyKind constructors cover every Body tag', () => {
    expect(Object.keys(bodyKindCoversEveryBodyTag).sort()).toEqual(
      ['BodyEdit', 'BodyText', 'BodyThought', 'BodyTool'].sort(),
    )
    expect(Object.keys(authorKindCoversEveryAuthorTag).sort()).toEqual(
      ['AuthorAgent', 'AuthorHuman', 'AuthorSystem'].sort(),
    )
  })

  test('every fixture Body and Author maps onto the closed kinds', () => {
    const entries = [
      ...breakdown(cmuxConversation),
      ...breakdown(debugConversation),
    ]
    const bodyTags = new Set(entries.map(entry => entry.bodyKind._tag))
    const authorTags = new Set(entries.map(entry => entry.authorKind._tag))
    expect(bodyTags).toEqual(
      new Set([
        'BodyKindText',
        'BodyKindThought',
        'BodyKindTool',
        'BodyKindEdit',
      ]),
    )
    expect(authorTags).toEqual(
      new Set(['AuthorKindHuman', 'AuthorKindAgent', 'AuthorKindSystem']),
    )
    expect(
      Option.map(Array.get(debugConversation.messages, 2), row =>
        bodyKind(row.body),
      ),
    ).toEqual(Option.some(BodyKindEdit()))
    expect(
      Option.map(Array.get(cmuxConversation.messages, 3), row =>
        authorKind(row.author),
      ),
    ).toEqual(Option.some(AuthorKindSystem()))
  })

  test('presentation names stay exhaustive over the closed kinds', () => {
    expect(bodyKindName(BodyKindText())).toBe('text')
    expect(bodyKindName(BodyKindThought())).toBe('thought')
    expect(bodyKindName(BodyKindTool())).toBe('tool')
    expect(bodyKindName(BodyKindEdit())).toBe('edit')
    expect(authorKindName(AuthorKindHuman())).toBe('human')
    expect(authorKindName(AuthorKindAgent())).toBe('agent')
    expect(authorKindName(AuthorKindSystem())).toBe('system')
  })

  test('messageBodyText includes tool output so jump can show content', () => {
    const row = cmuxConversation.messages.find(
      message => message.id === 'm-cmux-3',
    )
    expect(row).toBeDefined()
    expect(messageBodyText(row!)).toContain('sandbox has no outbound network')
  })

  test('filter still matches presentation kind names', () => {
    const entries = breakdown(cmuxConversation)
    const thoughtRows = filterBreakdown(entries, 'thought')
    expect(
      Option.map(Array.head(thoughtRows), entry => entry.bodyKind),
    ).toEqual(Option.some(BodyKindThought()))
    expect(filterBreakdown(entries, 'human')).toHaveLength(2)
    expect(filterBreakdown(entries, 'system')).toHaveLength(1)
  })
})
