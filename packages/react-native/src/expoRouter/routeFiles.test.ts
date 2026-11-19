import { Array, Option } from 'effect'
import type { DeclaredAddress } from 'foldkit/navigation/route-table'
import { describe, expect, it } from 'vitest'

import {
  generatedMark,
  routeFilesOf,
  routeNameFor,
  staleRouteFilesOf,
  uriOfNamedRoute,
} from './routeFiles.js'

const literal = (segment: string) => ({ _tag: 'Literal' as const, segment })

const param = (name: string) => ({
  _tag: 'Param' as const,
  name,
  kind: 'Schema' as const,
})

const addresses: ReadonlyArray<DeclaredAddress> = [
  { names: ['Library'], presentation: 'Push', segments: [literal('books')] },
  {
    names: ['Library', 'Title'],
    presentation: 'Push',
    segments: [literal('books'), param('slug')],
  },
  {
    names: ['Library', 'Title', 'Player'],
    presentation: 'Push',
    segments: [
      literal('books'),
      param('slug'),
      literal('listen'),
      param('atMs'),
    ],
  },
]

const pathsOf = (files: ReturnType<typeof routeFilesOf>) =>
  Array.map(files, file => file.path)

describe('the route files a Program’s addresses ask for', () => {
  it('writes one file for each address, where a file router looks for it, and the two that catch the rest', () => {
    expect(pathsOf(routeFilesOf(addresses))).toEqual([
      '[...path].tsx',
      'index.tsx',
      'books/index.tsx',
      'books/[slug]/index.tsx',
      'books/[slug]/listen/[atMs]/index.tsx',
    ])
  })

  it('makes every file the generic screen, marked as generated', () => {
    for (const file of routeFilesOf(addresses)) {
      expect(file.contents).toContain(generatedMark)
      expect(file.contents).toContain('FoldkitRouterScreen as default')
    }
  })

  it('works with no addresses at all: the catch-all and the bare address', () => {
    expect(pathsOf(routeFilesOf([]))).toEqual(['[...path].tsx', 'index.tsx'])
  })
})

describe('whether the route files on disk are what the Program declares', () => {
  const expected = routeFilesOf(addresses)
  const onDisk = new Map(
    Array.map(expected, file => [file.path, file.contents]),
  )

  it('finds nothing stale when they match', () => {
    expect(staleRouteFilesOf(expected, onDisk)).toEqual([])
  })

  it('names a file that is missing, one that changed, and a generated one no address asks for', () => {
    const drifted = new Map(onDisk)
    drifted.delete('books/[slug]/index.tsx')
    drifted.set('books/index.tsx', `${generatedMark}\nexport default 1\n`)
    drifted.set('books/old/index.tsx', `${generatedMark}\n`)
    expect(staleRouteFilesOf(expected, drifted)).toEqual([
      { _tag: 'Changed', path: 'books/index.tsx' },
      { _tag: 'Missing', path: 'books/[slug]/index.tsx' },
      { _tag: 'Unasked', path: 'books/old/index.tsx' },
    ])
  })

  it('leaves alone a file a person wrote, such as the layout', () => {
    const withLayout = new Map(onDisk)
    withLayout.set('_layout.tsx', 'export default function Layout() {}\n')
    expect(staleRouteFilesOf(expected, withLayout)).toEqual([])
  })
})

describe('which route file shows an address', () => {
  const names = [
    'index',
    '[...path]',
    'books/index',
    'books/[slug]/index',
    'books/[slug]/listen/index',
    'books/[slug]/listen/[atMs]/index',
  ]

  it('is the file whose path the address fits, with its values as params', () => {
    expect(
      routeNameFor(['books', 'the-lantern-keeper', 'listen', '12s'], names),
    ).toEqual({
      name: 'books/[slug]/listen/[atMs]/index',
      params: { slug: 'the-lantern-keeper', atMs: '12s' },
    })
    expect(routeNameFor(['books'], names)).toEqual({
      name: 'books/index',
      params: {},
    })
  })

  it('prefers a file with the exact word over one with a value', () => {
    expect(
      routeNameFor(['books', 'profile'], [...names, 'books/profile/index']),
    ).toEqual({ name: 'books/profile/index', params: {} })
  })

  it('is the catch-all for an address no file fits, and the index for the bare address', () => {
    expect(routeNameFor(['books', 'a', 'b', 'c', 'd'], names)).toEqual({
      name: '[...path]',
      params: { path: ['books', 'a', 'b', 'c', 'd'] },
    })
    expect(routeNameFor([], names)).toEqual({ name: 'index', params: {} })
  })

  it('works with no generated files: every address goes through the catch-all', () => {
    expect(routeNameFor(['books', 'x'], ['index', '[...path]'])).toEqual({
      name: '[...path]',
      params: { path: ['books', 'x'] },
    })
  })

  it('reads a named route back as the address it shows', () => {
    expect(
      uriOfNamedRoute('books/[slug]/listen/[atMs]/index', {
        slug: 'the-lantern-keeper',
        atMs: '12s',
      }),
    ).toEqual(Option.some(['books', 'the-lantern-keeper', 'listen', '12s']))
    expect(uriOfNamedRoute('books/[slug]/index', {})).toEqual(Option.none())
    expect(uriOfNamedRoute('index', {})).toEqual(Option.some([]))
  })
})
