import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from './catalog.js'

// A shelf of made-up titles, chosen by slug.

type Shelf = Readonly<{
  titles: ReadonlyArray<Readonly<{ slug: string; name: string }>>
}>

const shelf: Shelf = {
  titles: [
    { slug: 'the-lantern-keeper', name: 'The Lantern Keeper' },
    { slug: 'the-lantern-road', name: 'The Lantern Road' },
    { slug: 'small-hours', name: 'Small Hours' },
  ],
}

const Listen = Catalog.action('Listen', {
  fields: { slug: S.String },
  choose: {
    field: 'slug',
    noun: 'title',
    prompt: 'Which title?',
    token: S.String,
    choicesOf: (model: Shelf) =>
      model.titles.map(title => ({ value: title.slug, title: title.name })),
    nothingToChoose: 'the library has no titles yet',
  },
  what: 'Plays this book from where it was last stopped',
  why: 'To hear this book',
  meta: { label: 'Play', keys: [] },
})

const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'To start over',
  meta: { label: 'Reset', keys: [] },
})

const entry = Catalog.entryOf(Listen, shelf)

describe('Catalog.choiceNamed', () => {
  it('finds the one choice a person names, by its title or part of it, in any case', () => {
    expect(Catalog.choiceNamed(entry, 'small hours')).toMatchObject({
      _tag: 'Named',
      tag: 'Listen:small-hours',
    })
    expect(Catalog.choiceNamed(entry, 'KEEPER')).toMatchObject({
      _tag: 'Named',
      tag: 'Listen:the-lantern-keeper',
    })
  })

  it('takes a choice by its own token', () => {
    expect(Catalog.choiceNamed(entry, 'the-lantern-road')).toMatchObject({
      _tag: 'Named',
      tag: 'Listen:the-lantern-road',
    })
  })

  it('says in one sentence when nothing is called that, with what is chosen', () => {
    expect(Catalog.choiceNamed(entry, 'moby')).toEqual({
      _tag: 'NotNamed',
      sentence: 'No title matches "moby".',
      matches: [],
    })
  })

  it('says how many it matches when a name is not enough, and which', () => {
    const several = Catalog.choiceNamed(entry, 'lantern')
    expect(several).toMatchObject({
      _tag: 'NotNamed',
      sentence: '"lantern" matches 2 titles.',
    })
    expect(
      several._tag === 'NotNamed'
        ? several.matches.map(choice => choice.title)
        : [],
    ).toEqual(['The Lantern Keeper', 'The Lantern Road'])
  })

  it('matches nothing for an Action that chooses nothing', () => {
    expect(Catalog.choiceNamed(Catalog.entryOf(Reset, shelf), 'now')).toEqual({
      _tag: 'NotNamed',
      sentence: 'No choice matches "now".',
      matches: [],
    })
  })
})
