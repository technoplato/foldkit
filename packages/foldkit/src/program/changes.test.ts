import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { modelChangeLines } from './changes.js'

const Model = S.Struct({
  count: S.Number,
  session: S.Struct({ mode: S.Literals(['Mirror', 'Local']) }),
  maybeNote: S.Option(S.String),
  tags: S.Array(S.String),
})
type Model = typeof Model.Type

const base: Model = {
  count: 0,
  session: { mode: 'Mirror' },
  maybeNote: Option.none(),
  tags: [],
}

describe('modelChangeLines', () => {
  it('prints each changed leaf by its path, read from the Schema', () => {
    expect(
      modelChangeLines(Model, base, {
        ...base,
        count: 1,
        session: { mode: 'Local' },
      }),
    ).toEqual(['  count  0 → 1', '  session.mode  "Mirror" → "Local"'])
  })

  it('prints nothing when the Model did not move', () => {
    expect(modelChangeLines(Model, base, { ...base })).toEqual([])
  })

  it('marks a leaf only one side has with ·', () => {
    expect(modelChangeLines(Model, base, { ...base, tags: ['a'] })).toEqual([
      '  tags  [] → ·',
      '  tags[0]  · → "a"',
    ])
  })
})
