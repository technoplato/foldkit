import { Schema as S } from 'effect'

import { Idea } from './catalog.js'
import { CatalogSource } from './model.js'

// MESSAGE

/** Records a live catalog snapshot. */
export const ObservedIdeas = S.TaggedStruct('ObservedIdeas', {
  ideas: S.Array(Idea),
  source: CatalogSource,
})

/** Records that catalog observation failed. */
export const FailedObserveIdeas = S.TaggedStruct('FailedObserveIdeas', {
  reason: S.String,
})

/** Records that one idea was selected. */
export const ClickedIdea = S.TaggedStruct('ClickedIdea', {
  id: S.String,
})

/** Records that the selected idea was closed. */
export const ClosedIdea = S.TaggedStruct('ClosedIdea', {})

/** Records that the filter query changed. */
export const UpdatedQuery = S.TaggedStruct('UpdatedQuery', {
  query: S.String,
})

/** Every Message accepted by the Ideas Program. */
export const Message = S.Union([
  ObservedIdeas,
  FailedObserveIdeas,
  ClickedIdea,
  ClosedIdea,
  UpdatedQuery,
])
/** An Ideas Message value. */
export type Message = typeof Message.Type
