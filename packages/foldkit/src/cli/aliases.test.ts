import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import { canonicalCommandOf } from './program.js'

// Made-up titles: nobody wrote them.
type Model = Readonly<{ titles: ReadonlyArray<string> }>

const Play = Catalog.action('Play', {
  what: 'Plays from where it is paused',
  why: 'To hear it again',
  meta: { label: 'Play', keys: ['p'] },
})

const Listen = Catalog.action('Listen', {
  aliases: ['Play', 'PlayTitle'],
  fields: { slug: S.String },
  choose: {
    field: 'slug',
    noun: 'title',
    prompt: 'Which title?',
    token: S.String,
    choicesOf: (model: Model) =>
      model.titles.map(title => ({ value: title, title })),
    nothingToChoose: 'there are no titles',
  },
  what: 'Plays this book',
  why: 'To listen',
  meta: { label: 'Play', keys: [] },
})

const entries = Catalog.entries(Catalog.make([Play, Listen]), {
  titles: ['small-hours'],
})

describe('the other names an Action answers to', () => {
  it('are on its entry, for every Client that reads the catalog', () => {
    expect(entries.map(entry => [entry.tag, entry.aliases])).toEqual([
      ['Play', []],
      ['Listen', ['Play', 'PlayTitle']],
    ])
  })

  it('reach the Action by its own word, whatever it is given', () => {
    expect(canonicalCommandOf(entries, 'listen small hours')).toBe(
      'listen small hours',
    )
    expect(canonicalCommandOf(entries, 'play')).toBe('play')
  })

  it('reach the Action an alias names: play-title, and play with a title, are listen', () => {
    expect(canonicalCommandOf(entries, 'play-title small hours')).toBe(
      'listen small hours',
    )
    expect(canonicalCommandOf(entries, 'play small hours')).toBe(
      'listen small hours',
    )
    expect(canonicalCommandOf(entries, 'play-title')).toBe('listen')
  })

  it('leave a word nobody answers to as it is', () => {
    expect(canonicalCommandOf(entries, 'plya small hours')).toBe(
      'plya small hours',
    )
  })
})
