import {
  ClickedQuestionFilter,
  FailedObserveQuestions,
  type Message,
  ObservedQuestions,
  UpdatedQuestionSearch,
} from './message.js'

/** His questions arrived or changed. */
export const reportQuestions = (
  payload: Parameters<typeof ObservedQuestions>[0],
): Message => ObservedQuestions(payload)
/** His questions could not load. */
export const reportQuestionsFailure = (
  payload: Parameters<typeof FailedObserveQuestions>[0],
): Message => FailedObserveQuestions(payload)
/** The listener typed in the search box. */
export const searchQuestions = (
  payload: Parameters<typeof UpdatedQuestionSearch>[0],
): Message => UpdatedQuestionSearch(payload)
/** The listener chose which questions to list. */
export const filterQuestions = (
  payload: Parameters<typeof ClickedQuestionFilter>[0],
): Message => ClickedQuestionFilter(payload)
