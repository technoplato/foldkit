import { describe, expect, it } from 'vitest'

import {
  GuessedNo,
  GuessedYes,
  ObservedOperator,
  OpenedReplicate,
  PostedOperator,
  RequestedHint,
  ResetTape,
  SucceededOperatorDispatch,
  SucceededOperatorUrls,
  SucceededOperatorVerify,
} from './message.js'
import { emptyModel } from './model.js'
import { update } from './update.js'

describe('update', () => {
  it('appends a yes guess and does not flatten the tape', () => {
    const start = emptyModel()
    const [guessed] = update(start, GuessedYes())
    expect(guessed.tape).toHaveLength(1)
    expect(guessed.tape[0]?._tag).toBe('GuessStep')
    if (guessed.tape[0]?._tag === 'GuessStep') {
      expect(guessed.tape[0].answer).toBe('y')
    }
  })

  it('walks the Operator phase ADT without a string list', () => {
    const start = emptyModel()
    const [posted, commands] = update(start, PostedOperator())
    expect(posted.prompt._tag).toBe('OperatorStep')
    if (posted.prompt._tag === 'OperatorStep') {
      expect(posted.prompt.phase._tag).toBe('OperatorPosted')
    }
    expect(commands).toHaveLength(1)

    const [opened] = update(posted, SucceededOperatorUrls())
    if (opened.prompt._tag === 'OperatorStep') {
      expect(opened.prompt.phase._tag).toBe('OperatorOpened')
    }

    const [observed] = update(opened, ObservedOperator())
    if (observed.prompt._tag === 'OperatorStep') {
      expect(observed.prompt.phase._tag).toBe('OperatorObserved')
    }

    const [verified] = update(observed, SucceededOperatorVerify())
    if (verified.prompt._tag === 'OperatorStep') {
      expect(verified.prompt.phase._tag).toBe('OperatorVerified')
    }

    const [dispatched] = update(verified, SucceededOperatorDispatch())
    expect(dispatched.prompt._tag).toBe('LabelStep')
    expect(dispatched.tape.at(-1)?._tag).toBe('OperatorStep')
    const last = dispatched.tape.at(-1)
    if (last?._tag === 'OperatorStep') {
      expect(last.phase._tag).toBe('OperatorDispatched')
    }
  })

  it('records a hint step', () => {
    const [hinted] = update(emptyModel(), RequestedHint())
    expect(hinted.tape[0]?._tag).toBe('HintStep')
  })

  it('rejects a no-op guess after Operator starts', () => {
    const [posted] = update(emptyModel(), PostedOperator())
    const [again] = update(posted, GuessedNo())
    expect(again).toBe(posted)
  })

  it('opens ReplicateStep for #replicate', () => {
    const [opened] = update(emptyModel(), OpenedReplicate())
    expect(opened.prompt._tag).toBe('ReplicateStep')
    if (opened.prompt._tag === 'ReplicateStep') {
      expect(opened.prompt.script).toBe(
        'https://puzzle.knophy.com/replicate.sh',
      )
      expect(opened.prompt.page).toBe('https://puzzle.knophy.com')
    }
  })

  it('resets to an empty tape', () => {
    const [guessed] = update(emptyModel(), GuessedYes())
    const [reset] = update(guessed, ResetTape())
    expect(reset.tape).toEqual([])
  })
})
