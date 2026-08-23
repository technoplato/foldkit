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
  KeyNone,
  KeySome,
  Named,
  SECTION_KINDS,
  type SectionKind,
  Song,
  Untitled,
  addSection,
  blankSong,
  capoDown,
  capoUp,
  clearChord,
  emptySection,
  findSection,
  findSongWord,
  lyricsDraft,
  nextSectionId,
  parseChord,
  parsePitch,
  placeChord,
  printChord,
  removeSection,
  replaceLyrics,
  toChartText,
  transposeDown,
  transposeUp,
  updateSection,
} from './domain/index.js'
import {
  FailedCopiedChart,
  FailedGeneratedIds,
  type Message,
  SucceededCopiedChart,
  SucceededGeneratedIds,
} from './message.js'
import {
  type PopulatedChart as Chart,
  Confirming,
  DeletingIdle,
  DraftNone,
  DraftSome,
  Editing,
  EmptyShelf,
  EmptyUnknown,
  type Focus,
  Idle,
  LibraryEmpty,
  Lyrics,
  type Model,
  Playing,
  PopulatedChart,
  PopulatedShelf,
  PopulatedUnknown,
  Removing,
  Searching,
  Viewing,
  WordFocus,
  chordDraftFromText,
  failedNotice,
  findSong,
  lyricsDraftFromText,
  lyricsDraftText,
  replaceCurrent,
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

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const keep = (model: Model): UpdateReturn => [model, []]

const maybeChart = (model: Model): Option.Option<Chart> => {
  if (model.library._tag !== 'Populated') {
    return Option.none()
  }
  if (model.library.place._tag !== 'Chart') {
    return Option.none()
  }
  return Option.some(model.library.place)
}

const withChart = (model: Model, chart: Chart): Model =>
  withPlace(withoutNotice(model), chart)

const withCurrent = (model: Model, chart: Chart, current: Song): Model =>
  withChart(model, replaceCurrent(chart, current))

const withEditingFocus = (chart: Chart, focus: Focus): Chart =>
  PopulatedChart.make({
    ...chart,
    working: Editing.make({ focus }),
  })

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
      songs,
      looking: Idle(),
      deleting: DeletingIdle(),
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
        const asChart = (songs: ReturnType<typeof songsOfPopulated>) =>
          Option.match(zipperAt(songs, song), {
            onNone: () => keep(model),
            onSome: chart => [withChart(model, chart), []],
          })
        if (model.library._tag === 'Empty') {
          return asChart([song])
        }
        return asChart(
          Array.append(songsOfPopulated(model.library.place), song),
        )
      },
      FailedGeneratedIds: ({ reason }) => [
        failedNotice(model, 'New song failed', reason),
        [],
      ],
      ClickedShelf: () => {
        if (model.library._tag === 'Empty') {
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
        return [toShelf(model, songsOfPopulated(model.library.place)), []]
      },
      OpenedChart: ({ songId }) => {
        if (model.library._tag !== 'Populated') {
          return keep(model)
        }
        return Option.match(
          findSong(songsOfPopulated(model.library.place), songId),
          {
            onNone: () => keep(model),
            onSome: song =>
              Option.match(
                zipperAt(songsOfPopulated(model.library.place), song),
                {
                  onNone: () => keep(model),
                  onSome: chart => [withChart(model, chart), []],
                },
              ),
          },
        )
      },
      OpenedPlay: ({ songId }) => {
        if (model.library._tag !== 'Populated') {
          return keep(model)
        }
        return Option.match(
          findSong(songsOfPopulated(model.library.place), songId),
          {
            onNone: () => keep(model),
            onSome: song =>
              Option.match(
                zipperAt(songsOfPopulated(model.library.place), song),
                {
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
                },
              ),
          },
        )
      },
      OpenedUnknown: ({ path }) => {
        if (model.library._tag === 'Empty') {
          return [
            withLibrary(
              withoutNotice(model),
              LibraryEmpty.make({
                place: EmptyUnknown.make({ path }),
              }),
            ),
            [],
          ]
        }
        return [
          withPlace(
            withoutNotice(model),
            PopulatedUnknown.make({
              songs: songsOfPopulated(model.library.place),
              path,
            }),
          ),
          [],
        ]
      },
      RequestedDelete: ({ songId }) => {
        if (model.library._tag !== 'Populated') {
          return keep(model)
        }
        if (model.library.place._tag !== 'Shelf') {
          return keep(model)
        }
        return Option.match(findSong(model.library.place.songs, songId), {
          onNone: () => keep(model),
          onSome: song => [
            withPlace(
              withoutNotice(model),
              PopulatedShelf.make({
                ...model.library.place,
                deleting: Confirming.make({ song }),
              }),
            ),
            [],
          ],
        })
      },
      CancelledDelete: () => {
        if (model.library._tag !== 'Populated') {
          return keep(model)
        }
        if (model.library.place._tag !== 'Shelf') {
          return keep(model)
        }
        return [
          withPlace(
            withoutNotice(model),
            PopulatedShelf.make({
              ...model.library.place,
              deleting: DeletingIdle(),
            }),
          ),
          [],
        ]
      },
      ConfirmedDelete: () => {
        if (model.library._tag !== 'Populated') {
          return keep(model)
        }
        if (model.library.place._tag !== 'Shelf') {
          return keep(model)
        }
        if (model.library.place.deleting._tag !== 'Confirming') {
          return keep(model)
        }
        const removedId = model.library.place.deleting.song.id
        const remaining = Array.filter(
          model.library.place.songs,
          song => song.id !== removedId,
        )
        return Array.match(remaining, {
          onEmpty: () => [
            withLibrary(
              withoutNotice(model),
              LibraryEmpty.make({
                place: EmptyShelf.make({
                  looking: model.library.place.looking,
                }),
              }),
            ),
            [],
          ],
          onNonEmpty: songs => [
            withPlace(
              withoutNotice(model),
              PopulatedShelf.make({
                songs,
                looking: model.library.place.looking,
                deleting: DeletingIdle(),
              }),
            ),
            [],
          ],
        })
      },
      ClickedPlay: () =>
        Option.match(maybeChart(model), {
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
      ClickedEdit: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withChart(
              model,
              PopulatedChart.make({
                ...chart,
                working: Editing.make({ focus: Viewing() }),
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
          onSome: chart =>
            Option.match(findSection(chart.current, sectionId), {
              onNone: () => keep(model),
              onSome: section => [
                withChart(
                  model,
                  withEditingFocus(
                    chart,
                    Lyrics.make({
                      section,
                      draft: lyricsDraftFromText(lyricsDraft(section)),
                    }),
                  ),
                ),
                [],
              ],
            }),
        }),
      TypedLyrics: ({ text }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.working._tag !== 'Editing') {
              return keep(model)
            }
            if (chart.working.focus._tag !== 'Lyrics') {
              return keep(model)
            }
            return [
              withChart(
                model,
                withEditingFocus(
                  chart,
                  Lyrics.make({
                    section: chart.working.focus.section,
                    draft: lyricsDraftFromText(text),
                  }),
                ),
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
            if (chart.working.focus._tag !== 'Lyrics') {
              return keep(model)
            }
            const focus = chart.working.focus
            const nextSong = updateSection(
              chart.current,
              focus.section.id,
              section => replaceLyrics(section, lyricsDraftText(focus.draft)),
            )
            return [
              withChart(
                model,
                withEditingFocus(replaceCurrent(chart, nextSong), Viewing()),
              ),
              [],
            ]
          },
        }),
      CancelledLyrics: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withChart(model, withEditingFocus(chart, Viewing())),
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
                return [
                  withChart(
                    model,
                    withEditingFocus(
                      chart,
                      WordFocus.make({ word: found.word, draft }),
                    ),
                  ),
                  [],
                ]
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
            if (chart.working.focus._tag !== 'Word') {
              return keep(model)
            }
            const word = chart.working.focus.word
            const nextDraft = chordDraftFromText(text)
            const nextSong = Option.match(parseChord(text), {
              onNone: () => chart.current,
              onSome: chord => placeChord(chart.current, word, chord),
            })
            return [
              withChart(
                model,
                withEditingFocus(
                  replaceCurrent(chart, nextSong),
                  WordFocus.make({ word, draft: nextDraft }),
                ),
              ),
              [],
            ]
          },
        }),
      ClearedChord: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => {
            if (chart.working._tag !== 'Editing') {
              return keep(model)
            }
            if (chart.working.focus._tag !== 'Word') {
              return keep(model)
            }
            const nextSong = clearChord(
              chart.current,
              chart.working.focus.word.id,
            )
            return [
              withChart(
                model,
                withEditingFocus(replaceCurrent(chart, nextSong), Viewing()),
              ),
              [],
            ]
          },
        }),
      CancelledWord: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withChart(model, withEditingFocus(chart, Viewing())),
            [],
          ],
        }),
      RequestedRemove: ({ sectionId }) =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart =>
            Option.match(findSection(chart.current, sectionId), {
              onNone: () => keep(model),
              onSome: section => [
                withChart(
                  model,
                  withEditingFocus(chart, Removing.make({ section })),
                ),
                [],
              ],
            }),
        }),
      CancelledRemove: () =>
        Option.match(maybeChart(model), {
          onNone: () => keep(model),
          onSome: chart => [
            withChart(model, withEditingFocus(chart, Viewing())),
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
            if (chart.working.focus._tag !== 'Removing') {
              return keep(model)
            }
            const nextSong = removeSection(
              chart.current,
              chart.working.focus.section.id,
            )
            return [
              withChart(
                model,
                withEditingFocus(replaceCurrent(chart, nextSong), Viewing()),
              ),
              [],
            ]
          },
        }),
    }),
  )
