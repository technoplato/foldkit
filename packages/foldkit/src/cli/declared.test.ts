import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { group, make, pathsOf } from '../declaration/declaration.js'
import * as Parameter from '../declaration/parameter.js'
import {
  askedOf,
  commandOf,
  exampleOf,
  flagOf,
  givenFor,
  toggleFlagsOf,
  usageOf,
} from './declared.js'

const Follow = make('Follow', {
  what: 'Prints a topic each time it changes',
  why: 'To read along somewhere else, or to hand the words to another program',
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
    {
      given: { topic: 'words', eachWord: true, before: 2 },
      what: 'A word at a time, with two paragraphs before',
    },
  ],
})

const Listen = make('Listen', {
  aliases: ['Play'],
  what: 'Plays a title from the last place the user listened',
  why: 'To hear the book',
  parameters: {
    slug: Parameter.subject(
      Parameter.required(Parameter.named('title', 'Which title?')),
    ),
    device: Parameter.number('The audio output to play on, by its number'),
  },
})

const Search = make('Search', {
  what: 'Finds where words are spoken',
  why: 'To get back to a passage the user remembers a few words of',
  parameters: {
    words: Parameter.subject(
      Parameter.required(Parameter.text('The words to look for')),
    ),
    json: Parameter.toggle('Prints one line of JSON for another program'),
  },
  examples: [
    { given: { words: 'lit at dusk' }, what: 'Where those words are spoken' },
  ],
})

const AddBookmark = make('AddBookmark', {
  aliases: ['Bookmark'],
  what: 'Marks the word being spoken',
  why: 'To come back to it',
  parameters: {
    note: Parameter.subject(Parameter.text('A note to keep with it')),
  },
})

const Devices = make('Devices', {
  what: 'Lists the audio outputs, by number',
  why: 'To pick the output a title plays on',
})

const Menu = group('Menu', {
  what: 'The action menu',
  children: [
    make('Open', {
      what: 'Presents the action menu',
      why: 'To see every Action offered now',
    }),
    make('Type', {
      what: 'Filters the action menu',
      why: 'To find an Action by a few letters',
      parameters: {
        text: Parameter.subject(
          Parameter.required(Parameter.text('The letters to filter by')),
        ),
      },
    }),
  ],
})

const tree = [Follow, Listen, Search, AddBookmark, Devices, Menu]

describe('commandOf and flagOf', () => {
  it('spell a path and a parameter the way a terminal takes them', () => {
    expect(commandOf(['Listen'])).toBe('listen')
    expect(commandOf(['AddBookmark'])).toBe('add-bookmark')
    expect(commandOf(['Menu', 'Type'])).toBe('menu type')
    expect(flagOf('eachWord')).toBe('--each-word')
  })
})

describe('usageOf', () => {
  it('is read from the parameters, so it names only what is taken', () => {
    expect(usageOf(['Follow'], Follow)).toBe(
      'follow [words|screen] [--each-word] [--before <number>]',
    )
    expect(usageOf(['Listen'], Listen)).toBe(
      'listen <title> [--device <number>]',
    )
    expect(usageOf(['Search'], Search)).toBe('search <words> [--json]')
    expect(usageOf(['AddBookmark'], AddBookmark)).toBe('add-bookmark [note]')
    expect(usageOf(['Devices'], Devices)).toBe('devices')
    expect(
      pathsOf([Menu]).map(({ path, declaration }) =>
        usageOf(path, declaration),
      ),
    ).toEqual(['menu open', 'menu type <text>'])
  })
})

describe('exampleOf', () => {
  it('spells an example as the words to type', () => {
    expect(
      Follow.examples.map(example => exampleOf(['Follow'], Follow, example)),
    ).toEqual(['follow words --each-word --before 2'])
    expect(
      Search.examples.map(example => exampleOf(['Search'], Search, example)),
    ).toEqual(['search "lit at dusk"'])
  })
})

describe('toggleFlagsOf', () => {
  it('names every parameter that is on or off, for the argv reader', () => {
    expect(toggleFlagsOf(tree)).toEqual(['each-word', 'json'])
  })
})

describe('askedOf', () => {
  it('finds what was asked for and what it was given, by kind', () => {
    expect(
      askedOf(tree, ['follow', 'screen'], { 'each-word': '1', before: '2' }),
    ).toEqual({
      _tag: 'Asked',
      path: ['Follow'],
      declaration: Follow,
      given: { topic: 'screen', eachWord: true, before: 2 },
    })
  })

  it('fills what was left out from the defaults', () => {
    expect(askedOf(tree, ['follow'], {})).toMatchObject({
      _tag: 'Asked',
      given: { topic: 'words', eachWord: false },
    })
  })

  it('takes the words after a command as its subject', () => {
    expect(askedOf(tree, ['search', 'lit', 'at', 'dusk'], {})).toMatchObject({
      _tag: 'Asked',
      path: ['Search'],
      given: { words: 'lit at dusk', json: false },
    })
    expect(askedOf(tree, ['menu', 'type', 're'], {})).toMatchObject({
      _tag: 'Asked',
      path: ['Menu', 'Type'],
      given: { text: 're' },
    })
  })

  it('answers to an alias and to any case', () => {
    expect(askedOf(tree, ['bookmark', 'the', 'lamp'], {})).toMatchObject({
      _tag: 'Asked',
      path: ['AddBookmark'],
      given: { note: 'the lamp' },
    })
    expect(askedOf(tree, ['Devices'], {})).toMatchObject({
      _tag: 'Asked',
      path: ['Devices'],
      given: {},
    })
  })

  it('leaves what is not declared here for the Program to answer', () => {
    expect(askedOf(tree, ['pause'], {})).toEqual({ _tag: 'NotDeclared' })
    expect(askedOf(tree, [], {})).toEqual({ _tag: 'NotDeclared' })
  })

  it('refuses a flag the command does not take, with the nearest it does', () => {
    expect(
      askedOf(
        tree,
        ['follow', 'words'],
        { 'each-wrd': '1' },
        { name: 'books' },
      ),
    ).toEqual({
      _tag: 'Refused',
      path: ['Follow'],
      declaration: Follow,
      sentence:
        'books follow takes no --each-wrd. Did you mean --each-word? Usage: books follow [words|screen] [--each-word] [--before <number>]',
    })
  })

  it('refuses a value of the wrong kind in the sentence every Client says', () => {
    expect(
      askedOf(tree, ['follow'], { before: 'two' }, { name: 'books' }),
    ).toMatchObject({
      _tag: 'Refused',
      sentence:
        '--before must be a number; got "two". Usage: books follow [words|screen] [--each-word] [--before <number>]',
    })
    expect(askedOf(tree, ['follow', 'pages'], {})).toMatchObject({
      _tag: 'Refused',
      sentence:
        '<topic> must be one of words, screen; got "pages". Usage: follow [words|screen] [--each-word] [--before <number>]',
    })
  })

  it('lets flags every command takes pass', () => {
    expect(
      askedOf(
        tree,
        ['devices'],
        { color: '1' },
        { everywhere: { color: Parameter.toggle('Paints in color') } },
      ),
    ).toMatchObject({ _tag: 'Asked', path: ['Devices'], given: {} })
  })

  it('refuses words after a command that takes none', () => {
    expect(askedOf(tree, ['devices', 'now'], {})).toMatchObject({
      _tag: 'Refused',
      sentence: 'devices takes nothing after it, and got "now". Usage: devices',
    })
  })

  it('says a required subject is missing, with an example and the usage', () => {
    expect(askedOf(tree, ['search'], {}, { name: 'books' })).toMatchObject({
      _tag: 'Refused',
      sentence:
        'books search needs <words>: the words to look for. For example: books search "lit at dusk" Usage: books search <words> [--json]',
    })
  })
})

describe('givenFor', () => {
  it('hands a handler what its own declaration was given, typed', () => {
    const asked = askedOf(tree, ['follow'], { before: '3' })
    const follow = givenFor(asked, Follow)
    expectTypeOf(follow).toEqualTypeOf<
      | Readonly<{
          topic: 'words' | 'screen'
          eachWord: boolean
          before?: number
        }>
      | undefined
    >()
    expect(follow).toEqual({ topic: 'words', eachWord: false, before: 3 })
    expect(givenFor(asked, Search)).toBeUndefined()
  })
})

describe('the declared module', () => {
  it('imports nothing but the plain declaration, so a slim view can use it', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/cli/declared.ts'),
      'utf8',
    )
    const importPattern = /^import (?!type\b)[^;]*?from '([^']+)'/gmu
    expect(
      [...source.matchAll(importPattern)].map(([, specifier]) => specifier),
    ).toEqual(['../declaration/plain.js'])
  })
})
