import { Array, Match as M, Option } from 'effect'
import {
  Button,
  Column,
  Row,
  Text,
  TextInput,
  type UiNode,
} from 'foldkit/renderers'

import {
  CHORD_CHOICES,
  SECTION_KINDS,
  type Section,
  type Song,
  displayTitle,
  kindLabel,
  toChartText,
} from './domain/index.js'
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
  chordDraftText,
  lyricsDraftText,
  shownSongs,
  title,
} from './model.js'

const labelOf = (action: Action): string =>
  Option.getOrElse(Array.head(action.keys ?? []), () => tokenOf(action))

const lookingNodes = (looking: Looking): ReadonlyArray<UiNode> => [
  ...M.value(looking).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Idle: () => [Text('Idle')],
      Searching: searching => [Text('Searching'), Text(searching.query)],
    }),
  ),
  TextInput({
    placeholder: 'Search',
    token: 'search:',
    value: looking._tag === 'Idle' ? '' : looking.query,
  }),
]

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

const wordNodes = (section: Section): ReadonlyArray<UiNode> => {
  if (section.lines._tag === 'Empty') {
    return []
  }
  return Array.flatMap(section.lines.items, line => {
    if (line.body._tag === 'Blank') {
      return []
    }
    return Array.map(line.body.items, word =>
      Button({
        token: `word:${word.id}`,
        label: word.text,
      }),
    )
  })
}

const sectionNodes = (song: Song): ReadonlyArray<UiNode> => {
  const adders = Array.map(SECTION_KINDS, kind =>
    Button({
      token: `add:${kind}`,
      label: kindLabel(kind),
    }),
  )
  if (song.sections._tag === 'Empty') {
    return [Text('Empty'), ...adders]
  }
  return [
    ...Array.flatMap(song.sections.items, section => [
      Text(kindLabel(section.kind)),
      Button({
        token: `lyrics:${section.id}`,
        label: 'Lyrics',
      }),
      Button({
        token: `remove:${section.id}`,
        label: 'Remove',
      }),
      ...wordNodes(section),
    ]),
    ...adders,
  ]
}

const songFields = (song: Song): ReadonlyArray<UiNode> => [
  TextInput({
    placeholder: 'Title',
    token: 'title:',
    value: song.title._tag === 'Untitled' ? '' : song.title.name,
  }),
  TextInput({
    placeholder: 'Artist',
    token: 'artist:',
    value: song.artist._tag === 'None' ? '' : song.artist.name,
  }),
]

const focusNodes = (focus: Focus, song: Song): ReadonlyArray<UiNode> =>
  M.value(focus).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Viewing: () => [
        Text('Viewing'),
        ...songFields(song),
        ...sectionNodes(song),
      ],
      Lyrics: lyrics => [
        Text('Lyrics'),
        Text(kindLabel(lyrics.section.kind)),
        TextInput({
          placeholder: 'Lyrics',
          token: 'draft:',
          value: lyricsDraftText(lyrics.draft),
        }),
      ],
      Word: word => [
        Text('Word'),
        Text(word.word.text),
        TextInput({
          placeholder: 'Chord',
          token: 'chord:',
          value: chordDraftText(word.draft),
        }),
        ...Array.map(CHORD_CHOICES, choice =>
          Button({
            token: `chord:${choice}`,
            label: choice,
          }),
        ),
      ],
      Removing: removing => [
        Text('Removing'),
        Text(kindLabel(removing.section.kind)),
      ],
    }),
  )

const workingNodes = (working: Working, song: Song): ReadonlyArray<UiNode> =>
  M.value(working).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Editing: editing => [Text('Editing'), ...focusNodes(editing.focus, song)],
      Playing: () => [
        Text('Playing'),
        Text(displayTitle(song)),
        Text(toChartText(song)),
      ],
    }),
  )

const songRow = (song: Song): ReadonlyArray<UiNode> => [
  Text(displayTitle(song)),
  Button({
    token: `open:${song.id}`,
    label: `Open ${displayTitle(song)}`,
  }),
  Button({
    token: `play:${song.id}`,
    label: `Play ${displayTitle(song)}`,
  }),
  Button({
    token: `delete:${song.id}`,
    label: `Delete ${displayTitle(song)}`,
  }),
]

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
        ...Array.flatMap(shownSongs(shelf.songs, shelf.looking), songRow),
      ],
      Chart: chart => [
        Text('Chart'),
        Text(displayTitle(chart.current)),
        ...workingNodes(chart.working, chart.current),
      ],
      Unknown: unknown => [
        Text('Unknown'),
        Text(unknown.path),
        ...Array.flatMap(unknown.songs, songRow),
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
