import { Result, Schema as S } from 'effect'
import { describe, expect, expectTypeOf, it } from 'vitest'

import * as Declaration from './declaration.js'
import * as Parameter from './parameter.js'
import { decodeGiven, parametersOfFields, schemaOf } from './schema.js'

const Follow = Declaration.declare('Follow', {
  what: 'Prints a topic each time it changes',
  why: 'To read along somewhere else',
  touches: 'ReadsOnly',
  parameters: {
    topic: Parameter.subject(
      Parameter.oneOf(['words', 'screen'], 'What to follow'),
    ),
    eachWord: Parameter.toggle('Says each word as it is spoken'),
    before: Parameter.number('How many paragraphs to keep before'),
  },
})

const Search = Declaration.declare('Search', {
  what: 'Finds where words are spoken',
  why: 'To get back to a passage you remember a few words of',
  touches: 'ReadsOnly',
  parameters: {
    words: Parameter.subject(
      Parameter.required(Parameter.text('The words to look for')),
    ),
  },
})

describe('schemaOf', () => {
  it('is the Effect Schema of what a declaration is given', () => {
    const Given = schemaOf(Follow)
    expectTypeOf<typeof Given.Type>().toEqualTypeOf<
      Declaration.GivenOf<typeof Follow>
    >()
    expect(
      S.decodeUnknownSync(Given)({ topic: 'words', eachWord: true, before: 2 }),
    ).toEqual({ topic: 'words', eachWord: true, before: 2 })
    expect(S.decodeUnknownSync(Given)({})).toEqual({})
  })

  it('refuses what the parameters do not take', () => {
    const decode = S.decodeUnknownOption(schemaOf(Follow))
    expect(decode({ topic: 'pages' })._tag).toBe('None')
    expect(decode({ before: 'two' })._tag).toBe('None')
    expect(decode({ eachWord: 'yes' })._tag).toBe('None')
    expect(S.decodeUnknownOption(schemaOf(Search))({})._tag).toBe('None')
  })
})

describe('decodeGiven', () => {
  it('hands back what was given, typed', () => {
    expect(decodeGiven(Search, { words: 'lit at dusk' })).toEqual(
      Result.succeed({ words: 'lit at dusk' }),
    )
  })

  it('says, a sentence each, what was wrong with what was given', () => {
    expect(
      decodeGiven(Follow, { topic: 'pages', before: 'two', loud: true }),
    ).toEqual(
      Result.fail([
        'topic is one of words, screen, and "pages" is not one of them.',
        'before is a number, and "two" is not one.',
        'Follow takes no loud.',
      ]),
    )
    expect(decodeGiven(Search, {})).toEqual(
      Result.fail(['Search needs words: the words to look for.']),
    )
  })
})

describe('parametersOfFields', () => {
  it('reads parameters from Effect Schema fields, so nothing is said twice', () => {
    const Slug = S.String.pipe(S.brand('Slug'))
    expect(
      parametersOfFields({
        slug: Slug,
        count: S.Number,
        isLoud: S.Boolean,
        side: S.Literals(['Left', 'Right']),
        note: S.optionalKey(S.String),
      }),
    ).toEqual({
      slug: {
        kind: { _tag: 'Text' },
        what: 'Slug',
        isRequired: true,
        isSubject: false,
      },
      count: {
        kind: { _tag: 'Number' },
        what: 'Count',
        isRequired: true,
        isSubject: false,
      },
      isLoud: {
        kind: { _tag: 'Toggle' },
        what: 'Is loud',
        isRequired: false,
        isSubject: false,
      },
      side: {
        kind: { _tag: 'OneOf', options: ['Left', 'Right'] },
        what: 'Side',
        isRequired: true,
        isSubject: false,
      },
      note: {
        kind: { _tag: 'Text' },
        what: 'Note',
        isRequired: false,
        isSubject: false,
      },
    })
  })

  it('takes what a field is for from its Schema description', () => {
    expect(
      parametersOfFields({
        count: S.Number.annotate({ description: 'The number to count to' }),
      })['count']?.what,
    ).toBe('The number to count to')
  })

  it('marks a field no person can say as one only a program gives', () => {
    expect(
      parametersOfFields({ row: S.Struct({ id: S.Number }) })['row']?.kind,
    ).toEqual({ _tag: 'Structured' })
  })
})
