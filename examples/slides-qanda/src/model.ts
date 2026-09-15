import { Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { AnswerLog, Deck } from './domain'
import { AppRoute } from './route'

export const LoadingDeck = ts('Loading')
export const MissingDeck = ts('Missing')
export const ReadyDeck = ts('Ready', { deck: Deck })
export const ErrorDeck = ts('Error', { error: S.String })
export const DeckStatus = S.Union([
  LoadingDeck,
  MissingDeck,
  ReadyDeck,
  ErrorDeck,
])
export type DeckStatus = typeof DeckStatus.Type

export const SaveIdle = ts('Idle')
export const SaveBusy = ts('Saving')
export const SaveOk = ts('Saved', { preview: S.String })
export const SaveFail = ts('Failed', { error: S.String })
export const SaveStatus = S.Union([SaveIdle, SaveBusy, SaveOk, SaveFail])
export type SaveStatus = typeof SaveStatus.Type

export const FileIdle = ts('Idle')
export const FileBusy = ts('Loading')
export const FileReady = ts('Ready', { text: S.String })
export const FileFail = ts('Failed', { error: S.String })
export const FileStatus = S.Union([FileIdle, FileBusy, FileReady, FileFail])
export type FileStatus = typeof FileStatus.Type

export const Model = S.Struct({
  route: AppRoute,
  deckStatus: DeckStatus,
  saveStatus: SaveStatus,
  maybePointerStartX: S.Option(S.Number),
  fileCache: S.Record(S.String, FileStatus),
  answerLogs: S.Array(AnswerLog),
})
export type Model = typeof Model.Type

export const emptyModel = (route: AppRoute): Model =>
  Model.make({
    route,
    deckStatus: LoadingDeck(),
    saveStatus: SaveIdle(),
    maybePointerStartX: Option.none(),
    fileCache: {},
    answerLogs: [],
  })
