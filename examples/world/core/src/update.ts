import { Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import * as Interactable from 'foldkit/interactable'
import { step } from 'foldkit/spatial'
import {
  init as initVending,
  update as updateVending,
} from 'vending-core-example'
import type { WalletResources } from 'wallet-core-example'

import { GotVendingMessage, type Message } from './message.js'
import { Model, Operating, Reading, Roaming, poseOf } from './model.js'
import {
  entities,
  facingTarget,
  isWalkable,
  signById,
  vendingId,
} from './town.js'

type UpdateResult = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, WalletResources>>,
]

const stay = (model: Model): UpdateResult => [model, []]

const moveRoaming = (
  model: typeof Roaming.Type,
  facing: typeof model.facing,
) => {
  const nextAt = step(model.at, facing)
  if (!isWalkable(nextAt)) {
    return Roaming({ at: model.at, facing })
  }
  return Roaming({ at: nextAt, facing })
}

const openVending = (model: typeof Roaming.Type): UpdateResult => {
  const [vending, commands] = initVending()
  return [
    Operating({
      at: model.at,
      facing: model.facing,
      vending,
    }),
    Command.mapMessages(commands, message => GotVendingMessage({ message })),
  ]
}

const pressAWhileRoaming = (model: typeof Roaming.Type): UpdateResult =>
  Interactable.applyPressA(facingTarget(model.at, model.facing), {
    onNone: () => stay(model),
    onAdjacent: id => {
      if (id === vendingId) {
        return openVending(model)
      }
      const maybeSign = signById(id)
      if (Option.isSome(maybeSign)) {
        return [
          Reading({
            at: model.at,
            facing: model.facing,
            sign: maybeSign.value,
          }),
          [],
        ]
      }
      const maybeEntity = Interactable.entityById(entities, id)
      if (Option.isNone(maybeEntity)) {
        return stay(model)
      }
      return M.value(maybeEntity.value.kind).pipe(
        M.tagsExhaustive({
          Sign: () => stay(model),
          Machine: () => openVending(model),
          Npc: () => stay(model),
        }),
      )
    },
  })

const dismissToRoaming = (model: Model): UpdateResult => {
  const pose = poseOf(model)
  return [Roaming({ at: pose.at, facing: pose.facing }), []]
}

/** Applies one World Message. Illegal moves stay in the current attention. */
export const update = (model: Model, message: Message): UpdateResult =>
  M.value(message).pipe(
    M.withReturnType<UpdateResult>(),
    M.tagsExhaustive({
      Moved: ({ facing }) => {
        if (model._tag !== 'Roaming') {
          return stay(model)
        }
        return [moveRoaming(model, facing), []]
      },
      PressedA: () => {
        if (model._tag !== 'Roaming') {
          return stay(model)
        }
        return pressAWhileRoaming(model)
      },
      Dismissed: () => {
        if (model._tag === 'Roaming') {
          return stay(model)
        }
        return dismissToRoaming(model)
      },
      GotVendingMessage: ({ message: vendingMessage }) => {
        if (model._tag !== 'Operating') {
          return stay(model)
        }
        const [nextVending, commands] = updateVending(
          model.vending,
          vendingMessage,
        )
        return [
          Operating({
            at: model.at,
            facing: model.facing,
            vending: nextVending,
          }),
          Command.mapMessages(commands, inner =>
            GotVendingMessage({ message: inner }),
          ),
        ]
      },
    }),
  )
