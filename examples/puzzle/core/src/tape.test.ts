import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { demoModel } from './model.js'
import { GuessStep, HintStep, LabelStep } from './step.js'
import {
  demoHashTape,
  modelFromHashTape,
  parseHashTape,
  printHashTape,
  printPuzzleUri,
} from './tape.js'

describe('hash tape', () => {
  it('round-trips the Knophy demo tape', () => {
    const steps = parseHashTape(demoHashTape)
    expect(printHashTape(steps)).toBe(demoHashTape)
    expect(steps).toEqual([
      GuessStep.make({
        label: 'codex',
        answer: 'n',
        hint: Option.none(),
      }),
      HintStep.make({
        label: 'behind',
        hint: { _tag: 'CategoryHint', category: 'sports' },
      }),
      HintStep.make({
        label: 'basketball',
        hint: { _tag: 'InitialHint', letter: 'F' },
      }),
      GuessStep.make({
        label: 'football',
        answer: 'y',
        hint: Option.none(),
      }),
      LabelStep.make({ label: 'mascot' }),
      GuessStep.make({
        label: 'Giants',
        answer: 'y',
        hint: Option.none(),
      }),
    ])
  })

  it('does not flatten Operator into the hash', () => {
    expect(printHashTape([])).toBe('')
    expect(printPuzzleUri([], LabelStep.make({ label: 'next' }))).toBe(
      '/puzzle#next',
    )
  })

  it('parses #replicate as ReplicateStep', () => {
    const steps = parseHashTape('#replicate')
    expect(steps).toHaveLength(1)
    expect(steps[0]?._tag).toBe('ReplicateStep')
    expect(printHashTape(steps)).toBe('#replicate')
    const model = modelFromHashTape('#replicate')
    expect(model.prompt._tag).toBe('ReplicateStep')
    if (model.prompt._tag === 'ReplicateStep') {
      expect(model.prompt.page).toBe('https://puzzle.knophy.com')
      expect(model.prompt.script).toBe('https://puzzle.knophy.com/replicate.sh')
    }
  })

  it('puts ReplicateStep on the demo Model prompt', () => {
    const model = demoModel()
    expect(model.prompt._tag).toBe('ReplicateStep')
    expect(
      printPuzzleUri(model.tape, model.prompt).endsWith('/replicate'),
    ).toBe(true)
  })
})
