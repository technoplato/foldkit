import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, expectTypeOf, it } from 'vitest'

import * as Declaration from './declaration.js'
import * as Parameter from './parameter.js'

const Follow = Declaration.declare('Follow', {
  what: 'Prints a topic each time it changes',
  why: 'To read along somewhere else, or to hand the words to another program as they are spoken',
  touches: 'ReadsOnly',
  parameters: {
    topic: Parameter.subject(
      Parameter.withDefault(
        Parameter.oneOf(['words', 'screen'], 'What to follow'),
        'words',
      ),
    ),
    eachWord: Parameter.toggle('Says each word as it is spoken'),
    before: Parameter.number('How many paragraphs to keep before'),
  },
  examples: [
    { given: { topic: 'words' }, what: 'The words as they are read' },
    {
      given: { topic: 'words', eachWord: true },
      what: 'The same, a word at a time',
    },
  ],
})

const Search = Declaration.declare('Search', {
  aliases: ['Find'],
  what: 'Finds where words are spoken',
  why: 'To get back to a passage you remember a few words of',
  touches: 'ReadsOnly',
  parameters: {
    words: Parameter.subject(
      Parameter.required(Parameter.text('The words to look for')),
    ),
  },
})

const SignIn = Declaration.declare('SignIn', {
  what: 'Signs in to the library',
  why: 'A command was refused because the sign-in ran out',
  touches: 'ReachesOutside',
})

describe('Declaration.declare', () => {
  it('holds one thing a person or a program can ask for, as plain data', () => {
    expect(Search).toEqual({
      _tag: 'Declaration',
      name: 'Search',
      aliases: ['Find'],
      what: 'Finds where words are spoken',
      why: 'To get back to a passage you remember a few words of',
      touches: 'ReadsOnly',
      parameters: {
        words: {
          kind: { _tag: 'Text' },
          what: 'The words to look for',
          isRequired: true,
          isSubject: true,
        },
      },
      examples: [],
    })
    expect(JSON.parse(JSON.stringify(Follow))).toEqual(Follow)
  })

  it('has no aliases, parameters, or examples unless they are declared', () => {
    expect(SignIn.aliases).toEqual([])
    expect(SignIn.parameters).toEqual({})
    expect(SignIn.examples).toEqual([])
  })

  it('gives what a handler is handed its type, from the parameters', () => {
    expectTypeOf<Declaration.GivenOf<typeof Follow>>().toEqualTypeOf<
      Readonly<{
        topic?: 'words' | 'screen'
        eachWord?: boolean
        before?: number
      }>
    >()
    expectTypeOf<Declaration.GivenOf<typeof Search>>().toEqualTypeOf<
      Readonly<{ words: string }>
    >()
  })

  it('refuses, in the types, an example that names what is not declared', () => {
    Declaration.declare('Follow', {
      what: 'Prints a topic each time it changes',
      why: 'To read along somewhere else',
      touches: 'ReadsOnly',
      parameters: { topic: Parameter.oneOf(['words', 'screen'], 'What') },
      examples: [
        // @ts-expect-error `title` is not a parameter of Follow
        { given: { title: 'words' }, what: 'Not a parameter' },
        // @ts-expect-error `pages` is not one of the topics
        { given: { topic: 'pages' }, what: 'Not a topic' },
      ],
    })
  })
})

describe('Declaration.wordsOf', () => {
  it('reads a name as the words every Client spells its own way', () => {
    expect(Declaration.wordsOf('Listen')).toEqual(['listen'])
    expect(Declaration.wordsOf('AddBookmark')).toEqual(['add', 'bookmark'])
    expect(Declaration.wordsOf('eachWord')).toEqual(['each', 'word'])
  })
})

describe('Declaration.restates', () => {
  it('is true when the why only says the what again', () => {
    expect(
      Declaration.restates(
        'Sets the count to 0',
        'To set the count to 0',
      ),
    ).toBe(true)
    expect(Declaration.restates('Plays this book', 'Plays the book.')).toBe(
      true,
    )
  })

  it('is false when the why says when or for what a person would ask', () => {
    expect(
      Declaration.restates(
        'Sets the count to 0',
        'The person wants to start over',
      ),
    ).toBe(false)
  })
})

describe('Declaration.problemsOf', () => {
  it('finds nothing wrong with a sound declaration', () => {
    expect(Declaration.problemsOf(Follow)).toEqual([])
    expect(Declaration.problemsOf(Search)).toEqual([])
    expect(Declaration.problemsOf(SignIn)).toEqual([])
  })

  it('says each thing a declaration gets wrong, in a sentence', () => {
    const unsound = Declaration.declare('Seek', {
      aliases: ['Seek'],
      what: 'Goes to a place',
      why: 'Go to a place',
      touches: 'ChangesData',
      parameters: {
        place: Parameter.subject(Parameter.place('Where to go')),
        title: Parameter.subject(Parameter.named('title', 'Which title')),
        quiet: Parameter.required(Parameter.toggle('Says nothing')),
      },
    })
    expect(Declaration.problemsOf(unsound)).toEqual([
      'Seek: its why only repeats its what. Say when or for what it would be asked.',
      'Seek: the alias Seek is its own name.',
      'Seek: place and title are both its subject. A declaration is about one thing; the rest are given by name.',
      'Seek: quiet is on or off, so it cannot be required.',
    ])
  })

  it('says when an example gives what the declaration does not take', () => {
    const drifted: Declaration.Declaration = {
      ...Search,
      examples: [
        { given: { title: 'lamp' }, what: 'Names a parameter that is gone' },
        { given: {}, what: 'Leaves out the words' },
      ],
    }
    expect(Declaration.problemsOf(drifted)).toEqual([
      'Search: an example gives title, which is not one of its parameters.',
      'Search: an example leaves out words, which is required.',
    ])
    const outside: Declaration.Declaration = {
      ...Follow,
      examples: [{ given: { topic: 'pages' }, what: 'Not a topic' }],
    }
    expect(Declaration.problemsOf(outside)).toEqual([
      'Follow: an example gives topic as pages, which is not one of words, screen.',
    ])
  })
})

describe('Declaration.group', () => {
  const Menu = Declaration.group('Menu', {
    what: 'The action menu',
    children: [
      Declaration.declare('Open', {
        what: 'Presents the action menu',
        why: 'To see every Action offered now',
        touches: 'ChangesData',
      }),
      Declaration.declare('Type', {
        what: 'Filters the action menu',
        why: 'To find an Action by a few letters',
        touches: 'ChangesData',
        parameters: {
          text: Parameter.subject(Parameter.text('The letters to filter by')),
        },
      }),
    ],
  })

  it('composes children under a parent, each addressed by its path', () => {
    expect(
      Declaration.pathsOf([Follow, Menu]).map(({ path }) => path),
    ).toEqual([['Follow'], ['Menu', 'Open'], ['Menu', 'Type']])
    expect(
      Declaration.pathsOf([Menu]).map(({ declaration }) => declaration.what),
    ).toEqual(['Presents the action menu', 'Filters the action menu'])
  })

  it('finds a declaration by any path it answers to', () => {
    expect(Declaration.findByPath([Search, Menu], ['Find'])).toEqual({
      path: ['Search'],
      declaration: Search,
    })
    expect(
      Declaration.findByPath([Search, Menu], ['Menu', 'Type'])?.declaration
        .what,
    ).toBe('Filters the action menu')
    expect(Declaration.findByPath([Search, Menu], ['Type'])).toBeUndefined()
  })

  it('lets a child share a name with one in another group', () => {
    const Session = Declaration.group('Session', {
      what: 'The session',
      children: [
        Declaration.declare('Open', {
          what: 'Opens the session settings',
          why: 'To choose what is shared between devices',
          touches: 'ChangesData',
        }),
      ],
    })
    expect(Declaration.collisionsOf([Menu, Session])).toEqual([])
  })

  it('says which names two declarations of one group both answer to', () => {
    const Find = Declaration.declare('Find', {
      what: 'Finds a title',
      why: 'To pick a book by part of its name',
      touches: 'ReadsOnly',
    })
    expect(Declaration.collisionsOf([Search, Find, Menu])).toEqual([
      'Find is answered by both Search and Find.',
    ])
  })
})

describe('the declaration module', () => {
  it('imports nothing at run time, so a slim view can read it', () => {
    const sourceOf = (file: string): string =>
      readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
    const importPattern = /^import (?!type\b)[^;]*?from '([^']+)'/gmu
    const runtimeImports = [
      'declaration.ts',
      'parameter.ts',
      'tool.ts',
      'plain.ts',
    ]
      .flatMap(file => [...sourceOf(`./${file}`).matchAll(importPattern)])
      .map(([, specifier]) => specifier ?? '')
      .filter(specifier => !specifier.startsWith('./'))
    expect(runtimeImports).toEqual([])
  })
})
