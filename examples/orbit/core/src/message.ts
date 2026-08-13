import { Schema as S } from 'effect'

import { CatalogSource, Danger, Role, PlayCredits } from './model.js'

/** Opens a simulated wallet for a role. */
export const OpenSim = S.TaggedStruct('OpenSim', {
  role: Role,
})

/** Mints play credits into a sim. */
export const MintPlay = S.TaggedStruct('MintPlay', {
  role: Role,
  amount: PlayCredits,
})

/** Moves play credits between sims. */
export const MovePlay = S.TaggedStruct('MovePlay', {
  from: Role,
  to: Role,
  amount: PlayCredits,
})

/** Asks for a dangerous effect. Always refused. */
export const AskDanger = S.TaggedStruct('AskDanger', {
  danger: Danger,
})

/** Records a live snap observation. */
export const ObservedSnap = S.TaggedStruct('ObservedSnap', {
  seq: S.Number,
  modelJson: S.String,
  source: CatalogSource,
})

/** Records that snap observation failed. */
export const FailedObserveSnap = S.TaggedStruct('FailedObserveSnap', {
  reason: S.String,
})

/** Records that one catalog tool was selected. */
export const ClickedTool = S.TaggedStruct('ClickedTool', {
  id: S.String,
})

/** Records that the selected tool was closed. */
export const ClosedTool = S.TaggedStruct('ClosedTool', {})

/** Every Message accepted by the Orbit Program. */
export const Message = S.Union([
  OpenSim,
  MintPlay,
  MovePlay,
  AskDanger,
  ObservedSnap,
  FailedObserveSnap,
  ClickedTool,
  ClosedTool,
])
/** An Orbit Message value. */
export type Message = typeof Message.Type
