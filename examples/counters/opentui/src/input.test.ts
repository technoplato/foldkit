import { describe, expect, it } from 'vitest'

import { normalizeInput } from './input.js'

describe('OpenTUI input normalization', () => {
  it('maps browse keys to local navigation and semantic intents', () => {
    expect(normalizeInput('j', 'Browse')).toStrictEqual({
      _tag: 'MoveNextSource',
    })
    expect(normalizeInput('k', 'Browse')).toStrictEqual({
      _tag: 'MovePreviousSource',
    })
    expect(normalizeInput('+', 'Browse')).toStrictEqual({
      _tag: 'Invoke',
      interactionId: 'IncrementCounter',
    })
    expect(normalizeInput('x', 'Browse')).toStrictEqual({
      _tag: 'Invoke',
      interactionId: 'DeleteCounter',
    })
  })

  it('keeps confirmation traversal and activation local', () => {
    expect(normalizeInput('left', 'Confirmation')).toStrictEqual({
      _tag: 'MovePreviousAction',
    })
    expect(normalizeInput('right', 'Confirmation')).toStrictEqual({
      _tag: 'MoveNextAction',
    })
    expect(normalizeInput('enter', 'Confirmation')).toStrictEqual({
      _tag: 'Activate',
    })
    expect(normalizeInput('escape', 'Confirmation')).toStrictEqual({
      _tag: 'Back',
    })
  })

  it('reserves replay, inspection, and quit as Client-only controls', () => {
    expect(normalizeInput('[', 'Browse')).toStrictEqual({
      _tag: 'ReplayPrevious',
    })
    expect(normalizeInput(']', 'Browse')).toStrictEqual({
      _tag: 'ReplayNext',
    })
    expect(normalizeInput('i', 'Browse')).toStrictEqual({ _tag: 'Inspect' })
    expect(normalizeInput('q', 'Browse')).toStrictEqual({ _tag: 'Quit' })
  })

  it('does not leak raw editing keys into navigation shortcuts', () => {
    expect(normalizeInput('q', 'Editing')).toStrictEqual({ _tag: 'Ignored' })
    expect(normalizeInput('d', 'Editing')).toStrictEqual({ _tag: 'Ignored' })
    expect(normalizeInput('escape', 'Editing')).toStrictEqual({ _tag: 'Back' })
  })
})
