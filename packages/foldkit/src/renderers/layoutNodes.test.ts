import { describe, expect, it } from 'vitest'

import { screenLook, screenStylesheet } from '../interaction/screenStyles.js'
import { ReadingMeasure, Split, Text, Toolbar } from './elements.js'
import { renderScreen } from './render.js'

const ruleOf = (selector: string): string => {
  const start = screenStylesheet.indexOf(`${selector} {`)
  return start < 0
    ? ''
    : screenStylesheet.slice(start, screenStylesheet.indexOf('}', start) + 1)
}

describe('layout that only organizes', () => {
  it('a toolbar has a start, a centre and an end, each a row of its own', () => {
    const toolbar = Toolbar({
      start: [Text('The Tide')],
      center: [Text('Play')],
      end: [Text('More')],
    })
    expect(toolbar._tag).toBe('Row')
    expect(toolbar.arrange).toBe('Toolbar')
    expect(toolbar.children.map(child => child._tag)).toEqual([
      'Row',
      'Row',
      'Row',
    ])
    expect(renderScreen(toolbar)).toContain('The Tide')
    expect(renderScreen(toolbar)).toContain('Play')
  })

  it('a toolbar keeps its three places even when one is empty', () => {
    expect(Toolbar({ center: [Text('Play')] }).children).toHaveLength(3)
  })

  it('a split sets a side beside the main part', () => {
    const split = Split(Text('Contents'), Text('The words'))
    expect(split._tag).toBe('Row')
    expect(split.arrange).toBe('Split')
    expect(split.children).toHaveLength(2)
  })

  it('a reading measure holds what is read at a readable width', () => {
    const measure = ReadingMeasure(Text('The words'))
    expect(measure._tag).toBe('Box')
    expect(measure.measure).toBe('Reading')
    expect(measure.padding).toBe(0)
  })

  it('carry no color, font or pixel of their own: the stylesheet arranges them', () => {
    expect(ruleOf(':where(.fk-row[data-arrange="Toolbar"])')).toContain(
      'grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)',
    )
    expect(ruleOf(':where(.fk-row[data-arrange="Split"])')).toContain(
      'grid-template-columns',
    )
    expect(ruleOf(':where(.fk-box[data-measure="Reading"])')).toContain(
      `width: min(100%, ${screenLook.readingWidth.toString()}px)`,
    )
  })

  it('leave every value of the stylesheet well formed', () => {
    const unbalanced = screenStylesheet
      .split('\n')
      .filter(
        line =>
          (line.match(/\(/g) ?? []).length !== (line.match(/\)/g) ?? []).length,
      )
    expect(unbalanced).toEqual([])
  })
})
