import { Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  EditingExpression,
  FailedCalculation,
  NumberToken,
  OperationToken,
  PressedBackspace,
  PressedClear,
  PressedDecimalSeparator,
  PressedDigit,
  PressedEquals,
  PressedOperation,
  PressedPercent,
  PressedSign,
  displayForModel,
  expressionForModel,
  init,
  initialDisplay,
  initialModel,
  update,
} from './index.js'

describe('Calculator update', () => {
  test('init uses the canonical initial display and produces no Commands', () => {
    const [model, commands] = init()

    expect(model).toEqual(initialModel)
    expect(displayForModel(model)).toBe(initialDisplay)
    expect(expressionForModel(model)).toBe('')
    expect(commands).toEqual([])
  })

  test('PressedDigit enters a number', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(PressedDigit({ digit: 'One' })),
      Story.Command.expectNone(),
      Story.message(PressedDigit({ digit: 'Two' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model).toEqual(
          EditingExpression({
            expression: [],
            maybeCurrentInput: Option.some('12'),
            maybeLastResult: Option.none(),
          }),
        )
        expect(displayForModel(model)).toBe('12')
      }),
    )
  })

  test('PressedOperation records an expression without evaluating it', () => {
    Story.story(
      update,
      Story.with(
        EditingExpression({
          expression: [],
          maybeCurrentInput: Option.some('12'),
          maybeLastResult: Option.none(),
        }),
      ),
      Story.message(PressedOperation({ operation: 'Add' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model).toEqual(
          EditingExpression({
            expression: [
              NumberToken({ input: '12' }),
              OperationToken({ operation: 'Add' }),
            ],
            maybeCurrentInput: Option.none(),
            maybeLastResult: Option.none(),
          }),
        )
        expect(displayForModel(model)).toBe('12+')
        expect(expressionForModel(model)).toBe('')
      }),
    )
  })

  test('PressedDigit displays the current expression without evaluating it', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(PressedDigit({ digit: 'Six' })),
      Story.Command.expectNone(),
      Story.message(PressedDigit({ digit: 'Six' })),
      Story.Command.expectNone(),
      Story.message(PressedOperation({ operation: 'Multiply' })),
      Story.Command.expectNone(),
      Story.message(PressedDigit({ digit: 'Seven' })),
      Story.Command.expectNone(),
      Story.message(PressedDigit({ digit: 'Seven' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(expressionForModel(model)).toBe('')
        expect(displayForModel(model)).toBe('66×77')
      }),
    )
  })

  test('PressedEquals evaluates and moves the expression to subtext', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(PressedDigit({ digit: 'Seven' })),
      Story.Command.expectNone(),
      Story.message(PressedOperation({ operation: 'Multiply' })),
      Story.Command.expectNone(),
      Story.message(PressedDigit({ digit: 'Six' })),
      Story.Command.expectNone(),
      Story.message(PressedEquals()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(displayForModel(model)).toBe('42')
        expect(expressionForModel(model)).toBe('7×6')
      }),
    )
  })

  test('PressedEquals respects arithmetic precedence', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(PressedDigit({ digit: 'Two' })),
      Story.Command.expectNone(),
      Story.message(PressedOperation({ operation: 'Add' })),
      Story.Command.expectNone(),
      Story.message(PressedDigit({ digit: 'Three' })),
      Story.Command.expectNone(),
      Story.message(PressedOperation({ operation: 'Multiply' })),
      Story.Command.expectNone(),
      Story.message(PressedDigit({ digit: 'Four' })),
      Story.Command.expectNone(),
      Story.message(PressedEquals()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(displayForModel(model)).toBe('14')
        expect(expressionForModel(model)).toBe('2+3×4')
      }),
    )
  })

  test('PressedDecimalSeparator, PressedPercent, and PressedSign update the current input', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(PressedDigit({ digit: 'Five' })),
      Story.Command.expectNone(),
      Story.message(PressedDecimalSeparator()),
      Story.Command.expectNone(),
      Story.message(PressedDigit({ digit: 'Five' })),
      Story.Command.expectNone(),
      Story.message(PressedPercent()),
      Story.Command.expectNone(),
      Story.message(PressedSign()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(displayForModel(model)).toBe('-0.055')
      }),
    )
  })

  test('PressedBackspace removes the most recent input character', () => {
    Story.story(
      update,
      Story.with(initialModel),
      Story.message(PressedDigit({ digit: 'One' })),
      Story.Command.expectNone(),
      Story.message(PressedDigit({ digit: 'Two' })),
      Story.Command.expectNone(),
      Story.message(PressedDigit({ digit: 'Three' })),
      Story.Command.expectNone(),
      Story.message(PressedBackspace()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(displayForModel(model)).toBe('12')
      }),
    )
  })

  test('PressedClear restores the initial Model', () => {
    Story.story(
      update,
      Story.with(
        EditingExpression({
          expression: [],
          maybeCurrentInput: Option.some('42'),
          maybeLastResult: Option.none(),
        }),
      ),
      Story.message(PressedClear()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model).toEqual(initialModel)
      }),
    )
  })

  test('division by zero enters an error state', () => {
    Story.story(
      update,
      Story.with(
        EditingExpression({
          expression: [
            NumberToken({ input: '8' }),
            OperationToken({ operation: 'Divide' }),
          ],
          maybeCurrentInput: Option.some('0'),
          maybeLastResult: Option.none(),
        }),
      ),
      Story.message(PressedEquals()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model).toEqual(
          FailedCalculation({
            expression: [
              NumberToken({ input: '8' }),
              OperationToken({ operation: 'Divide' }),
              NumberToken({ input: '0' }),
            ],
            maybeLastResult: Option.none(),
            reason: 'Cannot divide by zero',
          }),
        )
        expect(displayForModel(model)).toBe('Error')
      }),
    )
  })
})
