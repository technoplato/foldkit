import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'

import * as Declaration from './declaration.js'
import * as Parameter from './parameter.js'

const Follow = Declaration.make('Follow', {
  what: 'Prints a topic each time it changes',
  why: 'To read along somewhere else, or to hand the words to another program as they are spoken',
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

const Search = Declaration.make('Search', {
  aliases: ['Find'],
  what: 'Finds where words are spoken',
  why: 'To get back to a passage the user remembers a few words of',
  parameters: {
    words: Parameter.subject(
      Parameter.required(Parameter.text('The words to look for')),
    ),
  },
})

const SignIn = Declaration.make('SignIn', {
  what: 'Signs in to the library',
  why: 'To open the library again after the sign-in ran out',
})

describe('Declaration.make', () => {
  it('holds one thing a person or a program can ask for, as plain data', () => {
    expect(Search).toEqual({
      _tag: 'Declaration',
      name: 'Search',
      aliases: ['Find'],
      what: 'Finds where words are spoken',
      why: 'To get back to a passage the user remembers a few words of',
      parameters: {
        words: {
          kind: { _tag: 'Text' },
          what: 'The words to look for',
          presence: 'Required',
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
        topic: 'words' | 'screen'
        eachWord: boolean
        before?: number
      }>
    >()
    expectTypeOf<Declaration.GivenOf<typeof Search>>().toEqualTypeOf<
      Readonly<{ words: string }>
    >()
  })

  it('refuses, in the types, an example that names what is not declared', () => {
    Declaration.make('Follow', {
      what: 'Prints a topic each time it changes',
      why: 'To read along somewhere else',
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
      Declaration.restates('Sets the count to 0', 'To set the count to 0'),
    ).toBe(true)
    expect(Declaration.restates('Plays this book', 'Plays the book.')).toBe(
      true,
    )
  })

  it('is false when the why says when or for what a person would ask', () => {
    expect(Declaration.restates('Sets the count to 0', 'To start over')).toBe(
      false,
    )
  })
})

describe('Declaration.problemsOf', () => {
  it('finds nothing wrong with a sound declaration', () => {
    expect(Declaration.problemsOf(Follow)).toEqual([])
    expect(Declaration.problemsOf(Search)).toEqual([])
    expect(Declaration.problemsOf(SignIn)).toEqual([])
  })

  it('says each thing a declaration gets wrong, in a sentence', () => {
    const unsound = Declaration.make('Seek', {
      aliases: ['Seek'],
      what: 'Goes to a place',
      why: 'To go to a place',
      parameters: {
        place: Parameter.subject(Parameter.place('Where to go')),
        title: Parameter.subject(Parameter.named('title', 'Which title')),
        quiet: { ...Parameter.toggle('Says nothing'), presence: 'Required' },
      },
    })
    expect(Declaration.problemsOf(unsound)).toEqual([
      'Seek: its why only repeats its what. Say when or for what it would be asked.',
      'Seek: the alias Seek is its own name.',
      'Seek: place and title are both its subject. A declaration is about one thing; the rest are given by name.',
      'Seek: quiet is on or off, and off unless it is given, so it is neither required nor optional.',
    ])
  })

  it('says when a why tells of someone instead of being the reason itself', () => {
    const told = Declaration.make('Back', {
      what: 'Returns to the screen beneath this one',
      why: 'The person is done with this screen',
    })
    expect(Declaration.problemsOf(told)).toEqual([
      'Back: its why is told about someone or something. Say the reason itself, as the user would give it, such as `To leave this screen`.',
    ])
    expect(
      Declaration.problemsOf(
        Declaration.make('Back', {
          what: 'Returns to the screen beneath this one',
          why: 'To leave this screen',
        }),
      ),
    ).toEqual([])
  })

  it('holds every why the library itself declares for something asked for to that voice', () => {
    const sourceRoot = join(import.meta.dirname, '..')
    const isChecked = (name: string): boolean =>
      name.endsWith('.ts') &&
      !name.includes('.test.') &&
      !name.includes('/test/')
    const declaresAsked = /\b(?:Catalog\.action|declare)\(/u
    const told = readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' })
      .filter(isChecked)
      .map(name => ({
        name,
        text: readFileSync(join(sourceRoot, name), 'utf8'),
      }))
      .filter(({ text }) => declaresAsked.test(text))
      .flatMap(({ name, text }) =>
        Array.from(
          text.matchAll(/^\s+why:\s*['"`]([^'"`]+)['"`]/gmu),
          match => `${name}: ${match[1] ?? ''}`,
        ),
      )
      .filter(line => !/: To\s/u.test(line))
    expect(told).toEqual([])
  })

  it('says when a what or a why speaks to the user instead of about them', () => {
    const spoken = Declaration.make('Play', {
      what: 'Plays a title from the last place you listened',
      why: 'To hear your book',
    })
    expect(Declaration.problemsOf(spoken)).toEqual([
      'Play: its what says "you". Name the user, in the third person.',
      'Play: its why says "your". Name the user, in the third person.',
    ])
  })

  it('says when an example gives what the declaration does not take', () => {
    const drifted: Declaration.Declaration = {
      ...Search,
      examples: [
        {
          given: { title: 'lamp', words: 'lamp' },
          what: 'Names a parameter that is gone',
        },
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
      Declaration.make('Open', {
        what: 'Presents the action menu',
        why: 'To see every Action offered now',
      }),
      Declaration.make('Type', {
        what: 'Filters the action menu',
        why: 'To find an Action by a few letters',
        parameters: {
          text: Parameter.subject(Parameter.text('The letters to filter by')),
        },
      }),
    ],
  })

  it('composes children under a parent, each addressed by its path', () => {
    expect(Declaration.pathsOf([Follow, Menu]).map(({ path }) => path)).toEqual(
      [['Follow'], ['Menu', 'Open'], ['Menu', 'Type']],
    )
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

  it('finds a declaration by a name however its words are joined', () => {
    const SeekTo = Declaration.make('SeekTo', {
      aliases: ['GoTo'],
      what: 'Moves to a place',
      why: 'To hear another part',
    })
    expect(
      ['seek-to', 'seek to', 'seek_to', 'SeekTo', 'go-to'].map(
        said => Declaration.findByPath([SeekTo], [said])?.declaration.name,
      ),
    ).toEqual(['SeekTo', 'SeekTo', 'SeekTo', 'SeekTo', 'SeekTo'])
  })

  it('lets a child share a name with one in another group', () => {
    const Session = Declaration.group('Session', {
      what: 'The session',
      children: [
        Declaration.make('Open', {
          what: 'Opens the session settings',
          why: 'To choose what is shared between devices',
        }),
      ],
    })
    expect(Declaration.collisionsOf([Menu, Session])).toEqual([])
  })

  it('says which names two declarations of one group both answer to', () => {
    const Find = Declaration.make('Find', {
      what: 'Finds a title',
      why: 'To pick a book by part of its name',
    })
    expect(Declaration.collisionsOf([Search, Find, Menu])).toEqual([
      'Find is answered by both Search and Find.',
    ])
  })
})

describe('the declaration module', () => {
  it('imports nothing at run time, so a slim view can read it', () => {
    const sourceOf = (file: string): string =>
      readFileSync(join(process.cwd(), 'src/declaration', file), 'utf8')
    const importPattern = /^import (?!type\b)[^;]*?from '([^']+)'/gmu
    const runtimeImports = [
      'declaration.ts',
      'parameter.ts',
      'parse.ts',
      'tool.ts',
      'plain.ts',
    ]
      .flatMap(file => [...sourceOf(file).matchAll(importPattern)])
      .map(([, specifier]) => specifier ?? '')
      .filter(specifier => !specifier.startsWith('./'))
    expect(runtimeImports).toEqual([])
  })
})
