import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { East, North, gridCoord } from '../spatial/spatial.js'
import * as Interactable from './interactable.js'

const sign = Interactable.Entity.make({
  id: 'welcome',
  at: gridCoord(2, 1),
  kind: Interactable.SignKind(),
})

const machine = Interactable.Entity.make({
  id: 'vending',
  at: gridCoord(4, 4),
  kind: Interactable.MachineKind(),
})

const entities = [sign, machine]

describe('InteractTarget', () => {
  it('is None when the faced cell is empty', () => {
    const target = Interactable.targetInFront(
      gridCoord(0, 0),
      North(),
      entities,
    )
    expect(target).toEqual(Interactable.None())
  })

  it('is Adjacent when the faced cell holds an entity', () => {
    const target = Interactable.targetInFront(
      gridCoord(2, 2),
      North(),
      entities,
    )
    expect(target).toEqual(Interactable.Adjacent({ id: 'welcome' }))
  })
})

describe('applyPressA', () => {
  it('requires a typed no-op on None', () => {
    const result = Interactable.applyPressA(Interactable.None(), {
      onNone: () => 'stay',
      onAdjacent: id => id,
    })
    expect(result).toBe('stay')
  })

  it('forwards the adjacent id', () => {
    const result = Interactable.applyPressA(
      Interactable.Adjacent({ id: 'vending' }),
      {
        onNone: () => 'stay',
        onAdjacent: id => id,
      },
    )
    expect(result).toBe('vending')
  })

  it('builds PressA only from Adjacent', () => {
    expect(
      Interactable.pressAFromTarget(Interactable.None()),
    ).toEqual(Option.none())
    expect(
      Interactable.pressAFromTarget(Interactable.Adjacent({ id: 'welcome' })),
    ).toEqual(Option.some(Interactable.PressA({ id: 'welcome' })))
  })
})

describe('Kind', () => {
  it('decodes the extensible tagged kinds', () => {
    expect(S.decodeSync(Interactable.Kind)({ _tag: 'Sign' })).toEqual(
      Interactable.SignKind(),
    )
    expect(S.decodeSync(Interactable.Kind)({ _tag: 'Machine' })).toEqual(
      Interactable.MachineKind(),
    )
    expect(S.decodeSync(Interactable.Kind)({ _tag: 'Npc' })).toEqual(
      Interactable.NpcKind(),
    )
  })

  it('finds entities by cell and id', () => {
    expect(Interactable.entityAt(entities, gridCoord(4, 4))).toEqual(
      Option.some(machine),
    )
    expect(Interactable.entityById(entities, 'welcome')).toEqual(
      Option.some(sign),
    )
    expect(Interactable.entityAt(entities, gridCoord(0, 0))).toEqual(
      Option.none(),
    )
  })

  it('does not treat a side cell as in front', () => {
    const target = Interactable.targetInFront(
      gridCoord(2, 1),
      East(),
      entities,
    )
    expect(target).toEqual(Interactable.None())
  })
})
