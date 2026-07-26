import { Array as Array_, Match as M, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

// MODEL

/** The canonical initial calculator display shared by Calculator hosts. */
export const initialDisplay = '0'

/** A digit the Calculator can enter. */
export const Digit = S.Literals([
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
])
/** A Calculator digit value. */
export type Digit = typeof Digit.Type

/** A binary arithmetic operation the Calculator can apply. */
export const Operation = S.Literals(['Add', 'Subtract', 'Multiply', 'Divide'])
/** A Calculator operation value. */
export type Operation = typeof Operation.Type

/** A numeric literal in the Calculator expression. */
export const NumberToken = ts('NumberToken', { input: S.String })
/** An operation literal in the Calculator expression. */
export const OperationToken = ts('OperationToken', { operation: Operation })
/** One token in the Calculator expression. */
export const ExpressionToken = S.Union([NumberToken, OperationToken])
/** A Calculator expression token value. */
export type ExpressionToken = typeof ExpressionToken.Type

/** The Calculator is editing an expression and may have a current input. */
export const EditingExpression = ts('EditingExpression', {
  expression: S.Array(ExpressionToken),
  maybeCurrentInput: S.Option(S.String),
  maybeLastResult: S.Option(S.String),
})
/** The Calculator is showing the result of a completed calculation. */
export const ShowingResult = ts('ShowingResult', {
  expression: S.Array(ExpressionToken),
  maybeLastResult: S.Option(S.String),
  rawResult: S.String,
})
/** The Calculator could not complete the requested calculation. */
export const FailedCalculation = ts('FailedCalculation', {
  expression: S.Array(ExpressionToken),
  maybeLastResult: S.Option(S.String),
  reason: S.String,
})

/** The Calculator's current Model. */
export const Model = S.Union([
  EditingExpression,
  ShowingResult,
  FailedCalculation,
])
/** A Calculator Model value. */
export type Model = typeof Model.Type

/** The initial Calculator Model shared by every host. */
export const initialModel = EditingExpression({
  expression: [],
  maybeCurrentInput: Option.some(initialDisplay),
  maybeLastResult: Option.none(),
})

const maximumDecimalPlaces = 8
const divisionByZeroReason = 'Cannot divide by zero'
const resultFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: maximumDecimalPlaces,
})

const normalizedFiniteNumber = (value: number): Option.Option<number> => {
  if (globalThis.Number.isFinite(value)) {
    if (globalThis.Object.is(value, -0)) {
      return Option.some(0)
    } else {
      return Option.some(value)
    }
  } else {
    return Option.none()
  }
}

/** Parses a Calculator numeric input string. */
export const numberFromInput = (input: string): Option.Option<number> => {
  const parsedNumber = globalThis.Number.parseFloat(input)
  return normalizedFiniteNumber(parsedNumber)
}

/** Returns the raw canonical numeric text for a finite number. */
export const rawNumberText = (value: number): string => {
  const maybeNormalizedNumber = normalizedFiniteNumber(value)
  if (Option.isSome(maybeNormalizedNumber)) {
    const nextValue = maybeNormalizedNumber.value
    if (globalThis.Number.isInteger(nextValue)) {
      return nextValue.toString()
    } else {
      return globalThis.Number.parseFloat(
        nextValue.toFixed(maximumDecimalPlaces),
      ).toString()
    }
  } else {
    return initialDisplay
  }
}

/** Returns the user-facing display text for a finite number. */
export const formatResult = (value: number): string => {
  const maybeNormalizedNumber = normalizedFiniteNumber(value)
  if (Option.isSome(maybeNormalizedNumber)) {
    return resultFormatter.format(
      globalThis.Number(rawNumberText(maybeNormalizedNumber.value)),
    )
  } else {
    return initialDisplay
  }
}

/** Returns the printable text for a digit. */
export const digitText = (digit: Digit): string =>
  M.value(digit).pipe(
    M.withReturnType<string>(),
    M.when('Zero', () => '0'),
    M.when('One', () => '1'),
    M.when('Two', () => '2'),
    M.when('Three', () => '3'),
    M.when('Four', () => '4'),
    M.when('Five', () => '5'),
    M.when('Six', () => '6'),
    M.when('Seven', () => '7'),
    M.when('Eight', () => '8'),
    M.when('Nine', () => '9'),
    M.exhaustive,
  )

/** Returns the printable operator symbol for an operation. */
export const operationSymbol = (operation: Operation): string =>
  M.value(operation).pipe(
    M.withReturnType<string>(),
    M.when('Add', () => '+'),
    M.when('Subtract', () => '−'),
    M.when('Multiply', () => '×'),
    M.when('Divide', () => '÷'),
    M.exhaustive,
  )

/** Returns the reason for failed division. */
export const divisionByZeroErrorReason = (): string => divisionByZeroReason

/** Adds the current input to an expression when one exists. */
export const expressionWithCurrentInput = (
  expression: ReadonlyArray<ExpressionToken>,
  maybeCurrentInput: Option.Option<string>,
): ReadonlyArray<ExpressionToken> => {
  if (Option.isSome(maybeCurrentInput)) {
    return [...expression, NumberToken({ input: maybeCurrentInput.value })]
  } else {
    return expression
  }
}

const calculateOperands = (
  leftOperand: number,
  operation: Operation,
  rightOperand: number,
): Option.Option<number> =>
  M.value(operation).pipe(
    M.withReturnType<Option.Option<number>>(),
    M.when('Add', () => normalizedFiniteNumber(leftOperand + rightOperand)),
    M.when('Subtract', () =>
      normalizedFiniteNumber(leftOperand - rightOperand),
    ),
    M.when('Multiply', () =>
      normalizedFiniteNumber(leftOperand * rightOperand),
    ),
    M.when('Divide', () => {
      if (rightOperand === 0) {
        return Option.none()
      } else {
        return normalizedFiniteNumber(leftOperand / rightOperand)
      }
    }),
    M.exhaustive,
  )

const valuesAndOperationsForExpression = (
  expression: ReadonlyArray<ExpressionToken>,
): Option.Option<
  Readonly<{
    operations: ReadonlyArray<Operation>
    values: ReadonlyArray<number>
  }>
> => {
  const values = new Array<number>()
  const operations = new Array<Operation>()
  let isExpectingNumber = true

  for (const token of expression) {
    const maybeInvalidExpression = M.value(token).pipe(
      M.withReturnType<Option.Option<void>>(),
      M.tagsExhaustive({
        NumberToken: ({ input }) => {
          if (isExpectingNumber) {
            const maybeNumber = numberFromInput(input)
            if (Option.isSome(maybeNumber)) {
              values.push(maybeNumber.value)
              isExpectingNumber = false
              return Option.none()
            } else {
              return Option.some(undefined)
            }
          } else {
            return Option.some(undefined)
          }
        },
        OperationToken: ({ operation }) => {
          if (isExpectingNumber) {
            return Option.some(undefined)
          } else {
            operations.push(operation)
            isExpectingNumber = true
            return Option.none()
          }
        },
      }),
    )

    if (Option.isSome(maybeInvalidExpression)) {
      return Option.none()
    }
  }

  if (Array_.isArrayEmpty(values)) {
    return Option.none()
  } else {
    return Option.some({ operations, values })
  }
}

/** Evaluates a complete or trailing-operation Calculator expression. */
export const evaluateExpression = (
  expression: ReadonlyArray<ExpressionToken>,
): Option.Option<number> => {
  const maybeParts = valuesAndOperationsForExpression(expression)
  if (Option.isNone(maybeParts)) {
    return Option.none()
  }

  const maybeFirstValue = Array_.head(maybeParts.value.values)
  if (Option.isNone(maybeFirstValue)) {
    return Option.none()
  }

  const collapsedValues = new Array<number>()
  const collapsedOperations = new Array<Operation>()
  let nextValue = maybeFirstValue.value
  let operationIndex = 0

  for (const operation of maybeParts.value.operations) {
    const maybeRightValue = Array_.get(
      maybeParts.value.values,
      operationIndex + 1,
    )
    if (Option.isNone(maybeRightValue)) {
      break
    }

    const maybeCollapsedValue = M.value(operation).pipe(
      M.withReturnType<Option.Option<number>>(),
      M.when('Multiply', () =>
        calculateOperands(nextValue, operation, maybeRightValue.value),
      ),
      M.when('Divide', () =>
        calculateOperands(nextValue, operation, maybeRightValue.value),
      ),
      M.orElse(() => {
        collapsedValues.push(nextValue)
        collapsedOperations.push(operation)
        nextValue = maybeRightValue.value
        return Option.some(nextValue)
      }),
    )

    if (Option.isNone(maybeCollapsedValue)) {
      return Option.none()
    }
    nextValue = maybeCollapsedValue.value
    operationIndex += 1
  }

  collapsedValues.push(nextValue)

  const maybeInitialResult = Array_.head(collapsedValues)
  if (Option.isNone(maybeInitialResult)) {
    return Option.none()
  }

  let nextResult = maybeInitialResult.value
  let collapsedOperationIndex = 0

  for (const operation of collapsedOperations) {
    const maybeRightValue = Array_.get(
      collapsedValues,
      collapsedOperationIndex + 1,
    )
    if (Option.isNone(maybeRightValue)) {
      break
    }

    const maybeNextResult = calculateOperands(
      nextResult,
      operation,
      maybeRightValue.value,
    )
    if (Option.isNone(maybeNextResult)) {
      return Option.none()
    }

    nextResult = maybeNextResult.value
    collapsedOperationIndex += 1
  }

  return Option.some(nextResult)
}

const displayForEditingExpression = (
  expression: ReadonlyArray<ExpressionToken>,
  maybeCurrentInput: Option.Option<string>,
): string => {
  const expressionText = textForExpression(
    expressionWithCurrentInput(expression, maybeCurrentInput),
  )
  if (expressionText === '') {
    return initialDisplay
  } else {
    return expressionText
  }
}

const textForExpression = (
  expression: ReadonlyArray<ExpressionToken>,
): string => {
  let nextText = ''
  for (const token of expression) {
    nextText = M.value(token).pipe(
      M.withReturnType<string>(),
      M.tagsExhaustive({
        NumberToken: ({ input }) => `${nextText}${input}`,
        OperationToken: ({ operation }) =>
          `${nextText}${operationSymbol(operation)}`,
      }),
    )
  }
  return nextText
}

/** Returns the user-facing expression text for a Calculator Model. */
export const expressionForModel = (model: Model): string =>
  M.value(model).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      EditingExpression: () => '',
      FailedCalculation: ({ expression }) => textForExpression(expression),
      ShowingResult: ({ expression }) => textForExpression(expression),
    }),
  )

/** Returns the latest committed result when the Model has one. */
export const lastResultForModel = (model: Model): Option.Option<string> =>
  M.value(model).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      EditingExpression: ({ maybeLastResult }) => maybeLastResult,
      FailedCalculation: ({ maybeLastResult }) => maybeLastResult,
      ShowingResult: ({ maybeLastResult }) => maybeLastResult,
    }),
  )

/** Returns the user-facing display text for a Calculator Model. */
export const displayForModel = (model: Model): string =>
  M.value(model).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      EditingExpression: ({ expression, maybeCurrentInput }) =>
        displayForEditingExpression(expression, maybeCurrentInput),
      FailedCalculation: () => 'Error',
      ShowingResult: ({ rawResult }) =>
        formatResult(globalThis.Number(rawResult)),
    }),
  )
