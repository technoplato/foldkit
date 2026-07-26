import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { Fact } from './model.js'

/** The user requested a new Fact. */
export const ClickedLoadFact = m('ClickedLoadFact')
/** The FetchFact Command returned one decoded Fact. */
export const SucceededFetchFact = m('SucceededFetchFact', { fact: Fact })
/** The FetchFact Command failed. */
export const FailedFetchFact = m('FailedFetchFact', { reason: S.String })

/** Every fact emitted by the Fact Program. */
export const Message = S.Union([
  ClickedLoadFact,
  SucceededFetchFact,
  FailedFetchFact,
])
/** Every fact emitted by the Fact Program. */
export type Message = typeof Message.Type
