import { Option, Schema as S, Stream } from 'effect'
import { describe, expect, it } from 'vitest'

import { liftEffects } from '../program/liftEffects.js'
import { lift, make } from './subscription.js'

type ChildModel = Readonly<{ count: number; label: string }>
type ChildMessage = Readonly<{ _tag: 'Tick' }>
type ParentModel = Readonly<{ child: ChildModel }>
type ParentMessage = Readonly<{ _tag: 'ChildTick' }>

describe('Subscription.lift shared parent Model projection', () => {
  it('calls toChildModel once per parent Model object across sibling lifted entries', () => {
    const childSubscriptions = make<ChildModel, ChildMessage>()(entry => ({
      first: entry(
        { count: S.Number },
        {
          modelToDependencies: model => ({ count: model.count }),
          dependenciesToStream: () => Stream.empty,
        },
      ),
      second: entry(
        { label: S.String },
        {
          modelToDependencies: model => ({ label: model.label }),
          dependenciesToStream: () => Stream.empty,
        },
      ),
      third: entry(
        { count: S.Number, label: S.String },
        {
          modelToDependencies: model => ({
            count: model.count,
            label: model.label,
          }),
          dependenciesToStream: () => Stream.empty,
        },
      ),
    }))

    let projectionCalls = 0
    const lifted = lift(childSubscriptions)<ParentModel, ParentMessage>({
      toChildModel: parent => {
        projectionCalls += 1
        return parent.child
      },
      toParentMessage: () => ({ _tag: 'ChildTick' }),
    })

    const firstParent: ParentModel = { child: { count: 1, label: 'a' } }
    expect(lifted.first.modelToDependencies(firstParent)).toEqual({ count: 1 })
    expect(lifted.second.modelToDependencies(firstParent)).toEqual({
      label: 'a',
    })
    expect(lifted.third.modelToDependencies(firstParent)).toEqual({
      count: 1,
      label: 'a',
    })
    expect(projectionCalls).toBe(1)

    const secondParent: ParentModel = { child: { count: 2, label: 'b' } }
    expect(lifted.first.modelToDependencies(secondParent)).toEqual({ count: 2 })
    expect(lifted.second.modelToDependencies(secondParent)).toEqual({
      label: 'b',
    })
    expect(projectionCalls).toBe(2)
  })

  it('calls toChildModel directly for primitive parent Models', () => {
    const childSubscriptions = make<ChildModel, ChildMessage>()(entry => ({
      first: entry(
        { count: S.Number },
        {
          modelToDependencies: model => ({ count: model.count }),
          dependenciesToStream: () => Stream.empty,
        },
      ),
      second: entry(
        { label: S.String },
        {
          modelToDependencies: model => ({ label: model.label }),
          dependenciesToStream: () => Stream.empty,
        },
      ),
    }))

    let projectionCalls = 0
    const lifted = lift(childSubscriptions)<number, ParentMessage>({
      toChildModel: count => {
        projectionCalls += 1
        return { count, label: String(count) }
      },
      toParentMessage: () => ({ _tag: 'ChildTick' }),
    })

    expect(lifted.first.modelToDependencies(7)).toEqual({ count: 7 })
    expect(lifted.second.modelToDependencies(7)).toEqual({ label: '7' })
    expect(projectionCalls).toBe(2)
  })

  it('shares maybeChildOf across lifted subscriptions in liftEffects', () => {
    const childSubscriptions = make<ChildModel, ChildMessage>()(entry => ({
      first: entry(
        { count: S.Number },
        {
          modelToDependencies: model => ({ count: model.count }),
          dependenciesToStream: () => Stream.empty,
        },
      ),
      second: entry(
        { label: S.String },
        {
          modelToDependencies: model => ({ label: model.label }),
          dependenciesToStream: () => Stream.empty,
        },
      ),
    }))

    let projectionCalls = 0
    const effects = liftEffects(
      { subscriptions: childSubscriptions },
      (parent: ParentModel) => {
        projectionCalls += 1
        return Option.some(parent.child)
      },
    )

    const parent: ParentModel = { child: { count: 3, label: 'c' } }
    expect(
      effects.subscriptions?.['first']?.modelToDependencies(parent),
    ).toEqual({
      maybeDependencies: Option.some({ count: 3 }),
    })
    expect(
      effects.subscriptions?.['second']?.modelToDependencies(parent),
    ).toEqual({
      maybeDependencies: Option.some({ label: 'c' }),
    })
    expect(projectionCalls).toBe(1)
  })
})
