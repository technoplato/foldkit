import {
  type Message as CounterMessage,
  CounterProgram,
} from 'counter-core-example'
import { Array, Match as M, Option } from 'effect'
import { Program } from 'foldkit'

import { type EffectExecutor, commandForEffect } from './effect.js'
import {
  AssignedEffect,
  FailedEffect,
  type Message,
  Message as MessageSchema,
  RejectedEffect,
  RequestedEffect,
  SucceededEffect,
  WaitedForEffectProcessor,
} from './message.js'
import {
  AssignedEffectState,
  type EffectState,
  FailedEffectState,
  Model,
  RequestedEffectState,
  SucceededEffectState,
  WaitingEffectState,
} from './model.js'
import { EventRegistry } from './wire.js'

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Program.ProgramCommand<Message, EffectExecutor>>,
]

const findEffect = (model: Model, requestId: string) =>
  Array.findFirst(model.effects, effect => effect.requestId === requestId)

const isTerminalEffect = (effect: EffectState): boolean =>
  effect._tag === 'SucceededEffectState' || effect._tag === 'FailedEffectState'

const replaceEffect = (model: Model, effect: EffectState): Model =>
  Model.make({
    ...model,
    effects: Array.map(model.effects, current =>
      current.requestId === effect.requestId ? effect : current,
    ),
  })

const requestEffect = (
  model: Model,
  message: RequestedEffect,
): UpdateReturn => {
  if (Option.isSome(findEffect(model, message.requestId))) {
    return [model, []]
  }
  return [
    Model.make({
      ...model,
      effects: Array.append(
        model.effects,
        RequestedEffectState.make({
          kind: message.kind,
          requestId: message.requestId,
        }),
      ),
    }),
    [commandForEffect(message)],
  ]
}

const assignEffect = (model: Model, message: AssignedEffect): UpdateReturn => {
  const maybeEffect = findEffect(model, message.requestId)
  if (Option.isNone(maybeEffect) || isTerminalEffect(maybeEffect.value)) {
    return [model, []]
  }
  return [
    replaceEffect(
      model,
      AssignedEffectState.make({
        kind: message.kind,
        processorId: message.processorId,
        requestId: message.requestId,
      }),
    ),
    [],
  ]
}

const waitForEffect = (
  model: Model,
  message: WaitedForEffectProcessor,
): UpdateReturn => {
  const maybeEffect = findEffect(model, message.requestId)
  if (Option.isNone(maybeEffect) || isTerminalEffect(maybeEffect.value)) {
    return [model, []]
  }
  return [
    replaceEffect(
      model,
      WaitingEffectState.make({
        kind: message.kind,
        requestId: message.requestId,
      }),
    ),
    [],
  ]
}

const succeedEffect = (
  model: Model,
  message: SucceededEffect,
): UpdateReturn => {
  const maybeEffect = findEffect(model, message.requestId)
  if (Option.isNone(maybeEffect) || isTerminalEffect(maybeEffect.value)) {
    return [model, []]
  }
  return [
    replaceEffect(
      model,
      SucceededEffectState.make({
        kind: message.kind,
        processorId: message.processorId,
        requestId: message.requestId,
        summary: message.summary,
      }),
    ),
    [],
  ]
}

const failEffect = (model: Model, message: FailedEffect): UpdateReturn => {
  const maybeEffect = findEffect(model, message.requestId)
  if (Option.isNone(maybeEffect) || isTerminalEffect(maybeEffect.value)) {
    return [model, []]
  }
  return [
    replaceEffect(
      model,
      FailedEffectState.make({
        kind: message.kind,
        maybeProcessorId: Option.some(message.processorId),
        reason: message.reason,
        requestId: message.requestId,
      }),
    ),
    [],
  ]
}

const rejectEffect = (model: Model, message: RejectedEffect): UpdateReturn => {
  const maybeEffect = findEffect(model, message.requestId)
  if (Option.isNone(maybeEffect) || isTerminalEffect(maybeEffect.value)) {
    return [model, []]
  }
  return [
    replaceEffect(
      model,
      FailedEffectState.make({
        kind: message.kind,
        maybeProcessorId: Option.none(),
        reason: message.reason,
        requestId: message.requestId,
      }),
    ),
    [],
  ]
}

/** The exact canonical Counter dependency embedded by the Instant coordinator. */
export const CanonicalCounterProgram = CounterProgram

const updateCounter = (model: Model, message: CounterMessage): UpdateReturn => {
  const [counter, commands] = CanonicalCounterProgram.update(
    model.counter,
    message,
  )
  return [Model.make({ ...model, counter }), commands]
}

/** The renderer-free Program shared by every authenticated Instant Processor. */
export const InstantCounterProgram = Program.make({
  id: 'instant-counter',
  version: 1,
  Model,
  Message: MessageSchema,
  init: (): UpdateReturn => {
    const [counter, commands] = CanonicalCounterProgram.init()
    return [Model.make({ counter, effects: [] }), commands]
  },
  restore: (model): UpdateReturn => {
    const [counter, commands] = CanonicalCounterProgram.restore?.(
      model.counter,
    ) ?? [model.counter, []]
    return [Model.make({ ...model, counter }), commands]
  },
  update: (model, message): UpdateReturn =>
    M.value(message).pipe(
      M.withReturnType<UpdateReturn>(),
      M.tagsExhaustive({
        ClickedDecrement: message => updateCounter(model, message),
        ClickedIncrement: message => updateCounter(model, message),
        ClickedReset: message => updateCounter(model, message),
        RequestedEffect: message => requestEffect(model, message),
        AssignedEffect: message => assignEffect(model, message),
        WaitedForEffectProcessor: message => waitForEffect(model, message),
        RejectedEffect: message => rejectEffect(model, message),
        SucceededEffect: message => succeedEffect(model, message),
        FailedEffect: message => failEffect(model, message),
      }),
    ),
  versionedEvents: EventRegistry,
})
