import {
  Array,
  Effect,
  Match as M,
  Option,
  Random,
  String as Str,
} from 'effect'
import { Command } from 'foldkit'
import { NonEmptyString } from 'foldkit/adt'

import {
  ArtistNone,
  ArtistSome,
  DraftNone,
  DraftSome,
  KeyNone,
  KeySome,
  Lyrics,
  Named,
  SECTION_KINDS,
  type SectionKind,
  type Sections,
  SectionsIdle,
  Song,
  Untitled,
  WordFocus,
  addSection,
  blankSong,
  capoDown,
  capoUp,
  clearChord,
  draftFromText,
  draftText,
  emptySection,
  findSection,
  findSongWord,
  flattenSections,
  flattenSong,
  lyricsAt,
  lyricsDraft,
  nextSectionId,
  parseChord,
  parsePitch,
  placeChord,
  printChord,
  removeSection,
  removingAt,
  replaceLyrics,
  toChartText,
  transposeDown,
  transposeUp,
  wordFocusAt,
  zipperItems,
} from './domain/index.js'
import {
  FailedCopiedChart,
  FailedGeneratedIds,
  type Message,
  SucceededCopiedChart,
  SucceededGeneratedIds,
} from './message.js'
import {
  Confirming,
  DeletingIdle,
  Editing,
  EmptyShelf,
  EmptyUnknown,
  Idle,
  LibraryEmpty,
  type Model,
  Playing,
  PopulatedChart,
  type PopulatedPlace,
  PopulatedShelf,
  PopulatedUnknown,
  Searching,
  failedNotice,
  findSong,
  replaceCurrent,
  songsOfDeleting,
  songsOfPopulated,
  succeededNotice,
  withLibrary,
  withPlace,
  withoutNotice,
  zipperAt,
} from './model.js'

// COMMAND

/** Creates replay-safe ids for a new untitled song. */
export const GenerateIds = Command.define(
  'GenerateIds',
  SucceededGeneratedIds,
  FailedGeneratedIds,
)(
  Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER).pipe(
    Effect.map(value =>
      SucceededGeneratedIds({
        songId: NonEmptyString.make(`song-${value.toString(36)}`),
      }),
    ),
    Effect.catch(() =>
      Effect.succeed(
        FailedGeneratedIds({
          reason: NonEmptyString.make('Could not create a song id'),
        }),
      ),
    ),
  ),
)

/** Formats the open chart as copyable text. */
export const CopyChart = Command.define(
  'CopyChart',
  { song: Song },
  SucceededCopiedChart,
  FailedCopiedChart,
)(({ song }) => {
  const text = toChartText(song)
  if (Str.isEmpty(text)) {
    return Effect.succeed(
      FailedCopiedChart({
        reason: NonEmptyString.make('Chart text was empty'),
      }),
    )
  }
  return Effect.succeed(
    SucceededCopiedChart({ text: NonEmptyString.make(text) }),
  )
})

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

type Chart = typeof PopulatedChart.Type
type Shelf = typeof PopulatedShelf.Type

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const keep = (model: Model): UpdateReturn => [model, []]

const populatedPlaceOf = (model: Model): Option.Option<PopulatedPlace> =>
  M.value(model.library).pipe(
    M.withReturnType<Option.Option<PopulatedPlace>>(),
    M.tagsExhaustive({
      Empty: () => Option.none(),
      Populated: populated => Option.some(populated.place),
    }),
  )

const populatedShelfOf = (model: Model): Option.Option<Shelf> =>
  Option.flatMap(populatedPlaceOf(model), place =>
    place._tag === 'Shelf' ? Option.some(place) : Option.none(),
  )

const maybeChart = (model: Model): Option.Option<Chart> =>
  Option.flatMap(populatedPlaceOf(model), place =>
    place._tag === 'Chart' ? Option.some(place) : Option.none(),
  )

const withChart = (model: Model, chart: Chart): Model =>
  withPlace(withoutNotice(model), chart)

const withCurrent = (model: Model, chart: Chart, current: Song): Model =>
  withChart(model, replaceCurrent(chart, current))

const withCurrentSections = (
  model: Model,
  chart: Chart,
  sections: Sections,
): Model => withCurrent(model, chart, Song.make({ ...chart.current, sections }))

const lookingOf = (query: string) =>
  Str.isEmpty(query)
    ? Idle()
    : Searching.make({ query: NonEmptyString.make(query) })

const kindOf = (name: string): Option.Option<SectionKind> =>
  Array.findFirst(SECTION_KINDS, kind => kind === name)

const toShelf = (
  model: Model,
  songs: ReturnType<typeof songsOfPopulated>,
): Model =>
  withPlace(
    withoutNotice(model),
    PopulatedShelf.make({
      looking: Idle(),
      deleting: DeletingIdle.make({ songs }),
    }),
  )

/** Applies one Songbook Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedNew: () => [model, [GenerateIds()]],
      SucceededGeneratedIds: ({ songId }) => {
        const song = blankSong(songId)
        const asChart = (
          songs: ReturnType<typeof songsOfPopulated>,
        ): UpdateReturn =>
          Option.match(zipperAt(songs, song), {
            onNone: () => keep(model),
            onSome: chart => [withChart(model, chart), []],
          })
        return Option.match(populatedPlaceOf(model), {
          onNone: () => asChart([song]),
          onSome: place => asChart(Array.append(songsOfPopulated(place), song)),
        })
      },
      FailedGeneratedIds: ({ reason }) => [
        failedNotice(model, 'New song failed', reason),
        [],
      ],
      ClickedShelf: () =>
        Option.match(populatedPlaceOf(model), {
          onNone: () => [
            withLibrary(
              withoutNotice(model),
              LibraryEmpty.make({
                place: EmptyShelf.make({ looking: Idle() }),
              }),
            ),
            [],
          ],
          onSome: place => [toShelf(model, songsOfPopulated(place)), []],
        }),
      OpenedChart: ({ songId }) =>
        Option.match(populatedPlaceOf(model), {
          onNone: () => keep(model),
          onSome: place => {
            const songs = songsOfPopulated(place)
            return Option.match(findSong(songs, songId), {
              onNone: () => keep(model),
              onSome: song =>
                Option.match(zipperAt(songs, song), {
                  onNone: () => keep(model),
                  onSome: chart => [withChart(model, chart), []],
                }),
            })
          },
        }),
      OpenedPlay: ({ songId }) =>
        Option.match(populatedPlaceOf(model), {
          onNone: () => keep(model),
          onSome: place => {
            const songs = songsOfPopulated(place)
            return Option.match(findSong(songs, songId), {
              onNone: () => keep(model),
              onSome: song =>
                Option.match(zipperAt(songs, song), {
                  onNone: () => keep(model),
                  onSome: chart => [
                    withChart(
                      model,
                      PopulatedChart.make({
                        ...chart,
                        working: Playing(),
                      }),
                    ),
                    [],
                  ],
                }),
            })
          },
        }),
      OpenedUnknown: ({ path }) =>
        Option.match(populatedPlaceOf(model), {
          onNone: () => [
            withLibrary(
              withoutNotice(model),
              LibraryEmpty.make({
                place: EmptyUnknown.make({ path }),
              }),
            ),
            [],
          ],
          onSome: place => [
            withPlace(
              withoutNotice(model),
              PopulatedUnknown.make({
                songs: songsOfPopulated(place),
                path,
              }),
            ),
            [],
          ],
        }),
      RequestedDelete: ({ songId }) =>
        Option.match(populatedShelfOf(model), {
          onNone: () => keep(model),
          onSome: shelf => {
            const songs = songsOfDeleting(shelf.deleting)
            return Option.match(findSong(songs, songId), {
              onNone: () => keep(model),
              onSome: song =>
                Option.match(zipperAt(songs, song), {
                  onNone: () => keep(model),
                  onSome: chart => [
                    withPlace(
                      withoutNotice(model),
                      PopulatedShelf.make({
                        looking: shelf.looking,
                        deleting: Confirming.make({
                          before: chart.before,
                          current: chart.current,
                          after: chart.after,
                        }),
                      }),
                    ),
                    [],
                  ],
                }),
            })
          },
        }),
      CancelledDelete: () =>
        Option.match(populatedShelfOf(model), {
          onNone: () => keep(model),
          onSome: shelf => [
            withPlace(
              withoutNotice(model),
              PopulatedShelf.make({
                looking: shelf.looking,
                deleting: DeletingIdle.make({
                  songs: songsOfDeleting(shelf.deleting),
                }),
              }),
            ),
            [],
          ],
        }),
      ConfirmedDelete: () =>
        Option.match(populatedShelfOf(model), {
          onNone: () => keep(model),
          onSome: shelf => {
            if (shelf.deleting._tag !== 'Confirming') {
              return keep(model)
            }
            const confirming = shelf.deleting
            const remaining = Array.filter(
              zipperItems(
                confirming.before,
                confirming.current,
                confirming.after,
              ),
              song => song.id !== confirming.current.id,
            )
            return Array.match(remaining, {
              onEmpty: () => [
                withLibrary(
                  withoutNotice(model),
                  LibraryEmpty.make({
                    place: EmptyShelf.make({
                      looking: shelf.looking,
                    }),
                  }),
                ),
                [],
              ],
              onNonEmpty: songs => [
                withPlace(
                  withoutNotice(model),
                  PopulatedShelf.make({
                    looking: shelf.looking,
                    deleting: DeletingIdle.make({ songs }),
                  }),
                ),
                [],
              ],
            })
          },
        }),
      ClickedPlay: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withChart(
              model,
              PopulatedChart.make({
                ...chart,
                current: flattenSong(chart.current),
                working: Playing(),
              }),
            ),
            [],
          ],
        }),
      ClickedEdit: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withChart(
              model,
              PopulatedChart.make({
                ...chart,
                current: flattenSong(chart.current),
                working: Editing(),
              }),
            ),
            [],
          ],
        }),
      ClickedTransposeUp: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, transposeUp(chart.current)),
            [],
          ],
        }),
      ClickedTransposeDown: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, transposeDown(chart.current)),
            [],
          ],
        }),
      ClickedCapoUp: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, capoUp(chart.current)),
            [],
          ],
        }),
      ClickedCapoDown: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, capoDown(chart.current)),
            [],
          ],
        }),
      ClickedCopy: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [model, [CopyChart({ song: chart.current })]],
        }),
      SucceededCopiedChart: ({ text }) => [
        succeededNotice(model, 'Copied', text),
        [],
      ],
      FailedCopiedChart: ({ reason }) => [
        failedNotice(model, 'Copy failed', reason),
        [],
      ],
      DismissedNotice: () => [withoutNotice(model), []],
      TypedSearch: ({ query }) => {
        const looking = lookingOf(query)
        if (model.library._tag === 'Empty') {
          if (model.library.place._tag !== 'Shelf') {
            return keep(model)
          }
          return [
            withLibrary(
              withoutNotice(model),
              LibraryEmpty.make({
                place: EmptyShelf.make({ looking }),
              }),
            ),
            [],
          ]
        }
        if (model.library.place._tag !== 'Shelf') {
          return keep(model)
        }
        return [
          withPlace(
            withoutNotice(model),
            PopulatedShelf.make({
              ...model.library.place,
              looking,
            }),
          ),
          [],
        ]
      },
      ClearedSearch: () => {
        if (model.library._tag === 'Empty') {
          if (model.library.place._tag !== 'Shelf') {
            return keep(model)
          }
          return [
            withLibrary(
              withoutNotice(model),
              LibraryEmpty.make({
                place: EmptyShelf.make({ looking: Idle() }),
              }),
            ),
            [],
          ]
        }
        if (model.library.place._tag !== 'Shelf') {
          return keep(model)
        }
        return [
          withPlace(
            withoutNotice(model),
            PopulatedShelf.make({
              ...model.library.place,
              looking: Idle(),
            }),
          ),
          [],
        ]
      },
      NamedTitle: ({ name }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(
              model,
              chart,
              Song.make({ ...chart.current, title: Named.make({ name }) }),
            ),
            [],
          ],
        }),
      ClearedTitle: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(
              model,
              chart,
              Song.make({ ...chart.current, title: Untitled() }),
            ),
            [],
          ],
        }),
      NamedArtist: ({ name }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(
              model,
              chart,
              Song.make({
                ...chart.current,
                artist: ArtistSome.make({ name }),
              }),
            ),
            [],
          ],
        }),
      ClearedArtist: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(
              model,
              chart,
              Song.make({ ...chart.current, artist: ArtistNone() }),
            ),
            [],
          ],
        }),
      ChoseKey: ({ pitch }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart =>
            Option.match(parsePitch(pitch), {
              onNone: () => [failedNotice(model, 'Unknown key', pitch), []],
              onSome: parsed => [
                withCurrent(
                  model,
                  chart,
                  Song.make({
                    ...chart.current,
                    key: KeySome.make({ pitch: parsed }),
                  }),
                ),
                [],
              ],
            }),
        }),
      ClearedKey: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(
              model,
              chart,
              Song.make({ ...chart.current, key: KeyNone() }),
            ),
            [],
          ],
        }),
      AddedSection: ({ kind }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart =>
            Option.match(kindOf(kind), {
              onNone: () => [failedNotice(model, 'Unknown section', kind), []],
              onSome: parsed => [
                withCurrent(
                  model,
                  chart,
                  addSection(
                    chart.current,
                    emptySection(nextSectionId(chart.current), parsed),
                  ),
                ),
                [],
              ],
            }),
        }),
      OpenedLyrics: ({ sectionId }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            const bag = flattenSections(chart.current.sections)
            if (bag._tag === 'Empty') {
              return keep(model)
            }
            return Option.match(findSection(chart.current, sectionId), {
              onNone: () => keep(model),
              onSome: section =>
                Option.match(
                  lyricsAt(
                    bag.items,
                    section,
                    draftFromText(lyricsDraft(section)),
                  ),
                  {
                    onNone: () => keep(model),
                    onSome: lyrics => [
                      withCurrentSections(model, chart, lyrics),
                      [],
                    ],
                  },
                ),
            })
          },
        }),
      TypedLyrics: ({ text }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.working._tag !== 'Editing') {
              return keep(model)
            }
            const sections = chart.current.sections
            if (sections._tag !== 'Lyrics') {
              return keep(model)
            }
            return [
              withCurrentSections(
                model,
                chart,
                Lyrics.make({
                  ...sections,
                  draft: draftFromText(text),
                }),
              ),
              [],
            ]
          },
        }),
      AppliedLyrics: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.working._tag !== 'Editing') {
              return keep(model)
            }
            const sections = chart.current.sections
            if (sections._tag !== 'Lyrics') {
              return keep(model)
            }
            const nextSection = replaceLyrics(
              sections.current,
              draftText(sections.draft),
            )
            return [
              withCurrentSections(
                model,
                chart,
                SectionsIdle.make({
                  items: zipperItems(
                    sections.before,
                    nextSection,
                    sections.after,
                  ),
                }),
              ),
              [],
            ]
          },
        }),
      CancelledLyrics: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, flattenSong(chart.current)),
            [],
          ],
        }),
      OpenedWord: ({ wordId }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart =>
            Option.match(findSongWord(chart.current, wordId), {
              onNone: () => keep(model),
              onSome: found => {
                const maybePlaced =
                  found.line.body._tag === 'Words' &&
                  found.line.body.chords._tag === 'Some'
                    ? Array.findFirst(
                        found.line.body.chords.items,
                        item => item.word.id === found.word.id,
                      )
                    : Option.none()
                const draft = Option.match(maybePlaced, {
                  onNone: () => DraftNone(),
                  onSome: placed =>
                    DraftSome.make({
                      text: NonEmptyString.make(printChord(placed.chord)),
                    }),
                })
                return Option.match(wordFocusAt(chart.current, wordId, draft), {
                  onNone: () => keep(model),
                  onSome: word => [withCurrentSections(model, chart, word), []],
                })
              },
            }),
        }),
      TypedChord: ({ text }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.working._tag !== 'Editing') {
              return keep(model)
            }
            const sections = chart.current.sections
            if (sections._tag !== 'Word') {
              return keep(model)
            }
            const word = sections.word
            const nextDraft = draftFromText(text)
            return Option.match(parseChord(text), {
              onNone: () => [
                withCurrentSections(
                  model,
                  chart,
                  WordFocus.make({
                    ...sections,
                    draft: nextDraft,
                  }),
                ),
                [],
              ],
              onSome: chord => {
                const nextSong = placeChord(chart.current, word, chord)
                return Option.match(wordFocusAt(nextSong, word.id, nextDraft), {
                  onNone: () => [
                    withCurrent(model, chart, flattenSong(nextSong)),
                    [],
                  ],
                  onSome: nextWord => [
                    withCurrentSections(
                      model,
                      replaceCurrent(chart, nextSong),
                      nextWord,
                    ),
                    [],
                  ],
                })
              },
            })
          },
        }),
      ClearedChord: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.working._tag !== 'Editing') {
              return keep(model)
            }
            const sections = chart.current.sections
            if (sections._tag !== 'Word') {
              return keep(model)
            }
            const nextSong = clearChord(chart.current, sections.word.id)
            return [withCurrent(model, chart, flattenSong(nextSong)), []]
          },
        }),
      CancelledWord: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, flattenSong(chart.current)),
            [],
          ],
        }),
      RequestedRemove: ({ sectionId }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            const bag = flattenSections(chart.current.sections)
            if (bag._tag === 'Empty') {
              return keep(model)
            }
            return Option.match(findSection(chart.current, sectionId), {
              onNone: () => keep(model),
              onSome: section =>
                Option.match(removingAt(bag.items, section), {
                  onNone: () => keep(model),
                  onSome: removing => [
                    withCurrentSections(model, chart, removing),
                    [],
                  ],
                }),
            })
          },
        }),
      CancelledRemove: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, flattenSong(chart.current)),
            [],
          ],
        }),
      ConfirmedRemove: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.working._tag !== 'Editing') {
              return keep(model)
            }
            const sections = chart.current.sections
            if (sections._tag !== 'Removing') {
              return keep(model)
            }
            const nextSong = removeSection(chart.current, sections.current.id)
            return [withCurrent(model, chart, flattenSong(nextSong)), []]
          },
        }),
    }),
  )
