import { Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { formatTailRow } from './tail.js'

const Increment = S.TaggedStruct('Increment', {})
const GotCounterMessage = S.TaggedStruct('GotCounterMessage', {
  counterId: S.Number,
  message: Increment,
})

const rowOf = (fields: Readonly<Record<string, unknown>>) => ({
  id: 'm1',
  from: 'react-ad55df2e',
  createdAtMs: 0,
  ...fields,
})

describe('formatTailRow', () => {
  it('names the app and instance and reads a nested Message as words', () => {
    const text = formatTailRow(
      GotCounterMessage,
      rowOf({
        _tag: 'GotCounterMessage',
        counterId: 2,
        message: { _tag: 'Increment' },
      }),
    )
      .map(line => line.trim())
      .join(' ')
    expect(text).toContain('React')
    expect(text).toContain('ad55df2e')
    expect(text).toContain('Got counter message counterId 2 message Increment')
  })

  it('shows the raw tag of a row the Program cannot read', () => {
    const [line] = formatTailRow(GotCounterMessage, rowOf({ tag: 'Square' }))
    expect(line).toContain('Square')
  })
})
