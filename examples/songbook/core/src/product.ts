import { Array, Match as M, Option } from 'effect'
import { Button, Column, Row, Text, type UiNode } from 'foldkit/renderers'

import { displayTitle, kindLabel, toChartText } from './domain/index.js'
import { type Action, actions, tokenOf } from './message.js'
import {
  type Deleting,
  type EmptyPlace,
  type Focus,
  type Library,
  type Looking,
  type Model,
  type Notice,
  type PopulatedPlace,
  type Working,
  shownSongs,
  title,
} from './model.js'

const labelOf = (action: Action): string =>
  Option.getOrElse(Array.head(action.keys ?? []), () => tokenOf(action))

const lookingNodes = (looking: Looking): ReadonlyArray<UiNode> =>
  M.value(looking).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Idle: () => [Text('Idle')],
      Searching: searching => [Text('Searching'), Text(searching.query)],
    }),
  )

const deletingNodes = (deleting: Deleting): ReadonlyArray<UiNode> =>
  M.value(deleting).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Idle: () => [Text('Idle')],
      Confirming: confirming => [
        Text('Confirming'),
        Text(displayTitle(confirming.song)),
      ],
    }),
  )

const focusNodes = (focus: Focus): ReadonlyArray<UiNode> =>
  M.value(focus).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Viewing: () => [Text('Viewing')],
      Lyrics: lyrics => [
        Text('Lyrics'),
        Text(kindLabel(lyrics.section.kind)),
        Text(lyrics.draft),
      ],
      Word: word => [
        Text('Word'),
        Text(word.word.text),
        ...M.value(word.draft).pipe(
          M.withReturnType<ReadonlyArray<UiNode>>(),
          M.tagsExhaustive({
            None: () => [Text('None')],
            Some: draft => [Text(draft.text)],
          }),
        ),
      ],
      Removing: removing => [
        Text('Removing'),
        Text(kindLabel(removing.section.kind)),
      ],
    }),
  )

const workingNodes = (
  working: Working,
  songTitle: string,
  chartText: string,
): ReadonlyArray<UiNode> =>
  M.value(working).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Editing: editing => [Text('Editing'), ...focusNodes(editing.focus)],
      Playing: () => [Text('Playing'), Text(songTitle), Text(chartText)],
    }),
  )

const emptyPlaceNodes = (place: EmptyPlace): ReadonlyArray<UiNode> =>
  M.value(place).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Shelf: shelf => [Text('Shelf'), ...lookingNodes(shelf.looking)],
      Unknown: unknown => [Text('Unknown'), Text(unknown.path)],
    }),
  )

const populatedPlaceNodes = (place: PopulatedPlace): ReadonlyArray<UiNode> =>
  M.value(place).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Shelf: shelf => [
        Text('Shelf'),
        ...lookingNodes(shelf.looking),
        ...deletingNodes(shelf.deleting),
        ...Array.map(shownSongs(shelf.songs, shelf.looking), song =>
          Text(displayTitle(song)),
        ),
      ],
      Chart: chart => [
        Text('Chart'),
        Text(displayTitle(chart.current)),
        ...workingNodes(
          chart.working,
          displayTitle(chart.current),
          toChartText(chart.current),
        ),
      ],
      Unknown: unknown => [
        Text('Unknown'),
        Text(unknown.path),
        ...Array.map(unknown.songs, song => Text(displayTitle(song))),
      ],
    }),
  )

const libraryNodes = (library: Library): ReadonlyArray<UiNode> =>
  M.value(library).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Empty: empty => [Text('Empty'), ...emptyPlaceNodes(empty.place)],
      Populated: populated => [
        Text('Populated'),
        ...populatedPlaceNodes(populated.place),
      ],
    }),
  )

const noticeNodes = (notice: Notice): ReadonlyArray<UiNode> =>
  M.value(notice).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      None: () => [Text('None')],
      Some: some => [
        Text('Some'),
        ...M.value(some.kind).pipe(
          M.withReturnType<ReadonlyArray<UiNode>>(),
          M.tagsExhaustive({
            Succeeded: () => [Text('Succeeded')],
            Failed: () => [Text('Failed')],
          }),
        ),
        Text(some.title),
        ...M.value(some.detail).pipe(
          M.withReturnType<ReadonlyArray<UiNode>>(),
          M.tagsExhaustive({
            None: () => [Text('None')],
            Some: detail => [Text(detail.text)],
          }),
        ),
      ],
    }),
  )

/** Product tree: notice, library place, and valid Actions. */
export const productView = (model: Model): UiNode => {
  const buttons = Array.map(
    Array.filter(actions, action => action.valid(model, {})),
    action =>
      Button({
        token: tokenOf(action),
        label: labelOf(action),
      }),
  )
  return Column(
    { gap: 1 },
    Text(title),
    ...noticeNodes(model.notice),
    ...libraryNodes(model.library),
    Row({}, ...buttons),
  )
}
