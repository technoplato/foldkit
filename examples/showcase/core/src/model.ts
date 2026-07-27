import { Schema as S } from 'effect'

// MODEL

/** The showcase landing scene is visible. */
export const HomeScene = S.TaggedStruct('HomeScene', {})
/** The Counter scene is visible. */
export const CounterScene = S.TaggedStruct('CounterScene', {})
/** The Multiple Counters scene is visible. */
export const MultipleCountersScene = S.TaggedStruct('MultipleCountersScene', {})
/** The Calculator scene is visible. */
export const CalculatorScene = S.TaggedStruct('CalculatorScene', {})
/** The Fact scene is visible. */
export const FactScene = S.TaggedStruct('FactScene', {})

/** Every scene the universal showcase can present. */
export const Navigation = S.Union([
  HomeScene,
  CounterScene,
  MultipleCountersScene,
  CalculatorScene,
  FactScene,
])
/** A universal showcase navigation value. */
export type Navigation = typeof Navigation.Type

/** The renderer-neutral showcase Model. */
export const Model = S.Struct({ navigation: Navigation })
/** A renderer-neutral showcase Model value. */
export type Model = typeof Model.Type
