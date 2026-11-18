import { Effect, Schema as S } from 'effect'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { clientWordsOf, problemsOf } from './declaration.js'
import {
  type GivenOfDeclared,
  declare,
  named,
  parametersOfFields,
  parseDeclared,
  place,
} from './declare.js'
import { parse } from './parse.js'

const Count = S.Int.check(S.isGreaterThanOrEqualTo(0))

const Topic = S.Literals(['words', 'screen'])

const Watch = declare('Watch', {
  what: 'Shows a reading each time it changes',
  why: 'To see the words while listening',
  fields: {
    topic: Topic.annotate({ description: 'What to watch' }).pipe(
      S.withDecodingDefaultKey(Effect.succeed('words' as const)),
    ),
    eachWord: S.optionalKey(
      S.Boolean.annotate({ description: 'Moves on each word' }),
    ),
    before: S.optionalKey(
      Count.annotate({ description: 'How many paragraphs to keep before' }),
    ),
  },
  subject: 'topic',
  examples: [{ given: { topic: 'words' }, what: 'The words as they are read' }],
})

const SignIn = declare('SignIn', {
  what: 'Signs the user in to the library',
  why: 'A request was refused because the sign-in ran out',
  reaches: [{ entity: 'sign-in', access: 'Writes', isOutside: true }],
})

const Search = declare('Search', {
  what: 'Finds where words are spoken',
  why: 'To get back to a passage the user remembers a few words of',
  fields: {
    words: S.String.annotate({ description: 'The words to look for' }),
  },
  subject: 'words',
})

describe('declare', () => {
  it('derives the plain declaration from Effect Schema fields', () => {
    expect(Watch.declaration).toEqual({
      _tag: 'Declaration',
      name: 'Watch',
      aliases: [],
      what: 'Shows a reading each time it changes',
      why: 'To see the words while listening',
      touches: { state: [], reaches: [] },
      parameters: {
        topic: {
          kind: { _tag: 'OneOf', options: ['words', 'screen'] },
          what: 'What to watch',
          presence: 'Defaulted',
          isSubject: true,
          default: 'words',
        },
        eachWord: {
          kind: { _tag: 'Toggle' },
          what: 'Moves on each word',
          presence: 'Defaulted',
          isSubject: false,
          default: false,
        },
        before: {
          kind: { _tag: 'Number' },
          what: 'How many paragraphs to keep before',
          presence: 'Optional',
          isSubject: false,
        },
      },
      examples: [
        { given: { topic: 'words' }, what: 'The words as they are read' },
      ],
    })
    expect(JSON.parse(JSON.stringify(Watch.declaration))).toEqual(
      Watch.declaration,
    )
    expect(problemsOf(Watch.declaration)).toEqual([])
  })

  it('touches no state, and says what a host reaches instead', () => {
    expect(SignIn.declaration.touches).toEqual({
      state: [],
      reaches: [{ entity: 'sign-in', access: 'Writes', isOutside: true }],
    })
  })

  it('gives a handler its type from the same fields', () => {
    expectTypeOf<GivenOfDeclared<typeof Watch>>().toEqualTypeOf<{
      readonly topic: 'words' | 'screen'
      readonly eachWord?: boolean
      readonly before?: number
    }>()
  })

  it('refuses, in the types, a subject or an example that is not a field', () => {
    declare('Watch', {
      what: 'Shows a reading each time it changes',
      why: 'To see the words while listening',
      fields: { topic: Topic },
      // @ts-expect-error `title` is not a field
      subject: 'title',
      examples: [
        // @ts-expect-error `pages` is not one of the topics
        { given: { topic: 'pages' }, what: 'Not a topic' },
      ],
    })
  })
})

describe('parseDeclared', () => {
  it('hands back what was given, typed, from raw values', () => {
    const parsed = parseDeclared(Watch, { 'each-word': '1', before: '2' })
    expect(parsed).toEqual({
      _tag: 'Given',
      given: { topic: 'words', eachWord: true, before: 2 },
    })
    if (parsed._tag === 'Given') {
      expectTypeOf(parsed.given).toEqualTypeOf<GivenOfDeclared<typeof Watch>>()
    }
  })

  it('refuses with the sentences every Client says', () => {
    expect(parseDeclared(Watch, { before: 'two' })).toEqual({
      _tag: 'Refused',
      parameter: 'before',
      sentence: 'before must be a number; got "two".',
    })
    expect(parseDeclared(Search, {})).toEqual({
      _tag: 'Refused',
      parameter: 'words',
      sentence: 'Search needs words: the words to look for.',
    })
  })

  it('refuses what the fields own Schema does not take, the same way', () => {
    expect(parseDeclared(Watch, { before: '-1' })).toEqual({
      _tag: 'Refused',
      parameter: 'before',
      sentence: 'before must be a value greater than or equal to 0; got -1.',
    })
    expect(parseDeclared(Watch, { before: '1.5' })).toEqual({
      _tag: 'Refused',
      parameter: 'before',
      sentence: 'before must be an integer; got 1.5.',
    })
  })

  it('accepts only what the Schema decodes, so the two cannot drift', () => {
    const inputs: ReadonlyArray<Readonly<Record<string, unknown>>> = [
      {},
      { topic: 'screen' },
      { 'each-word': '1', before: '2' },
      { topic: 'Words', eachWord: true, before: 0 },
      { each_word: 'off' },
    ]
    inputs.forEach(input => {
      const parsed = parse(Watch.declaration, input)
      expect(parsed._tag).toBe('Given')
      if (parsed._tag === 'Given') {
        expect(
          S.decodeUnknownSync(S.toType(Watch.Given))(parsed.given),
        ).toEqual(parsed.given)
      }
    })
  })
})

describe('parametersOfFields', () => {
  it('reads each kind from the Schema, so nothing is said twice', () => {
    const Slug = S.String.pipe(S.brand('Slug'))
    expect(
      parametersOfFields(
        {
          slug: Slug.annotate({
            description: 'Which title?',
            ...named('title'),
          }),
          count: S.Number,
          isLoud: S.Boolean,
          side: S.Literals(['Left', 'Right']),
          note: S.optionalKey(S.String),
          from: S.optionalKey(
            S.String.annotate({ description: 'Where to play from', ...place }),
          ),
          row: S.Struct({ id: S.Number }),
        },
        'slug',
      ),
    ).toEqual({
      slug: {
        kind: { _tag: 'Named', noun: 'title' },
        what: 'Which title?',
        presence: 'Required',
        isSubject: true,
      },
      count: {
        kind: { _tag: 'Number' },
        what: 'Count',
        presence: 'Required',
        isSubject: false,
      },
      isLoud: {
        kind: { _tag: 'Toggle' },
        what: 'Is loud',
        presence: 'Defaulted',
        isSubject: false,
        default: false,
      },
      side: {
        kind: { _tag: 'OneOf', options: ['Left', 'Right'] },
        what: 'Side',
        presence: 'Required',
        isSubject: false,
      },
      note: {
        kind: { _tag: 'Text' },
        what: 'Note',
        presence: 'Optional',
        isSubject: false,
      },
      from: {
        kind: { _tag: 'Place' },
        what: 'Where to play from',
        presence: 'Optional',
        isSubject: false,
      },
      row: {
        kind: { _tag: 'Structured' },
        what: 'Row',
        presence: 'Required',
        isSubject: false,
      },
    })
  })
})

describe('clientWordsOf', () => {
  it('finds nothing in a declaration written for the person', () => {
    expect(clientWordsOf(Watch.declaration)).toEqual([])
    expect(clientWordsOf(Search.declaration)).toEqual([])
  })

  it('names a word of one Client in a what, a why, or a parameter', () => {
    const Follow = declare('Follow', {
      what: 'Prints a topic to the terminal each time it changes',
      why: 'To pipe the words to another program',
      fields: {
        json: S.optionalKey(
          S.Boolean.annotate({ description: 'Prints lines of JSON' }),
        ),
      },
    })
    expect(clientWordsOf(Follow.declaration)).toEqual([
      'Follow: its what says "terminal", a word of one Client. Say it for the person.',
      'Follow: its why says "pipe", a word of one Client. Say it for the person.',
      'Follow: its json says "JSON", a word of one Client. Say it for the person.',
    ])
  })
})
