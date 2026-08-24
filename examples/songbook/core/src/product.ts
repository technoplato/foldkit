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
  type Artist,
  CHORD_CHOICES,
  type Draft,
  SECTION_KINDS,
  type Section,
  Song,
  type Title,
  asSong,
  displayTitle,
  flattenSections,
  kindLabel,
  toChartText,
} from './domain/index.js'
import { type Action, actions, tokenOf } from './message.js'
import {
  type Chart,
  type Deleting,
  type Library,
  type Model,
  type Notice,
  type Page,
  Populated,
  type Search,
  currentSong,
  shownSongs,
  songsOfDeleting,
  title,
} from './model.js'

const labelOf = (action: Action): string =>
  Option.getOrElse(Array.head(action.keys ?? []), () => tokenOf(action))

const searchNodes = (search: Search): ReadonlyArray<UiNode> =>
  M.value(search).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Idle: () => [Text('Idle'), Text('Search')],
      Searching: searching => [
        Text('Searching'),
        Text(searching.query),
        TextInput({
          placeholder: 'Search',
          token: 'search:',
          value: searching.query,
        }),
      ],
    }),
  )

const draftNodes = (
  draft: Draft,
  placeholder: string,
  token: string,
): ReadonlyArray<UiNode> =>
  M.value(draft).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      None: () => [Text(placeholder)],
      Some: some => [
        TextInput({
          placeholder,
          token,
          value: some.text,
        }),
      ],
    }),
  )

const titleNodes = (title: Title): ReadonlyArray<UiNode> =>
  M.value(title).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Untitled: () => [Text('Title')],
      Named: named => [
        TextInput({
          placeholder: 'Title',
          token: 'title:',
          value: named.name,
        }),
      ],
    }),
  )

const artistNodes = (artist: Artist): ReadonlyArray<UiNode> =>
  M.value(artist).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      None: () => [Text('Artist')],
      Some: some => [
        TextInput({
          placeholder: 'Artist',
          token: 'artist:',
          value: some.name,
        }),
      ],
    }),
  )

const deletingNodes = (deleting: Deleting): ReadonlyArray<UiNode> =>
  M.value(deleting).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Idle: () => [Text('Idle')],
      Confirming: confirming => [
        Text('Confirming'),
        Text(displayTitle(confirming.current)),
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
  const bag = flattenSections(song.sections)
  if (bag._tag === 'Empty') {
    return [Text('Empty'), ...adders]
  }
  return [
    ...Array.flatMap(bag.items, section => [
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
  ...titleNodes(song.title),
  ...artistNodes(song.artist),
]

const viewingNodes = (song: Song): ReadonlyArray<UiNode> => [
  Text('Viewing'),
  ...songFields(song),
  ...sectionNodes(song),
]

const editingNodes = (song: Song): ReadonlyArray<UiNode> =>
  M.value(song.sections).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Empty: () => viewingNodes(song),
      Idle: () => viewingNodes(song),
      Lyrics: lyrics => [
        Text('Lyrics'),
        Text(kindLabel(lyrics.kind)),
        ...draftNodes(lyrics.draft, 'Lyrics', 'draft:'),
      ],
      Word: word => [
        Text('Word'),
        Text(word.word.text),
        ...draftNodes(word.draft, 'Chord', 'chord:'),
        ...Array.map(CHORD_CHOICES, choice =>
          Button({
            token: `chord:${choice}`,
            label: choice,
          }),
        ),
      ],
      Removing: removing => [
        Text('Removing'),
        Text(kindLabel(removing.current.kind)),
      ],
    }),
  )

const workNodes = (work: Chart['work']): ReadonlyArray<UiNode> =>
  M.value(work).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Editing: editing => [Text('Editing'), ...editingNodes(editing.current)],
      Playing: playing => [
        Text('Playing'),
        Text(displayTitle(playing.current)),
        Text(toChartText(asSong(playing.current))),
      ],
    }),
  )

const songRow = (song: typeof Song.Saved.Type): ReadonlyArray<UiNode> => [
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

const emptyPageNodes = (page: Page): ReadonlyArray<UiNode> =>
  M.value(page).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Shelf: shelf => [Text('Shelf'), ...searchNodes(shelf.search)],
      Unknown: unknown => [Text('Unknown'), Text(unknown.path)],
    }),
  )

const populatedPageNodes = (
  page: (typeof Populated.Type)['page'],
): ReadonlyArray<UiNode> =>
  M.value(page).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Shelf: shelf => [
        Text('Shelf'),
        ...searchNodes(shelf.search),
        ...deletingNodes(shelf.deleting),
        ...Array.flatMap(
          shownSongs(songsOfDeleting(shelf.deleting), shelf.search),
          songRow,
        ),
      ],
      Chart: chart => [
        Text('Chart'),
        Text(displayTitle(currentSong(chart))),
        ...workNodes(chart.work),
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
      Empty: empty => [Text('Empty'), ...emptyPageNodes(empty.page)],
      Populated: populated => [
        Text('Populated'),
        ...populatedPageNodes(populated.page),
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

/** Product tree: notice, library page, and valid Actions. */
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
