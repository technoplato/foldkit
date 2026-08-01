import { Schema as S } from 'effect'
import { InteractionReference } from 'foldkit/interaction-graph'

/** Activates one exact Program-projected semantic interaction. */
export const PerformedMultipleCountersInteraction = S.TaggedStruct(
  'PerformedMultipleCountersInteraction',
  { reference: InteractionReference },
)

/** Opens one canonical Program-owned destination carrier. */
export const OpenedMultipleCountersNavigationCarrier = S.TaggedStruct(
  'OpenedMultipleCountersNavigationCarrier',
  { destinationUri: S.NonEmptyString },
)

/** Every typed input the attached browser renderer may send to its controller. */
export const MultipleCountersV3BrowserClientInput = S.Union([
  PerformedMultipleCountersInteraction,
  OpenedMultipleCountersNavigationCarrier,
])
/** Every typed input the attached browser renderer may send to its controller. */
export type MultipleCountersV3BrowserClientInput =
  typeof MultipleCountersV3BrowserClientInput.Type
