import { describe, expect, expectTypeOf, it } from 'vitest'

import * as Declaration from './declaration.js'
import * as Parameter from './parameter.js'
import { type Parsed, type Spelling, nearestOf, parse } from './parse.js'

const Follow = Declaration.make('Follow', {
  what: 'Prints a topic each time it changes',
  why: 'To read along somewhere else',
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
})

const Search = Declaration.make('Search', {
  what: 'Finds where words are spoken',
  why: 'To get back to a passage the user remembers a few words of',
  parameters: {
    words: Parameter.subject(
      Parameter.required(Parameter.text('The words to look for')),
    ),
  },
  examples: [
    { given: { words: 'lit at dusk' }, what: 'Where those words are spoken' },
  ],
})

const Devices = Declaration.make('Devices', {
  what: 'Lists the audio outputs',
  why: 'To pick the output a title plays on',
})

describe('parse', () => {
  it('hands a handler what it was given, typed, with defaults filled', () => {
    const parsed = parse(Follow, {})
    expectTypeOf(parsed).toEqualTypeOf<
      Parsed<
        Readonly<{
          topic: 'words' | 'screen'
          eachWord: boolean
          before?: number
        }>
      >
    >()
    expect(parsed).toEqual({
      _tag: 'Given',
      given: { topic: 'words', eachWord: false },
    })
  })

  it('reads the text a terminal or a form holds as the kind declared', () => {
    expect(
      parse(Follow, { topic: 'Screen', 'each-word': '1', before: '2' }),
    ).toEqual({
      _tag: 'Given',
      given: { topic: 'screen', eachWord: true, before: 2 },
    })
    expect(parse(Follow, { each_word: true, before: 2 })).toEqual({
      _tag: 'Given',
      given: { topic: 'words', eachWord: true, before: 2 },
    })
  })

  it('refuses a name the declaration does not have, with the nearest', () => {
    expect(parse(Follow, { eachWrd: true })).toEqual({
      _tag: 'Refused',
      sentence: 'Follow takes no eachWrd. Did you mean eachWord?',
    })
    expect(parse(Follow, { loud: true })).toEqual({
      _tag: 'Refused',
      sentence: 'Follow takes no loud. It takes topic, eachWord, before.',
    })
    expect(parse(Devices, { now: true })).toEqual({
      _tag: 'Refused',
      sentence: 'Devices takes no now. It takes nothing.',
    })
  })

  it('refuses a required parameter left out, with an example', () => {
    expect(parse(Search, {})).toEqual({
      _tag: 'Refused',
      parameter: 'words',
      sentence:
        'Search needs words: the words to look for. For example: {"words":"lit at dusk"}',
    })
  })

  it('refuses a value of the wrong kind, saying what it must be', () => {
    expect(parse(Follow, { before: 'two' })).toEqual({
      _tag: 'Refused',
      parameter: 'before',
      sentence: 'before must be a number; got "two".',
    })
    expect(parse(Follow, { eachWord: 'maybe' })).toEqual({
      _tag: 'Refused',
      parameter: 'eachWord',
      sentence: 'eachWord is on or off; got "maybe".',
    })
    expect(parse(Search, { words: true })).toEqual({
      _tag: 'Refused',
      parameter: 'words',
      sentence: 'words must be text; got true.',
    })
  })

  it('refuses a value outside its set, with the set', () => {
    expect(parse(Follow, { topic: 'pages' })).toEqual({
      _tag: 'Refused',
      parameter: 'topic',
      sentence: 'topic must be one of words, screen; got "pages".',
    })
  })

  it('stops at the first thing that is wrong', () => {
    expect(parse(Follow, { topic: 'pages', before: 'two' })).toMatchObject({
      parameter: 'topic',
    })
  })

  it('says the same sentences in the spelling a Client gives', () => {
    const terminal: Spelling = {
      name: 'books search',
      parameter: name => `<${name}>`,
      example: example => `books search "${String(example.given['words'])}"`,
    }
    expect(parse(Search, {}, terminal)).toEqual({
      _tag: 'Refused',
      parameter: 'words',
      sentence:
        'books search needs <words>: the words to look for. For example: books search "lit at dusk"',
    })
  })
})

describe('nearestOf', () => {
  it('finds the names a slip of the hand away, the nearest first', () => {
    expect(nearestOf('each-wrd', ['each-word', 'before', 'json'])).toEqual([
      'each-word',
    ])
    expect(nearestOf('next', ['previous', 'next-chapter', 'text'])).toEqual([
      'next-chapter',
      'text',
    ])
    expect(nearestOf('zzz', ['each-word', 'before'])).toEqual([])
  })
})
