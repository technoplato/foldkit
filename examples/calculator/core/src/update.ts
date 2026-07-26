import { Array as Array_, Match as M, Option } from 'effect'
import { Command } from 'foldkit'

import { type Message } from './message.js'
import {
  EditingExpression,
  type ExpressionToken,
  FailedCalculation,
  type Model,
  NumberToken,
  type Operation,
  OperationToken,
  ShowingResult,
  digitText,
  displayForModel,
  divisionByZeroErrorReason,
  evaluateExpression,
  expressionWithCurrentInput,
  initialDisplay,
  initialModel,
  numberFromInput,
  rawNumberText,
} from './model.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const appendDigitToInput = (input: string, digitTextValue: string): string => {
  if (input === initialDisplay) {
    return digitTextValue
  }
  if (input === `-${initialDisplay}`) {
    if (digitTextValue === initialDisplay) {
      return input
    } else {
      return `-${digitTextValue}`
    }
  }
  return `${input}${digitTextValue}`
}

const modelWithFreshInput = (
  input: string,
  maybeLastResult: Option.Option<string>,
): Model =>
  EditingExpression({
    expression: [],
    maybeCurrentInput: Option.some(input),
    maybeLastResult,
  })

const modelWithLastResultFrom = (model: Model, input: string): Model =>
  modelWithFreshInput(input, Option.some(displayForModel(model)))

const appendCurrentInput = (
  expression: ReadonlyArray<ExpressionToken>,
  maybeCurrentInput: Option.Option<string>,
): ReadonlyArray<ExpressionToken> =>
  expressionWithCurrentInput(expression, maybeCurrentInput)

const replaceLastExpressionToken = (
  expression: ReadonlyArray<ExpressionToken>,
  token: ExpressionToken,
): ReadonlyArray<ExpressionToken> => [...expression.slice(0, -1), token]

const expressionWithOperation = (
  expression: ReadonlyArray<ExpressionToken>,
  operation: Operation,
): ReadonlyArray<ExpressionToken> => {
  const nextOperationToken = OperationToken({ operation })
  const maybeLastToken = Array_.last(expression)
  if (Option.isSome(maybeLastToken)) {
    return M.value(maybeLastToken.value).pipe(
      M.withReturnType<ReadonlyArray<ExpressionToken>>(),
      M.tagsExhaustive({
        NumberToken: () => [...expression, nextOperationToken],
        OperationToken: () =>
          replaceLastExpressionToken(expression, nextOperationToken),
      }),
    )
  } else {
    return [NumberToken({ input: initialDisplay }), nextOperationToken]
  }
}

const expressionForCommittedResult = (
  model: Model,
): ReadonlyArray<ExpressionToken> =>
  M.value(model).pipe(
    M.withReturnType<ReadonlyArray<ExpressionToken>>(),
    M.tagsExhaustive({
      EditingExpression: ({ expression, maybeCurrentInput }) =>
        appendCurrentInput(expression, maybeCurrentInput),
      FailedCalculation: ({ expression }) => expression,
      ShowingResult: ({ expression }) => expression,
    }),
  )

const maybeLastResultForModel = (model: Model): Option.Option<string> =>
  M.value(model).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      EditingExpression: ({ maybeLastResult }) => maybeLastResult,
      FailedCalculation: ({ maybeLastResult }) => maybeLastResult,
      ShowingResult: ({ maybeLastResult }) => maybeLastResult,
    }),
  )

const modelForDigit = (model: Model, digitTextValue: string): Model =>
  M.value(model).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      EditingExpression: ({ expression, maybeCurrentInput, maybeLastResult }) =>
        EditingExpression({
          expression,
          maybeCurrentInput: Option.some(
            appendDigitToInput(
              Option.getOrElse(maybeCurrentInput, () => initialDisplay),
              digitTextValue,
            ),
          ),
          maybeLastResult,
        }),
      FailedCalculation: () =>
        modelWithFreshInput(digitTextValue, maybeLastResultForModel(model)),
      ShowingResult: () => modelWithLastResultFrom(model, digitTextValue),
    }),
  )

const modelForDecimalSeparator = (model: Model): Model =>
  M.value(model).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      EditingExpression: ({
        expression,
        maybeCurrentInput,
        maybeLastResult,
      }) => {
        const currentInput = Option.getOrElse(
          maybeCurrentInput,
          () => initialDisplay,
        )
        const nextCurrentInput = currentInput.includes('.')
          ? currentInput
          : `${currentInput}.`
        return EditingExpression({
          expression,
          maybeCurrentInput: Option.some(nextCurrentInput),
          maybeLastResult,
        })
      },
      FailedCalculation: () =>
        modelWithFreshInput(
          `${initialDisplay}.`,
          maybeLastResultForModel(model),
        ),
      ShowingResult: () => modelWithLastResultFrom(model, `${initialDisplay}.`),
    }),
  )

const rawInputAfterPercent = (input: string): string => {
  const maybeNumber = numberFromInput(input)
  if (Option.isSome(maybeNumber)) {
    return rawNumberText(maybeNumber.value / 100)
  } else {
    return initialDisplay
  }
}

const modelForPercent = (model: Model): Model =>
  M.value(model).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      EditingExpression: ({ expression, maybeCurrentInput, maybeLastResult }) =>
        EditingExpression({
          expression,
          maybeCurrentInput: Option.some(
            rawInputAfterPercent(
              Option.getOrElse(maybeCurrentInput, () => initialDisplay),
            ),
          ),
          maybeLastResult,
        }),
      FailedCalculation: () => model,
      ShowingResult: ({ rawResult }) =>
        modelWithLastResultFrom(model, rawInputAfterPercent(rawResult)),
    }),
  )

const toggledInputSign = (input: string): string => {
  if (input.startsWith('-')) {
    return input.slice(1)
  } else {
    return `-${input}`
  }
}

const modelForSign = (model: Model): Model =>
  M.value(model).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      EditingExpression: ({ expression, maybeCurrentInput, maybeLastResult }) =>
        EditingExpression({
          expression,
          maybeCurrentInput: Option.some(
            toggledInputSign(
              Option.getOrElse(maybeCurrentInput, () => initialDisplay),
            ),
          ),
          maybeLastResult,
        }),
      FailedCalculation: () => model,
      ShowingResult: ({ rawResult }) =>
        modelWithLastResultFrom(model, toggledInputSign(rawResult)),
    }),
  )

const inputAfterBackspace = (input: string): string => {
  if (input === initialDisplay || input === `-${initialDisplay}`) {
    return initialDisplay
  }
  const nextInput = input.slice(0, -1)
  if (nextInput === '' || nextInput === '-') {
    return initialDisplay
  } else {
    return nextInput
  }
}

const modelForBackspace = (model: Model): Model =>
  M.value(model).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      EditingExpression: ({
        expression,
        maybeCurrentInput,
        maybeLastResult,
      }) => {
        if (Option.isSome(maybeCurrentInput)) {
          return EditingExpression({
            expression,
            maybeCurrentInput: Option.some(
              inputAfterBackspace(maybeCurrentInput.value),
            ),
            maybeLastResult,
          })
        } else {
          return EditingExpression({
            expression: expression.slice(0, -1),
            maybeCurrentInput: Option.none(),
            maybeLastResult,
          })
        }
      },
      FailedCalculation: () =>
        modelWithFreshInput(initialDisplay, maybeLastResultForModel(model)),
      ShowingResult: () =>
        modelWithFreshInput(initialDisplay, maybeLastResultForModel(model)),
    }),
  )

const modelForOperation = (model: Model, operation: Operation): Model =>
  M.value(model).pipe(
    M.withReturnType<Model>(),
    M.tagsExhaustive({
      EditingExpression: ({ expression, maybeCurrentInput, maybeLastResult }) =>
        EditingExpression({
          expression: expressionWithOperation(
            appendCurrentInput(expression, maybeCurrentInput),
            operation,
          ),
          maybeCurrentInput: Option.none(),
          maybeLastResult,
        }),
      FailedCalculation: () => model,
      ShowingResult: ({ rawResult, maybeLastResult }) =>
        EditingExpression({
          expression: expressionWithOperation(
            [NumberToken({ input: rawResult })],
            operation,
          ),
          maybeCurrentInput: Option.none(),
          maybeLastResult,
        }),
    }),
  )

const modelForEquals = (model: Model): Model => {
  const expression = expressionForCommittedResult(model)
  const maybeResult = evaluateExpression(expression)
  const maybeLastResult = maybeLastResultForModel(model)

  if (Option.isSome(maybeResult)) {
    const rawResult = rawNumberText(maybeResult.value)
    return ShowingResult({
      expression,
      maybeLastResult: Option.some(
        displayForModel(
          ShowingResult({
            expression,
            maybeLastResult,
            rawResult,
          }),
        ),
      ),
      rawResult,
    })
  } else {
    return FailedCalculation({
      expression,
      maybeLastResult,
      reason: divisionByZeroErrorReason(),
    })
  }
}

/** Applies one Calculator Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      PressedBackspace: () => [modelForBackspace(model), []],
      PressedClear: () => [initialModel, []],
      PressedDecimalSeparator: () => [modelForDecimalSeparator(model), []],
      PressedDigit: ({ digit }) => [modelForDigit(model, digitText(digit)), []],
      PressedEquals: () => [modelForEquals(model), []],
      PressedOperation: ({ operation }) => [
        modelForOperation(model, operation),
        [],
      ],
      PressedPercent: () => [modelForPercent(model), []],
      PressedSign: () => [modelForSign(model), []],
    }),
  )
