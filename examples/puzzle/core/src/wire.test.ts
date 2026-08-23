import { Option, Schema as S } from 'effect'
import { Program } from 'foldkit'
import { describe, expect, it } from 'vitest'

import { defaultReplicateStep } from './replicate.js'
import { GuessStep, LabelStep } from './step.js'
import { TAPE_UUID, TapeProjection, TapeRow } from './wire.js'

describe('TapeProjection', () => {
  it('round-trips steps and ReplicateStep without a count field', () => {
    const steps = [
      GuessStep.make({
        label: 'codex',
        answer: 'n',
        hint: Option.none(),
      }),
    ]
    const prompt = defaultReplicateStep()
    const encoded = S.encodeSync(TapeProjection)({
      product: {
        tape: steps,
        prompt,
      },
      actionMenu: Program.Closed(),
    })
    expect(encoded).toMatchObject({
      id: TAPE_UUID,
      steps,
      prompt,
    })
    expect(encoded).not.toHaveProperty('value')
    expect(encoded).not.toHaveProperty('count')
    const decoded = S.decodeSync(TapeProjection)(encoded)
    expect(decoded.product.tape).toEqual(steps)
    expect(decoded.product.prompt._tag).toBe('ReplicateStep')
    if (decoded.product.prompt._tag === 'ReplicateStep') {
      expect(decoded.product.prompt.page).toBe('https://puzzle.knophy.com')
      expect(decoded.product.prompt.script).toBe(
        'https://puzzle.knophy.com/replicate.sh',
      )
    }
    expect(decoded.actionMenu._tag).toBe('Closed')
  })

  it('rejects a leftover count row', () => {
    const result = S.decodeUnknownResult(TapeRow)({
      id: 'c0a7c001-0000-4000-8000-000000000001',
      value: 0,
      asOf: '',
      at: 0,
    })
    expect(result._tag).toBe('Failure')
  })

  it('keeps an Operator prompt as an ADT, not a string', () => {
    const prompt = LabelStep.make({ label: 'next' })
    const encoded = S.encodeSync(TapeProjection)({
      product: {
        tape: [],
        prompt,
      },
      actionMenu: Program.Closed(),
    })
    const decoded = S.decodeSync(TapeProjection)(encoded)
    expect(decoded.product.prompt).toEqual(prompt)
  })
})
