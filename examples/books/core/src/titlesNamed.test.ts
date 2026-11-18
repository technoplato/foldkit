import { describe, expect, it } from 'vitest'

import { titlesNamed } from './model.js'
import { sampleTitles } from './sample.js'

const slugsOf = (typed: string): ReadonlyArray<string> =>
  titlesNamed(sampleTitles, typed).map(title => title.slug)

// The titles are the made-up library's: nobody wrote them.
describe('the titles a person names by what they type', () => {
  it('finds a title by its whole name, in any case, and by its slug', () => {
    expect(slugsOf('The Lantern Keeper')).toEqual(['the-lantern-keeper'])
    expect(slugsOf('the lantern KEEPER')).toEqual(['the-lantern-keeper'])
    expect(slugsOf('small-hours')).toEqual(['small-hours'])
  })

  it('finds a title by part of its name, the words in any order', () => {
    expect(slugsOf('weather guide')).toEqual(['a-field-guide-to-weather'])
    expect(slugsOf('hours')).toEqual(['small-hours'])
  })

  it('finds every title that holds what was typed, in the library’s order', () => {
    expect(slugsOf('a')).toEqual([
      'the-lantern-keeper',
      'small-hours',
      'a-field-guide-to-weather',
    ])
  })

  it('finds none for a name nothing goes by, or for nothing typed', () => {
    expect(slugsOf('moby')).toEqual([])
    expect(slugsOf('')).toEqual([])
  })
})
