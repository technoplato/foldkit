import { Schema as S } from 'effect'
import { BoundField } from 'foldkit/behavior'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'

import { type ProfileFieldKey, ProfileFieldKeySchema } from './boundForm'
import {
  type Category,
  CategorySchema,
  type PartKey,
  PartKeySchema,
} from './catalog'

export const PartDispatched = m('PartDispatched', {
  partKey: PartKeySchema,
  partMessage: S.Unknown,
})

export const BoundFieldDispatched = m('BoundFieldDispatched', {
  fieldKey: ProfileFieldKeySchema,
  fieldMessage: BoundField.Message,
})

export const SubmittedProfileForm = m('SubmittedProfileForm')
export const TriggeredBurstTest = m('TriggeredBurstTest')
export const FlushedDuePace = m('FlushedDuePace', { nowMs: S.Number })
export const UpdatedSearchQuery = m('UpdatedSearchQuery', { value: S.String })
export const SelectedCategory = m('SelectedCategory', {
  category: CategorySchema,
})
export const ToggledThemeMode = m('ToggledThemeMode')
export const InspectedPart = m('InspectedPart', { partKey: PartKeySchema })
export const ClosedInspector = m('ClosedInspector')
export const ResetPlayground = m('ResetPlayground')
export const IgnoredKeyPress = m('IgnoredKeyPress')

export const PlaygroundMessage = S.Union([
  PartDispatched,
  BoundFieldDispatched,
  SubmittedProfileForm,
  TriggeredBurstTest,
  FlushedDuePace,
  UpdatedSearchQuery,
  SelectedCategory,
  ToggledThemeMode,
  InspectedPart,
  ClosedInspector,
  ResetPlayground,
  IgnoredKeyPress,
])
export type PlaygroundMessage = typeof PlaygroundMessage.Type

export const H = html<PlaygroundMessage>()

export const dispatchPart = (
  partKey: PartKey,
  partMessage: Readonly<{ _tag: string }>,
): PlaygroundMessage => PartDispatched({ partKey, partMessage })

export const dispatchBoundField = (
  fieldKey: ProfileFieldKey,
  fieldMessage: BoundField.Message,
): PlaygroundMessage => BoundFieldDispatched({ fieldKey, fieldMessage })

export const categoryOf = (category: Category): Category => category
