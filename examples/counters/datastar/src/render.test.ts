import {
  type Model,
  MultipleCountersProgram,
} from 'counters-core-example'
import * as InteractionGraph from 'foldkit/interaction-graph'
import { describe, expect, it } from 'vitest'

import { renderCarrier, renderRows, resolveToken, screenFragment } from './render.js'

const identity = { surface: 'Datastar (SSE server)', sourceUrl: '' }

/** Boots a model and applies one resolved token through the Program. */
const applyToken = (
  start: Model,
  token: string,
): Model => {
  const message = resolveToken(start, token, occurrenceId)
  expect(message).toBeDefined()
  const [next] = MultipleCountersProgram.update(start, message!)
  return next
}

const occurrenceId =
  InteractionGraph.InteractionOccurrenceId.make('datastar-test-1')

describe('datastar surface rendering', () => {
  it('renders the carrier line for the initial list state', () => {
    const [model] = MultipleCountersProgram.init()
    const fragment = screenFragment(model, identity)
    expect(fragment).toContain('FOLDKIT COUNTERS — Datastar (SSE server)')
    expect(fragment).toContain('Carrier: /counters')
  })

  it('renders both default counter rows', () => {
    const [model] = MultipleCountersProgram.init()
    expect(renderRows(model)).toContain('counter-1: 0')
    expect(renderRows(model)).toContain('counter-2: 0')
  })

  it('resolves increment tokens through the interaction graph', () => {
    let model = MultipleCountersProgram.init()[0]
    model = applyToken(model, 'open:counter-1')
    expect(renderCarrier(model)).toContain('/counters/counter-1')

    model = applyToken(model, 'increment:counter-1')
    expect(renderRows(model)).toContain('counter-1: 1')
  })
})
