import { Match as M } from 'effect'
import type * as Command from 'foldkit/command'

import { type Message } from './message.js'
import { type Model } from './model.js'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

/** Applies one Songbook Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedNew: () => [model, []],
      SucceededGeneratedIds: () => [model, []],
      FailedGeneratedIds: () => [model, []],
      ClickedShelf: () => [model, []],
      OpenedChart: () => [model, []],
      OpenedPlay: () => [model, []],
      OpenedUnknown: () => [model, []],
      RequestedDelete: () => [model, []],
      CancelledDelete: () => [model, []],
      ConfirmedDelete: () => [model, []],
      ClickedPlay: () => [model, []],
      ClickedEdit: () => [model, []],
      ClickedTransposeUp: () => [model, []],
      ClickedTransposeDown: () => [model, []],
      ClickedCapoUp: () => [model, []],
      ClickedCapoDown: () => [model, []],
      ClickedCopy: () => [model, []],
      SucceededCopiedChart: () => [model, []],
      FailedCopiedChart: () => [model, []],
      DismissedNotice: () => [model, []],
      TypedSearch: () => [model, []],
      ClearedSearch: () => [model, []],
      NamedTitle: () => [model, []],
      ClearedTitle: () => [model, []],
      NamedArtist: () => [model, []],
      ClearedArtist: () => [model, []],
      ChoseKey: () => [model, []],
      ClearedKey: () => [model, []],
      AddedSection: () => [model, []],
      OpenedLyrics: () => [model, []],
      TypedLyrics: () => [model, []],
      AppliedLyrics: () => [model, []],
      CancelledLyrics: () => [model, []],
      OpenedWord: () => [model, []],
      TypedChord: () => [model, []],
      ClearedChord: () => [model, []],
      CancelledWord: () => [model, []],
      RequestedRemove: () => [model, []],
      CancelledRemove: () => [model, []],
      ConfirmedRemove: () => [model, []],
    }),
  )
