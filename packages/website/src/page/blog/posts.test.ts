import { Array, Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { findPostBySlug, formatPostDate, posts } from './posts'

const rawSources = import.meta.glob<string>('./post/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

describe('post registry', () => {
  test('finds at least one post', () => {
    expect(Array.isReadonlyArrayNonEmpty(posts)).toBe(true)
  })

  test('slugs are unique', () => {
    const slugs = posts.map(post => post.slug)

    expect(new Set(slugs).size).toBe(slugs.length)
  })

  test('posts are ordered newest first', () => {
    const dates = posts.map(post => post.frontmatter.date)
    const newestFirst = [...dates].sort().reverse()

    expect(dates).toEqual(newestFirst)
  })

  test.each(posts.map(post => post.slug))(
    'findPostBySlug resolves %s',
    slug => {
      expect(Option.isSome(findPostBySlug(slug))).toBe(true)
    },
  )

  test('findPostBySlug misses an unknown slug', () => {
    expect(Option.isNone(findPostBySlug('not-a-post'))).toBe(true)
  })
})

// NOTE: a post's title renders from its frontmatter, so an `# h1` in the body
// would produce a second page title. The check reads the raw sources because
// the compiled modules no longer carry the frontmatter block to distinguish
// the two.
describe('post sources', () => {
  const sourceEntries = Object.entries(rawSources)

  test('finds at least one post source', () => {
    expect(Array.isReadonlyArrayNonEmpty(sourceEntries)).toBe(true)
  })

  test.each(sourceEntries)(
    '%s opens with a frontmatter block and has no h1 heading',
    (_path, source) => {
      expect(source.startsWith('---\n')).toBe(true)
      expect(source).not.toMatch(/^# /m)
    },
  )
})

describe('formatPostDate', () => {
  test('formats an ISO date for display', () => {
    expect(formatPostDate('2026-08-01')).toBe('August 1, 2026')
  })
})
