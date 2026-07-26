import * as Calculator from 'calculator-core-example'
import * as Counter from 'counter-core-example'
import * as Counters from 'counters-core-example'
import { Array, Match as M, Predicate, Record, Schema as S } from 'effect'
import * as Fact from 'fact-core-example'
import { type Program, type Runtime } from 'foldkit'

import { calculatorActions, counterActions, factActions } from './manifest.js'
import type { ReadyModel } from './workbench.js'

const PREVIEW_CHARACTER_LIMIT = 180

/** One host action currently available in the selected replay frame. */
export const ActionPresentation = S.Struct({
  id: S.String,
  label: S.String,
})
/** One host action currently available in the selected replay frame. */
export type ActionPresentation = typeof ActionPresentation.Type

/** One replay transition with compact Message and before/after Model details. */
export const TransitionPresentation = S.Struct({
  messageName: S.String,
  messagePayload: S.String,
  nextModel: S.String,
  previousModel: S.String,
  sequence: S.Int,
  sourceName: S.String,
})
/** One replay transition with compact Message and before/after Model details. */
export type TransitionPresentation = typeof TransitionPresentation.Type

const truncatePreview = (preview: string): string =>
  preview.length <= PREVIEW_CHARACTER_LIMIT
    ? preview
    : `${preview.slice(0, PREVIEW_CHARACTER_LIMIT - 1)}…`

const formatValue = (value: unknown): string => {
  const json = JSON.stringify(value)
  return json === undefined ? String(value) : json
}

const formatPreview = (value: unknown): string =>
  truncatePreview(formatValue(value))

const payloadForMessage = (message: unknown): unknown =>
  Predicate.isObject(message) ? Record.remove(message, '_tag') : message

const actionPresentation = (
  action: Readonly<{ id: string; label: string }>,
): ActionPresentation =>
  ActionPresentation.make({ id: action.id, label: action.label })

/** Derives the complete host-sendable action set from the selected frame. */
export const actionsForModel = (
  model: ReadyModel,
): ReadonlyArray<ActionPresentation> =>
  M.value(model).pipe(
    M.withReturnType<ReadonlyArray<ActionPresentation>>(),
    M.tagsExhaustive({
      Counters: ({ model: countersModel }) =>
        Array.map(Counters.interactionsForModel(countersModel), interaction =>
          ActionPresentation.make({
            id: interaction.token,
            label: interaction.label,
          }),
        ),
      Counter: () => Array.map(counterActions, actionPresentation),
      Calculator: () => Array.map(calculatorActions, actionPresentation),
      Fact: () => Array.map(factActions, actionPresentation),
    }),
  )

const presentationsForTape = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
>(
  program: Program.Program<Model, Message, Resources>,
  tape: Runtime.ReplayTape<Model, Message>,
): ReadonlyArray<TransitionPresentation> => {
  const [, presentations] = Array.mapAccum(
    tape.transitions,
    tape.initialModel,
    (previousModel, transition) => {
      const [nextModel] = program.update(previousModel, transition.message)
      return [
        nextModel,
        TransitionPresentation.make({
          messageName: transition.message._tag,
          messagePayload: formatPreview(payloadForMessage(transition.message)),
          nextModel: formatValue(nextModel),
          previousModel: formatValue(previousModel),
          sequence: transition.sequence,
          sourceName: transition.source._tag,
        }),
      ]
    },
  )
  return presentations
}

/** Replays the tape's pure updates into compact before/after row presentations. */
export const transitionsForModel = (
  model: ReadyModel,
): ReadonlyArray<TransitionPresentation> =>
  M.value(model).pipe(
    M.withReturnType<ReadonlyArray<TransitionPresentation>>(),
    M.tagsExhaustive({
      Counters: ({ tape }) =>
        presentationsForTape(Counters.MultipleCountersProgram, tape),
      Counter: ({ tape }) => presentationsForTape(Counter.CounterProgram, tape),
      Calculator: ({ tape }) =>
        presentationsForTape(Calculator.CalculatorProgram, tape),
      Fact: ({ tape }) => presentationsForTape(Fact.FactProgram, tape),
    }),
  )
