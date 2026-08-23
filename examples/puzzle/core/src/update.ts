import { Effect, Match as M, Option } from 'effect'
import * as Command from 'foldkit/command'

import {
  FailedOperator,
  type Message,
  SucceededOperatorUrls,
} from './message.js'
import { type Model, emptyModel } from './model.js'
import { defaultReplicateStep } from './replicate.js'
import { GuessStep, HintStep, OperatorStep, PlainHint } from './step.js'
import {
  defaultPrompt,
  dispatchedOperator,
  fanOutIdentity,
  observedOperator,
  openedOperator,
  operatorEmail,
  postedOperator,
  verifiedOperator,
} from './tape.js'
import { puzzleInstantSessionId, puzzleLocalSubjectId } from './tapeIdentity.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const identityOf = () =>
  fanOutIdentity(puzzleLocalSubjectId, puzzleInstantSessionId)

const settleGuess = (model: Model, answer: 'y' | 'n'): Model => {
  if (model.prompt._tag !== 'LabelStep') {
    return model
  }
  return {
    tape: [
      ...model.tape,
      GuessStep.make({
        label: model.prompt.label,
        answer,
        hint: Option.none(),
      }),
    ],
    prompt: defaultPrompt,
  }
}

const settleHint = (model: Model): Model => {
  if (model.prompt._tag !== 'LabelStep') {
    return model
  }
  return {
    tape: [
      ...model.tape,
      HintStep.make({
        label: model.prompt.label,
        hint: PlainHint.make({ text: 'hint' }),
      }),
    ],
    prompt: defaultPrompt,
  }
}

export const PostOperator = Command.define(
  'PostOperator',
  SucceededOperatorUrls,
  FailedOperator,
)(
  Effect.succeed(SucceededOperatorUrls()).pipe(
    Effect.catch(() =>
      Effect.succeed(FailedOperator({ reason: 'Operator post failed.' })),
    ),
  ),
)

/** Applies one Puzzle Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      GuessedYes: () => [settleGuess(model, 'y'), []],
      GuessedNo: () => [settleGuess(model, 'n'), []],
      RequestedHint: () => [settleHint(model), []],
      PostedOperator: () => {
        if (model.prompt._tag !== 'LabelStep') {
          return [model, []]
        }
        return [
          {
            tape: model.tape,
            prompt: OperatorStep.make({ phase: postedOperator(identityOf()) }),
          },
          [PostOperator()],
        ]
      },
      SucceededOperatorUrls: () => {
        if (model.prompt._tag !== 'OperatorStep') {
          return [model, []]
        }
        if (model.prompt.phase._tag !== 'OperatorPosted') {
          return [model, []]
        }
        return [
          {
            tape: model.tape,
            prompt: OperatorStep.make({
              phase: openedOperator(model.prompt.phase.identity),
            }),
          },
          [],
        ]
      },
      ObservedOperator: () => {
        if (model.prompt._tag !== 'OperatorStep') {
          return [model, []]
        }
        const phase = model.prompt.phase
        if (phase._tag !== 'OperatorOpened') {
          return [model, []]
        }
        return [
          {
            tape: model.tape,
            prompt: OperatorStep.make({
              phase: observedOperator(phase, {
                analytics: ['operator.observe'],
                logs: ['websocket connected'],
              }),
            }),
          },
          [],
        ]
      },
      SucceededOperatorVerify: () => {
        if (model.prompt._tag !== 'OperatorStep') {
          return [model, []]
        }
        const phase = model.prompt.phase
        if (phase._tag !== 'OperatorObserved') {
          return [model, []]
        }
        return [
          {
            tape: model.tape,
            prompt: OperatorStep.make({
              phase: verifiedOperator(phase, operatorEmail),
            }),
          },
          [],
        ]
      },
      SucceededOperatorDispatch: () => {
        if (model.prompt._tag !== 'OperatorStep') {
          return [model, []]
        }
        const phase = model.prompt.phase
        if (phase._tag !== 'OperatorVerified') {
          return [model, []]
        }
        return [
          {
            tape: [
              ...model.tape,
              OperatorStep.make({
                phase: dispatchedOperator(
                  phase,
                  'https://grok.knophy.com/dispatch',
                ),
              }),
            ],
            prompt: defaultPrompt,
          },
          [],
        ]
      },
      OpenedReplicate: () => {
        if (model.prompt._tag !== 'LabelStep') {
          return [model, []]
        }
        return [
          {
            tape: model.tape,
            prompt: defaultReplicateStep(),
          },
          [],
        ]
      },
      FailedOperator: () => [model, []],
      ResetTape: () => [emptyModel(), []],
    }),
  )
