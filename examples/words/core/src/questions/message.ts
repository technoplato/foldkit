import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { Question, QuestionFilter } from './model.js'

// MESSAGE

/** His questions arrived, or changed in Instant; `unreadableCount` rows could not be read. */
export const ObservedQuestions = m('ObservedQuestions', {
  questions: S.Array(Question),
  unreadableCount: S.Number,
})
/** His questions could not load. */
export const FailedObserveQuestions = m('FailedObserveQuestions', {
  reason: S.String,
})
/** The listener typed in the questions' search box. */
export const UpdatedQuestionSearch = m('UpdatedQuestionSearch', {
  value: S.String,
})
/** The listener chose which questions to list: all, the ones to learn from, or the open ones. */
export const ClickedQuestionFilter = m('ClickedQuestionFilter', {
  filter: QuestionFilter,
})

/** Every questions Message. */
export const Message = S.Union([
  ObservedQuestions,
  FailedObserveQuestions,
  UpdatedQuestionSearch,
  ClickedQuestionFilter,
])
/** Every questions Message. */
export type Message = typeof Message.Type
