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
  Artist,
  Draft,
  Key,
  Lyrics,
  Named,
  type Sections,
  Song,
  Untitled,
  Word,
  addSection,
  asSong,
  blankSong,
  capoDown,
  capoUp,
  clearChord,
  draftOfSection,
  emptySection,
  findSection,
  findSongWord,
  flattenSections,
  flattenSong,
  lyricsAt,
  nextSectionId,
  printChord,
  removeSection,
  removingAt,
  toChartText,
  transposeDown,
  transposeUp,
  wordAt,
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
  Chart,
  Confirming,
  Deleting,
  Editing,
  Empty,
  Idle,
  type Model,
  Playing,
  Populated,
  currentSong,
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

type Shelf = typeof Populated.Shelf.Type

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const keep = (model: Model): UpdateReturn => [model, []]

const populatedPlaceOf = (
  model: Model,
): Option.Option<(typeof Populated.Type)['place']> =>
  M.value(model.library).pipe(
    M.withReturnType<Option.Option<(typeof Populated.Type)['place']>>(),
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

const withFlattened = (model: Model, chart: Chart, current: Song): Model =>
  withCurrent(model, chart, asSong(flattenSong(current)))

const withCurrentSections = (
  model: Model,
  chart: Chart,
  sections: Sections,
): Model =>
  withCurrent(model, chart, Song.make({ ...currentSong(chart), sections }))

const toShelf = (
  model: Model,
  songs: ReturnType<typeof songsOfPopulated>,
): Model =>
  withPlace(
    withoutNotice(model),
    Populated.Shelf.make({
      looking: Idle(),
      deleting: Deleting.Idle.make({ songs }),
    }),
  )

/** Applies one Songbook Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedNew: () => [model, [GenerateIds()]],
      SucceededGeneratedIds: ({ songId }) => {
        const song = flattenSong(blankSong(songId))
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
              Empty.make({
                place: Empty.Shelf.make({ looking: Idle() }),
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
                      Chart.make({
                        before: chart.before,
                        after: chart.after,
                        use: Playing.make({
                          current: song,
                        }),
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
              Empty.make({
                place: Empty.Unknown.make({ path }),
              }),
            ),
            [],
          ],
          onSome: place => [
            withPlace(
              withoutNotice(model),
              Populated.Unknown.make({
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
                      Populated.Shelf.make({
                        looking: shelf.looking,
                        deleting: Confirming.make({
                          before: chart.before,
                          current: song,
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
              Populated.Shelf.make({
                looking: shelf.looking,
                deleting: Deleting.Idle.make({
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
                  Empty.make({
                    place: Empty.Shelf.make({
                      looking: shelf.looking,
                    }),
                  }),
                ),
                [],
              ],
              onNonEmpty: songs => [
                withPlace(
                  withoutNotice(model),
                  Populated.Shelf.make({
                    looking: shelf.looking,
                    deleting: Deleting.Idle.make({ songs }),
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
              Chart.make({
                before: chart.before,
                after: chart.after,
                use: Playing.make({
                  current: flattenSong(currentSong(chart)),
                }),
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
              Chart.make({
                before: chart.before,
                after: chart.after,
                use: Editing.make({
                  current: asSong(flattenSong(currentSong(chart))),
                }),
              }),
            ),
            [],
          ],
        }),
      ClickedTransposeUp: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, transposeUp(currentSong(chart))),
            [],
          ],
        }),
      ClickedTransposeDown: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, transposeDown(currentSong(chart))),
            [],
          ],
        }),
      ClickedCapoUp: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, capoUp(currentSong(chart))),
            [],
          ],
        }),
      ClickedCapoDown: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(model, chart, capoDown(currentSong(chart))),
            [],
          ],
        }),
      ClickedCopy: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [model, [CopyChart({ song: currentSong(chart) })]],
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
      TypedSearch: ({ looking }) => {
        if (model.library._tag === 'Empty') {
          if (model.library.place._tag !== 'Shelf') {
            return keep(model)
          }
          return [
            withLibrary(
              withoutNotice(model),
              Empty.make({
                place: Empty.Shelf.make({ looking }),
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
            Populated.Shelf.make({
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
              Empty.make({
                place: Empty.Shelf.make({ looking: Idle() }),
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
            Populated.Shelf.make({
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
              Song.make({ ...currentSong(chart), title: Named.make({ name }) }),
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
              Song.make({ ...currentSong(chart), title: Untitled() }),
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
                ...currentSong(chart),
                artist: Artist.Some.make({ name }),
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
              Song.make({ ...currentSong(chart), artist: Artist.None() }),
            ),
            [],
          ],
        }),
      ChoseKey: ({ pitch }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(
              model,
              chart,
              Song.make({
                ...currentSong(chart),
                key: Key.Some.make({ pitch }),
              }),
            ),
            [],
          ],
        }),
      ClearedKey: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(
              model,
              chart,
              Song.make({ ...currentSong(chart), key: Key.None() }),
            ),
            [],
          ],
        }),
      AddedSection: ({ kind }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withCurrent(
              model,
              chart,
              addSection(
                currentSong(chart),
                emptySection(nextSectionId(currentSong(chart)), kind),
              ),
            ),
            [],
          ],
        }),
      OpenedLyrics: ({ sectionId }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            const bag = flattenSections(currentSong(chart).sections)
            if (bag._tag === 'Empty') {
              return keep(model)
            }
            return Option.match(findSection(currentSong(chart), sectionId), {
              onNone: () => keep(model),
              onSome: section =>
                Option.match(
                  lyricsAt(bag.items, section, draftOfSection(section)),
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
      TypedLyrics: ({ draft }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.use._tag !== 'Editing') {
              return keep(model)
            }
            const sections = currentSong(chart).sections
            if (sections._tag !== 'Lyrics') {
              return keep(model)
            }
            return [
              withCurrentSections(
                model,
                chart,
                Lyrics.make({
                  ...sections,
                  draft,
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
            if (chart.use._tag !== 'Editing') {
              return keep(model)
            }
            if (currentSong(chart).sections._tag !== 'Lyrics') {
              return keep(model)
            }
            return [withFlattened(model, chart, currentSong(chart)), []]
          },
        }),
      CancelledLyrics: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withFlattened(model, chart, currentSong(chart)),
            [],
          ],
        }),
      OpenedWord: ({ wordId }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart =>
            Option.match(findSongWord(currentSong(chart), wordId), {
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
                  onNone: () => Draft.None(),
                  onSome: placed =>
                    Draft.Some.make({
                      text: NonEmptyString.make(printChord(placed.chord)),
                    }),
                })
                return Option.match(wordAt(currentSong(chart), wordId, draft), {
                  onNone: () => keep(model),
                  onSome: word => [withCurrentSections(model, chart, word), []],
                })
              },
            }),
        }),
      TypedChord: ({ draft }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.use._tag !== 'Editing') {
              return keep(model)
            }
            const sections = currentSong(chart).sections
            if (sections._tag !== 'Word') {
              return keep(model)
            }
            return [
              withCurrentSections(
                model,
                chart,
                Word.make({
                  ...sections,
                  draft,
                }),
              ),
              [],
            ]
          },
        }),
      ClearedChord: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.use._tag !== 'Editing') {
              return keep(model)
            }
            const sections = currentSong(chart).sections
            if (sections._tag !== 'Word') {
              return keep(model)
            }
            const nextSong = clearChord(currentSong(chart), sections.word.id)
            return [withFlattened(model, chart, nextSong), []]
          },
        }),
      CancelledWord: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withFlattened(model, chart, currentSong(chart)),
            [],
          ],
        }),
      RequestedRemove: ({ sectionId }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            const bag = flattenSections(currentSong(chart).sections)
            if (bag._tag === 'Empty') {
              return keep(model)
            }
            return Option.match(findSection(currentSong(chart), sectionId), {
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
            withFlattened(model, chart, currentSong(chart)),
            [],
          ],
        }),
      ConfirmedRemove: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.use._tag !== 'Editing') {
              return keep(model)
            }
            const sections = currentSong(chart).sections
            if (sections._tag !== 'Removing') {
              return keep(model)
            }
            const nextSong = removeSection(
              currentSong(chart),
              sections.current.id,
            )
            return [withFlattened(model, chart, nextSong), []]
          },
        }),
    }),
  )
