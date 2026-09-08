import { Schema as S } from 'effect'
import { m } from 'foldkit/message'
import { UrlRequest } from 'foldkit/navigation'
import { Url } from 'foldkit/url'

import { AnswerLog, ChoiceLetter, Deck, SlideId, Turn } from './domain'

export const CompletedNavigateInternal = m('CompletedNavigateInternal')
export const CompletedLoadExternal = m('CompletedLoadExternal')
export const ClickedLink = m('ClickedLink', { request: UrlRequest })
export const ChangedUrl = m('ChangedUrl', { url: Url })

export const PressedTurn = m('PressedTurn', { turn: Turn })
export const PressedFilter = m('PressedFilter')
export const PressedFollowUp = m('PressedFollowUp')
export const PressedRoot = m('PressedRoot')
export const BeganPointer = m('BeganPointer', { x: S.Number })
export const EndedPointer = m('EndedPointer', { x: S.Number })
export const PastedText = m('PastedText', { text: S.String })
export const ClickedChoice = m('ClickedChoice', { letter: ChoiceLetter })
export const HeardWatch = m('HeardWatch', {
  kind: S.Literals(['deck', 'answers']),
})

export const SucceededFetchDeck = m('SucceededFetchDeck', { deck: Deck })
export const FailedFetchDeck = m('FailedFetchDeck', { error: S.String })
export const SucceededSaveDeck = m('SucceededSaveDeck', { deck: Deck })
export const FailedSaveDeck = m('FailedSaveDeck', { error: S.String })

export const SucceededSaveAnswer = m('SucceededSaveAnswer', {
  log: AnswerLog,
})
export const FailedSaveAnswer = m('FailedSaveAnswer', { error: S.String })
export const SucceededFetchAnswer = m('SucceededFetchAnswer', {
  log: AnswerLog,
})
export const MissedFetchAnswer = m('MissedFetchAnswer', { slideId: SlideId })
export const FailedFetchAnswer = m('FailedFetchAnswer', { error: S.String })
export const SucceededFetchAnswers = m('SucceededFetchAnswers', {
  logs: S.Array(AnswerLog),
})
export const FailedFetchAnswers = m('FailedFetchAnswers', { error: S.String })

export const Message = S.Union([
  CompletedNavigateInternal,
  CompletedLoadExternal,
  ClickedLink,
  ChangedUrl,
  PressedTurn,
  PressedFilter,
  PressedFollowUp,
  PressedRoot,
  BeganPointer,
  EndedPointer,
  PastedText,
  ClickedChoice,
  HeardWatch,
  SucceededFetchDeck,
  FailedFetchDeck,
  SucceededSaveDeck,
  FailedSaveDeck,
  SucceededSaveAnswer,
  FailedSaveAnswer,
  SucceededFetchAnswer,
  MissedFetchAnswer,
  FailedFetchAnswer,
  SucceededFetchAnswers,
  FailedFetchAnswers,
])
export type Message = typeof Message.Type
