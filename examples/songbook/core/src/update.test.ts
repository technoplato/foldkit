import { Array, Option } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { buttonsOf, inputsOf, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import * as Domain from './domain/index.js'
import { Draft, Song, draftFromText } from './domain/index.js'
import {
  AddedSection,
  AppliedLyrics,
  CancelledWord,
  ChoseKey,
  ClearedArtist,
  ClickedCapoUp,
  ClickedCopy,
  ClickedEdit,
  ClickedNew,
  ClickedPlay,
  ClickedShelf,
  ClickedTransposeUp,
  ConfirmedDelete,
  NamedArtist,
  NamedTitle,
  OpenedLyrics,
  OpenedWord,
  RequestedDelete,
  SucceededGeneratedIds,
  TypedChord,
  TypedLyrics,
  TypedSearch,
  messageFromToken,
} from './message.js'
import * as Model from './model.js'
import { Searching, emptyModel, flattenSong, zipperItems } from './model.js'
import { songbookScreen } from './program.js'
import { update } from './update.js'

describe('songbook update', () => {
  it('creates a named chart and applies lyrics from a typed draft', () => {
    const empty = emptyModel()
    const [, createCommands] = update(empty, ClickedNew())
    expect(createCommands[0]?.name).toBe('GenerateIds')

    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    expect(created.library._tag).toBe('Populated')
    if (created.library._tag !== 'Populated') {
      return
    }
    expect(created.library.page._tag).toBe('Chart')
    if (created.library.page._tag !== 'Chart') {
      return
    }
    expect(created.library.page.work._tag).toBe('Editing')
    if (created.library.page.work._tag !== 'Editing') {
      return
    }
    expect(created.library.page.work.current.title._tag).toBe('Untitled')

    const [named] = update(created, NamedTitle({ name: 'Midnight Train' }))
    expect(named.library._tag).toBe('Populated')
    if (
      named.library._tag !== 'Populated' ||
      named.library.page._tag !== 'Chart'
    ) {
      return
    }
    expect(named.library.page.work._tag).toBe('Editing')
    if (named.library.page.work._tag !== 'Editing') {
      return
    }
    expect(named.library.page.work.current.title._tag).toBe('Named')
    if (named.library.page.work.current.title._tag === 'Named') {
      expect(named.library.page.work.current.title.name).toBe('Midnight Train')
    }

    const [withSection] = update(named, AddedSection({ kind: 'Verse' }))
    expect(withSection.library._tag).toBe('Populated')
    if (
      withSection.library._tag !== 'Populated' ||
      withSection.library.page._tag !== 'Chart'
    ) {
      return
    }
    expect(withSection.library.page.work._tag).toBe('Editing')
    if (withSection.library.page.work._tag !== 'Editing') {
      return
    }
    expect(withSection.library.page.work.current.sections._tag).toBe('Idle')
    if (withSection.library.page.work.current.sections._tag !== 'Idle') {
      return
    }
    const maybeSection = Array.head(
      withSection.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybeSection)).toBe(true)
    if (Option.isNone(maybeSection)) {
      return
    }

    const [lyrics] = update(
      withSection,
      OpenedLyrics({ sectionId: maybeSection.value.id }),
    )
    expect(lyrics.library._tag).toBe('Populated')
    if (
      lyrics.library._tag !== 'Populated' ||
      lyrics.library.page._tag !== 'Chart'
    ) {
      return
    }
    expect(lyrics.library.page.work._tag).toBe('Editing')
    if (lyrics.library.page.work._tag !== 'Editing') {
      return
    }
    expect(lyrics.library.page.work.current.sections._tag).toBe('Lyrics')
    if (lyrics.library.page.work.current.sections._tag !== 'Lyrics') {
      return
    }
    expect(lyrics.library.page.work.current.sections.draft._tag).toBe('None')
    expect(lyrics.library.page.work.current.sections.id).toBe(
      maybeSection.value.id,
    )
    expect('current' in lyrics.library.page.work.current.sections).toBe(false)

    const [drafted] = update(
      lyrics,
      TypedLyrics({ draft: draftFromText('going away') }),
    )
    expect(drafted.library._tag).toBe('Populated')
    if (
      drafted.library._tag !== 'Populated' ||
      drafted.library.page._tag !== 'Chart' ||
      drafted.library.page.work._tag !== 'Editing' ||
      drafted.library.page.work.current.sections._tag !== 'Lyrics'
    ) {
      return
    }
    expect(drafted.library.page.work.current.sections.draft._tag).toBe('Some')

    const [applied] = update(drafted, AppliedLyrics())
    expect(applied.library._tag).toBe('Populated')
    if (
      applied.library._tag !== 'Populated' ||
      applied.library.page._tag !== 'Chart'
    ) {
      return
    }
    expect(applied.library.page.work._tag).toBe('Editing')
    if (applied.library.page.work._tag !== 'Editing') {
      return
    }
    expect(applied.library.page.work.current.sections._tag).toBe('Idle')

    const [, copyCommands] = update(applied, ClickedCopy())
    expect(copyCommands[0]?.name).toBe('CopyChart')

    const screen = songbookScreen(drafted)
    expect(Array.map(inputsOf(screen), input => input.token ?? '')).toContain(
      'draft:',
    )
    expect(Array.map(textsOf(screen), text => text.content)).toContain('Lyrics')
  })

  it('confirms delete from a zipper current that is a member', () => {
    const empty = emptyModel()
    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    const [shelf] = update(created, ClickedShelf())
    expect(shelf.library._tag).toBe('Populated')
    if (
      shelf.library._tag !== 'Populated' ||
      shelf.library.page._tag !== 'Shelf'
    ) {
      return
    }
    expect(shelf.library.page.deleting._tag).toBe('Idle')

    const [confirming] = update(shelf, RequestedDelete({ songId: 'song-a' }))
    expect(confirming.library._tag).toBe('Populated')
    if (
      confirming.library._tag !== 'Populated' ||
      confirming.library.page._tag !== 'Shelf'
    ) {
      return
    }
    expect(confirming.library.page.deleting._tag).toBe('Confirming')
    if (confirming.library.page.deleting._tag !== 'Confirming') {
      return
    }
    expect(confirming.library.page.deleting.current.id).toBe('song-a')
    expect(
      Array.some(
        zipperItems(
          confirming.library.page.deleting.before,
          confirming.library.page.deleting.current,
          confirming.library.page.deleting.after,
        ),
        song => song.id === 'song-a',
      ),
    ).toBe(true)
    expect(
      Array.map(textsOf(songbookScreen(confirming)), text => text.content),
    ).toContain('Confirming')

    const [deleted] = update(confirming, ConfirmedDelete())
    expect(deleted.library._tag).toBe('Empty')
  })

  it('paints a search TextInput on the empty shelf', () => {
    const empty = emptyModel()
    const [searching] = update(
      empty,
      TypedSearch({
        search: Searching.make({ query: NonEmptyString.make('mid') }),
      }),
    )
    expect(searching.library._tag).toBe('Empty')
    if (searching.library._tag !== 'Empty') {
      return
    }
    expect(searching.library.page._tag).toBe('Shelf')
    if (searching.library.page._tag !== 'Shelf') {
      return
    }
    expect(searching.library.page.search._tag).toBe('Searching')
    const screen = songbookScreen(searching)
    expect(Array.map(inputsOf(screen), input => input.value)).toContain('mid')
    expect(
      Array.map(buttonsOf(screen), button => button.token ?? ''),
    ).toContain('new')
  })

  it('nests play current as stored Idle so Playing cannot hold Lyrics', () => {
    const empty = emptyModel()
    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    const [named] = update(created, NamedTitle({ name: 'Midnight Train' }))
    const [withSection] = update(named, AddedSection({ kind: 'Verse' }))
    expect(withSection.library._tag).toBe('Populated')
    if (
      withSection.library._tag !== 'Populated' ||
      withSection.library.page._tag !== 'Chart' ||
      withSection.library.page.work._tag !== 'Editing' ||
      withSection.library.page.work.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeSection = Array.head(
      withSection.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybeSection)).toBe(true)
    if (Option.isNone(maybeSection)) {
      return
    }
    const [lyrics] = update(
      withSection,
      OpenedLyrics({ sectionId: maybeSection.value.id }),
    )
    const [drafted] = update(
      lyrics,
      TypedLyrics({ draft: draftFromText('going away') }),
    )
    expect(drafted.library._tag).toBe('Populated')
    if (
      drafted.library._tag !== 'Populated' ||
      drafted.library.page._tag !== 'Chart' ||
      drafted.library.page.work._tag !== 'Editing'
    ) {
      return
    }
    expect(drafted.library.page.work.current.sections._tag).toBe('Lyrics')

    const [playing] = update(drafted, ClickedPlay())
    expect(playing.library._tag).toBe('Populated')
    if (
      playing.library._tag !== 'Populated' ||
      playing.library.page._tag !== 'Chart'
    ) {
      return
    }
    expect(playing.library.page.work._tag).toBe('Playing')
    if (playing.library.page.work._tag !== 'Playing') {
      return
    }
    expect(playing.library.page.work.current.sections._tag).toBe('Idle')
    if (playing.library.page.work.current.sections._tag !== 'Idle') {
      return
    }
    const maybePlayed = Array.head(
      playing.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybePlayed)).toBe(true)
    if (Option.isNone(maybePlayed)) {
      return
    }
    expect(maybePlayed.value.lines._tag).toBe('Populated')

    const [editing] = update(playing, ClickedEdit())
    expect(editing.library._tag).toBe('Populated')
    if (
      editing.library._tag !== 'Populated' ||
      editing.library.page._tag !== 'Chart'
    ) {
      return
    }
    expect(editing.library.page.work._tag).toBe('Editing')
    if (editing.library.page.work._tag !== 'Editing') {
      return
    }
    expect(editing.library.page.work.current.sections._tag).toBe('Idle')
  })

  it('opens a word zipper that is a member of the current song', () => {
    const empty = emptyModel()
    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    const [named] = update(created, NamedTitle({ name: 'Midnight Train' }))
    const [withSection] = update(named, AddedSection({ kind: 'Verse' }))
    expect(withSection.library._tag).toBe('Populated')
    if (
      withSection.library._tag !== 'Populated' ||
      withSection.library.page._tag !== 'Chart' ||
      withSection.library.page.work._tag !== 'Editing' ||
      withSection.library.page.work.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeSection = Array.head(
      withSection.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybeSection)).toBe(true)
    if (Option.isNone(maybeSection)) {
      return
    }
    const [lyrics] = update(
      withSection,
      OpenedLyrics({ sectionId: maybeSection.value.id }),
    )
    const [drafted] = update(
      lyrics,
      TypedLyrics({ draft: draftFromText('going away') }),
    )
    const [applied] = update(drafted, AppliedLyrics())
    expect(applied.library._tag).toBe('Populated')
    if (
      applied.library._tag !== 'Populated' ||
      applied.library.page._tag !== 'Chart' ||
      applied.library.page.work._tag !== 'Editing' ||
      applied.library.page.work.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeIdleSection = Array.head(
      applied.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybeIdleSection)).toBe(true)
    if (Option.isNone(maybeIdleSection)) {
      return
    }
    expect(maybeIdleSection.value.lines._tag).toBe('Populated')
    if (maybeIdleSection.value.lines._tag !== 'Populated') {
      return
    }
    const maybeLine = Array.head(maybeIdleSection.value.lines.items)
    expect(Option.isSome(maybeLine)).toBe(true)
    if (Option.isNone(maybeLine) || maybeLine.value.body._tag !== 'Words') {
      return
    }
    const maybeWord = Array.head(maybeLine.value.body.items)
    expect(Option.isSome(maybeWord)).toBe(true)
    if (Option.isNone(maybeWord)) {
      return
    }

    const [word] = update(applied, OpenedWord({ wordId: maybeWord.value.id }))
    expect(word.library._tag).toBe('Populated')
    if (
      word.library._tag !== 'Populated' ||
      word.library.page._tag !== 'Chart'
    ) {
      return
    }
    expect(word.library.page.work._tag).toBe('Editing')
    if (word.library.page.work._tag !== 'Editing') {
      return
    }
    expect(word.library.page.work.current.sections._tag).toBe('Word')
    if (word.library.page.work.current.sections._tag !== 'Word') {
      return
    }
    expect(word.library.page.work.current.sections.word.id).toBe(
      maybeWord.value.id,
    )
    expect(word.library.page.work.current.sections.id).toBe(
      maybeIdleSection.value.id,
    )
    expect(word.library.page.work.current.sections.lineId).toBe(
      maybeLine.value.id,
    )
    expect('section' in word.library.page.work.current.sections).toBe(false)
    expect('line' in word.library.page.work.current.sections).toBe(false)
    const focusedChords = word.library.page.work.current.sections.chords
    const hasStoredChord =
      focusedChords._tag === 'Some' &&
      Array.some(
        focusedChords.items,
        placed => placed.word.id === maybeWord.value.id,
      )
    expect(hasStoredChord).toBe(false)
    expect(
      Array.map(textsOf(songbookScreen(word)), text => text.content),
    ).toContain('Word')
    expect(
      Array.map(inputsOf(songbookScreen(word)), input => input.token ?? ''),
    ).not.toContain('chord:')
    expect(
      Array.every(inputsOf(songbookScreen(word)), input => input.value !== ''),
    ).toBe(true)

    const [typed] = update(word, TypedChord({ draft: draftFromText('G') }))
    expect(typed.library._tag).toBe('Populated')
    if (
      typed.library._tag !== 'Populated' ||
      typed.library.page._tag !== 'Chart' ||
      typed.library.page.work._tag !== 'Editing' ||
      typed.library.page.work.current.sections._tag !== 'Word'
    ) {
      return
    }
    expect(typed.library.page.work.current.sections.draft._tag).toBe('Some')
    expect(
      Array.map(inputsOf(songbookScreen(typed)), input => input.value),
    ).toContain('G')
    expect(
      Array.map(inputsOf(songbookScreen(typed)), input => input.token ?? ''),
    ).toContain('chord:')

    const [kept] = update(typed, CancelledWord())
    expect(kept.library._tag).toBe('Populated')
    if (
      kept.library._tag !== 'Populated' ||
      kept.library.page._tag !== 'Chart' ||
      kept.library.page.work._tag !== 'Editing' ||
      kept.library.page.work.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeKeptSection = Array.head(
      kept.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybeKeptSection)).toBe(true)
    if (
      Option.isNone(maybeKeptSection) ||
      maybeKeptSection.value.lines._tag !== 'Populated'
    ) {
      return
    }
    const maybeKeptLine = Array.head(maybeKeptSection.value.lines.items)
    expect(Option.isSome(maybeKeptLine)).toBe(true)
    if (
      Option.isNone(maybeKeptLine) ||
      maybeKeptLine.value.body._tag !== 'Words'
    ) {
      return
    }
    expect(maybeKeptLine.value.body.chords._tag).toBe('Some')
    if (maybeKeptLine.value.body.chords._tag !== 'Some') {
      return
    }
    expect(
      Array.some(
        maybeKeptLine.value.body.chords.items,
        placed =>
          placed.word.id === maybeWord.value.id &&
          placed.chord._tag === 'Sounding',
      ),
    ).toBe(true)
  })

  it('hosts shelf search and lyrics drafts as Idle/None, not empty string', () => {
    expect(draftFromText('')._tag).toBe('None')
    expect(draftFromText('going away')._tag).toBe('Some')

    const empty = emptyModel()
    expect(empty.library._tag).toBe('Empty')
    if (empty.library._tag !== 'Empty') {
      return
    }
    expect(empty.library.page._tag).toBe('Shelf')
    if (empty.library.page._tag !== 'Shelf') {
      return
    }
    expect(empty.library.page.search._tag).toBe('Idle')
    const emptyScreen = songbookScreen(empty)
    expect(Array.map(textsOf(emptyScreen), text => text.content)).toContain(
      'Empty',
    )
    expect(Array.map(textsOf(emptyScreen), text => text.content)).toContain(
      'Shelf',
    )
    expect(Array.map(textsOf(emptyScreen), text => text.content)).toContain(
      'Idle',
    )
    expect(Array.map(textsOf(emptyScreen), text => text.content)).toContain(
      'Search',
    )
    expect(
      Array.every(inputsOf(emptyScreen), input => input.value !== ''),
    ).toBe(true)
    expect(
      Array.map(inputsOf(emptyScreen), input => input.token ?? ''),
    ).not.toContain('search:')

    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    expect(created.library._tag).toBe('Populated')
    if (created.library._tag !== 'Populated') {
      return
    }
    expect(created.library.page._tag).toBe('Chart')
    const createdScreen = songbookScreen(created)
    expect(Array.map(textsOf(createdScreen), text => text.content)).toContain(
      'Title',
    )
    expect(Array.map(textsOf(createdScreen), text => text.content)).toContain(
      'Artist',
    )
    expect(
      Array.every(inputsOf(createdScreen), input => input.value !== ''),
    ).toBe(true)
    expect(
      Array.map(inputsOf(createdScreen), input => input.token ?? ''),
    ).not.toContain('title:')
    expect(
      Array.map(inputsOf(createdScreen), input => input.token ?? ''),
    ).not.toContain('artist:')
    const [named] = update(created, NamedTitle({ name: 'Midnight Train' }))
    expect(
      Array.map(inputsOf(songbookScreen(named)), input => input.value),
    ).toContain('Midnight Train')
    const [namedArtist] = update(
      named,
      NamedArtist({ name: NonEmptyString.make('Aretha') }),
    )
    expect(
      Array.map(inputsOf(songbookScreen(namedArtist)), input => input.value),
    ).toContain('Aretha')
    const [withSection] = update(namedArtist, AddedSection({ kind: 'Verse' }))
    expect(withSection.library._tag).toBe('Populated')
    if (
      withSection.library._tag !== 'Populated' ||
      withSection.library.page._tag !== 'Chart' ||
      withSection.library.page.work._tag !== 'Editing' ||
      withSection.library.page.work.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeSection = Array.head(
      withSection.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybeSection)).toBe(true)
    if (Option.isNone(maybeSection)) {
      return
    }
    const [lyrics] = update(
      withSection,
      OpenedLyrics({ sectionId: maybeSection.value.id }),
    )
    const [cleared] = update(lyrics, TypedLyrics({ draft: Draft.None() }))
    expect(cleared.library._tag).toBe('Populated')
    if (
      cleared.library._tag !== 'Populated' ||
      cleared.library.page._tag !== 'Chart' ||
      cleared.library.page.work._tag !== 'Editing' ||
      cleared.library.page.work.current.sections._tag !== 'Lyrics'
    ) {
      return
    }
    expect(cleared.library.page.work.current.sections.draft._tag).toBe('None')
    const lyricsScreen = songbookScreen(cleared)
    expect(
      Array.map(inputsOf(lyricsScreen), input => input.token ?? ''),
    ).not.toContain('draft:')
    expect(
      Array.every(inputsOf(lyricsScreen), input => input.value !== ''),
    ).toBe(true)
    expect(Array.map(textsOf(lyricsScreen), text => text.content)).toContain(
      'Chart',
    )
    expect(Array.map(textsOf(lyricsScreen), text => text.content)).toContain(
      'Lyrics',
    )
    const [drafted] = update(
      cleared,
      TypedLyrics({ draft: draftFromText('going away') }),
    )
    expect(
      Array.map(inputsOf(songbookScreen(drafted)), input => input.token ?? ''),
    ).toContain('draft:')
    expect(
      Array.map(inputsOf(songbookScreen(drafted)), input => input.value),
    ).toContain('going away')
  })

  it('hosts key and section kind as Pitch and SectionKind, not String', () => {
    const empty = emptyModel()
    expect(empty.library._tag).toBe('Empty')
    if (empty.library._tag === 'Empty') {
      expect(empty.library.page._tag).toBe('Shelf')
      if (empty.library.page._tag === 'Shelf') {
        expect(empty.library.page.search._tag).toBe('Idle')
      }
    }
    expect(Model.Search).toBeDefined()
    expect(Model.Page).toBeDefined()
    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    expect(created.library._tag).toBe('Populated')
    if (
      created.library._tag !== 'Populated' ||
      created.library.page._tag !== 'Chart'
    ) {
      return
    }
    expect('working' in created.library.page).toBe(false)
    expect(created.library.page.work._tag).toBe('Editing')
    expect(flattenSong(created.library.page.work.current).sections._tag).toBe(
      'Empty',
    )
    expect(Song.Saved.make).toBeTypeOf('function')

    const [keyed] = update(created, ChoseKey({ pitch: 'G' }))
    expect(keyed.library._tag).toBe('Populated')
    if (
      keyed.library._tag !== 'Populated' ||
      keyed.library.page._tag !== 'Chart' ||
      keyed.library.page.work._tag !== 'Editing'
    ) {
      return
    }
    expect(keyed.library.page.work.current.key._tag).toBe('Some')
    if (keyed.library.page.work.current.key._tag === 'Some') {
      expect(keyed.library.page.work.current.key.pitch).toBe('G')
    }

    expect(messageFromToken('key:nope', created)).toBeUndefined()
    expect(messageFromToken('add:Nope', created)).toBeUndefined()
    const maybeKey = messageFromToken('key:G', created)
    expect(maybeKey?._tag).toBe('ChoseKey')
    if (maybeKey?._tag === 'ChoseKey') {
      expect(maybeKey.pitch).toBe('G')
    }
    const maybeAdd = messageFromToken('add:Verse', created)
    expect(maybeAdd?._tag).toBe('AddedSection')
    if (maybeAdd?._tag === 'AddedSection') {
      expect(maybeAdd.kind).toBe('Verse')
    }
  })

  it('nests Capo Artist Key Draft Notice Detail Chords as parent members', () => {
    expect(Domain.Capo.None()._tag).toBe('None')
    expect(Domain.Artist.None()._tag).toBe('None')
    expect(Domain.Key.None()._tag).toBe('None')
    expect(Domain.Draft.None()._tag).toBe('None')
    expect(Domain.Chords.None()._tag).toBe('None')
    expect(Model.Notice.None()._tag).toBe('None')
    expect(Model.Detail.None()._tag).toBe('None')
    expect('CapoNone' in Domain).toBe(false)
    expect('CapoFretted' in Domain).toBe(false)
    expect('ArtistNone' in Domain).toBe(false)
    expect('ArtistSome' in Domain).toBe(false)
    expect('KeyNone' in Domain).toBe(false)
    expect('KeySome' in Domain).toBe(false)
    expect('DraftNone' in Domain).toBe(false)
    expect('DraftSome' in Domain).toBe(false)
    expect('ChordsNone' in Domain).toBe(false)
    expect('ChordsSome' in Domain).toBe(false)
    expect('NoticeNone' in Model).toBe(false)
    expect('NoticeSome' in Model).toBe(false)
    expect('DetailNone' in Model).toBe(false)
    expect('DetailSome' in Model).toBe(false)

    const empty = emptyModel()
    expect(empty.notice._tag).toBe('None')
    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    expect(created.library._tag).toBe('Populated')
    if (
      created.library._tag !== 'Populated' ||
      created.library.page._tag !== 'Chart' ||
      created.library.page.work._tag !== 'Editing'
    ) {
      return
    }
    const song = created.library.page.work.current
    expect(song.artist._tag).toBe('None')
    expect(song.key._tag).toBe('None')
    expect(song.capo._tag).toBe('None')
    expect(song.title._tag).toBe('Untitled')

    const [namedArtist] = update(
      created,
      NamedArtist({ name: NonEmptyString.make('Aretha') }),
    )
    expect(namedArtist.library._tag).toBe('Populated')
    if (
      namedArtist.library._tag !== 'Populated' ||
      namedArtist.library.page._tag !== 'Chart' ||
      namedArtist.library.page.work._tag !== 'Editing'
    ) {
      return
    }
    expect(namedArtist.library.page.work.current.artist._tag).toBe('Some')
    if (namedArtist.library.page.work.current.artist._tag === 'Some') {
      expect(namedArtist.library.page.work.current.artist.name).toBe('Aretha')
    }
    const [clearedArtist] = update(namedArtist, ClearedArtist())
    expect(clearedArtist.library._tag).toBe('Populated')
    if (
      clearedArtist.library._tag !== 'Populated' ||
      clearedArtist.library.page._tag !== 'Chart' ||
      clearedArtist.library.page.work._tag !== 'Editing'
    ) {
      return
    }
    expect(clearedArtist.library.page.work.current.artist._tag).toBe('None')
  })

  it('prints chart and chords from present fields, not empty omit-lines', () => {
    const empty = emptyModel()
    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    expect(created.library._tag).toBe('Populated')
    if (
      created.library._tag !== 'Populated' ||
      created.library.page._tag !== 'Chart' ||
      created.library.page.work._tag !== 'Editing'
    ) {
      return
    }
    const untitledChart = Domain.toChartText(created.library.page.work.current)
    expect(untitledChart).toBe('Untitled')
    expect(untitledChart.split('\n')).not.toContain('')

    const [named] = update(created, NamedTitle({ name: 'Midnight Train' }))
    const [namedArtist] = update(
      named,
      NamedArtist({ name: NonEmptyString.make('Aretha') }),
    )
    const [keyed] = update(namedArtist, ChoseKey({ pitch: 'G' }))
    const [fretted] = update(keyed, ClickedCapoUp())
    const [shifted] = update(fretted, ClickedTransposeUp())
    expect(shifted.library._tag).toBe('Populated')
    if (
      shifted.library._tag !== 'Populated' ||
      shifted.library.page._tag !== 'Chart' ||
      shifted.library.page.work._tag !== 'Editing'
    ) {
      return
    }
    const song = shifted.library.page.work.current
    expect(song.transpose._tag).toBe('Shifted')
    const chart = Domain.toChartText(song)
    const lines = chart.split('\n')
    expect(lines).toContain('Midnight Train')
    expect(lines).toContain('Aretha')
    expect(lines).toContain('Key: G')
    expect(lines).toContain('Capo: 1')
    expect(Array.some(lines, line => line.startsWith('Transpose: '))).toBe(true)
    expect(lines).not.toContain('')
    const [, copyCommands] = update(shifted, ClickedCopy())
    expect(copyCommands[0]?.name).toBe('CopyChart')

    expect(Domain.printChord(Domain.Silent())).toBe('N.C.')
    expect(
      Domain.printChord(
        Domain.Sounding.make({
          root: 'C',
          rest: Domain.RestNone(),
          bass: Domain.BassNone(),
        }),
      ),
    ).toBe('C')
    expect(
      Domain.printChord(
        Domain.Sounding.make({
          root: 'C',
          rest: Domain.RestSome.make({ text: NonEmptyString.make('m') }),
          bass: Domain.BassNone(),
        }),
      ),
    ).toBe('Cm')
    expect(
      Domain.printChord(
        Domain.Sounding.make({
          root: 'C',
          rest: Domain.RestNone(),
          bass: Domain.BassSome.make({ pitch: 'G' }),
        }),
      ),
    ).toBe('C/G')
  })

  it('prints blank lyric lines and chord rows from present parts, not empty pad sentinels', () => {
    const empty = emptyModel()
    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    const [named] = update(created, NamedTitle({ name: 'Midnight Train' }))
    const [withSection] = update(named, AddedSection({ kind: 'Verse' }))
    expect(withSection.library._tag).toBe('Populated')
    if (
      withSection.library._tag !== 'Populated' ||
      withSection.library.page._tag !== 'Chart' ||
      withSection.library.page.work._tag !== 'Editing' ||
      withSection.library.page.work.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeSection = Array.head(
      withSection.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybeSection)).toBe(true)
    if (Option.isNone(maybeSection)) {
      return
    }
    const [lyrics] = update(
      withSection,
      OpenedLyrics({ sectionId: maybeSection.value.id }),
    )
    const [drafted] = update(
      lyrics,
      TypedLyrics({ draft: draftFromText('going away\n\ncoming home') }),
    )
    const [applied] = update(drafted, AppliedLyrics())
    expect(applied.library._tag).toBe('Populated')
    if (
      applied.library._tag !== 'Populated' ||
      applied.library.page._tag !== 'Chart' ||
      applied.library.page.work._tag !== 'Editing' ||
      applied.library.page.work.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeIdleSection = Array.head(
      applied.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybeIdleSection)).toBe(true)
    if (
      Option.isNone(maybeIdleSection) ||
      maybeIdleSection.value.lines._tag !== 'Populated'
    ) {
      return
    }
    expect(Array.length(maybeIdleSection.value.lines.items)).toBe(3)
    const maybeFirst = Array.head(maybeIdleSection.value.lines.items)
    const maybeBlank = Array.get(maybeIdleSection.value.lines.items, 1)
    const maybeLast = Array.last(maybeIdleSection.value.lines.items)
    expect(Option.isSome(maybeFirst)).toBe(true)
    expect(Option.isSome(maybeBlank)).toBe(true)
    expect(Option.isSome(maybeLast)).toBe(true)
    if (
      Option.isNone(maybeFirst) ||
      Option.isNone(maybeBlank) ||
      Option.isNone(maybeLast) ||
      maybeFirst.value.body._tag !== 'Words' ||
      maybeLast.value.body._tag !== 'Words'
    ) {
      return
    }
    expect(maybeBlank.value.body._tag).toBe('Blank')
    const maybeWord = Array.head(maybeFirst.value.body.items)
    expect(Option.isSome(maybeWord)).toBe(true)
    if (Option.isNone(maybeWord)) {
      return
    }

    const [word] = update(applied, OpenedWord({ wordId: maybeWord.value.id }))
    const [typed] = update(word, TypedChord({ draft: draftFromText('G') }))
    const [kept] = update(typed, CancelledWord())
    expect(kept.library._tag).toBe('Populated')
    if (
      kept.library._tag !== 'Populated' ||
      kept.library.page._tag !== 'Chart' ||
      kept.library.page.work._tag !== 'Editing'
    ) {
      return
    }
    const chart = Domain.toChartText(kept.library.page.work.current)
    const lines = chart.split('\n')
    expect(lines).toContain('Midnight Train')
    expect(lines).toContain('[Verse]')
    expect(lines).toContain('G')
    expect(lines).toContain('going away')
    expect(lines).toContain('coming home')
    const maybeGoing = Array.findFirstIndex(
      lines,
      line => line === 'going away',
    )
    const maybeComing = Array.findFirstIndex(
      lines,
      line => line === 'coming home',
    )
    expect(Option.isSome(maybeGoing)).toBe(true)
    expect(Option.isSome(maybeComing)).toBe(true)
    if (Option.isNone(maybeGoing) || Option.isNone(maybeComing)) {
      return
    }
    expect(maybeComing.value).toBeGreaterThan(maybeGoing.value)
    const between = lines.slice(maybeGoing.value + 1, maybeComing.value)
    expect(between).toContain('')
    const maybeChordRow = Array.get(lines, maybeGoing.value - 1)
    expect(Option.isSome(maybeChordRow)).toBe(true)
    if (Option.isNone(maybeChordRow)) {
      return
    }
    expect(maybeChordRow.value.startsWith('G')).toBe(true)
    const [, copyCommands] = update(kept, ClickedCopy())
    expect(copyCommands[0]?.name).toBe('CopyChart')

    const maybeC = Domain.parseChord(NonEmptyString.make('C'))
    expect(Option.isSome(maybeC)).toBe(true)
    if (Option.isSome(maybeC)) {
      expect(Domain.printChord(maybeC.value)).toBe('C')
    }
    const maybeMinor = Domain.parseChord(NonEmptyString.make('Cm'))
    expect(Option.isSome(maybeMinor)).toBe(true)
    if (Option.isSome(maybeMinor)) {
      expect(Domain.printChord(maybeMinor.value)).toBe('Cm')
    }
    const maybeSlash = Domain.parseChord(NonEmptyString.make('C/G'))
    expect(Option.isSome(maybeSlash)).toBe(true)
    if (Option.isSome(maybeSlash)) {
      expect(Domain.printChord(maybeSlash.value)).toBe('C/G')
    }
    const maybeSilent = Domain.parseChord(NonEmptyString.make('N.C.'))
    expect(Option.isSome(maybeSilent)).toBe(true)
    if (Option.isSome(maybeSilent)) {
      expect(maybeSilent.value._tag).toBe('Silent')
    }
    expect(Option.isNone(Domain.parseChord(NonEmptyString.make('nope')))).toBe(
      true,
    )
    const maybePitch = Domain.parsePitch(NonEmptyString.make('G'))
    expect(Option.isSome(maybePitch)).toBe(true)
    if (Option.isSome(maybePitch)) {
      expect(Domain.printPitch(maybePitch.value)).toBe('G')
    }
    expect(Option.isNone(Domain.parsePitch(NonEmptyString.make('Z')))).toBe(
      true,
    )
  })

  it('round-trips blank lyric lines through lyrics draft without empty lyricOf sentinels', () => {
    const empty = emptyModel()
    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    const [named] = update(created, NamedTitle({ name: 'Midnight Train' }))
    const [withSection] = update(named, AddedSection({ kind: 'Verse' }))
    expect(withSection.library._tag).toBe('Populated')
    if (
      withSection.library._tag !== 'Populated' ||
      withSection.library.page._tag !== 'Chart' ||
      withSection.library.page.work._tag !== 'Editing' ||
      withSection.library.page.work.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeSection = Array.head(
      withSection.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybeSection)).toBe(true)
    if (Option.isNone(maybeSection)) {
      return
    }
    const [lyrics] = update(
      withSection,
      OpenedLyrics({ sectionId: maybeSection.value.id }),
    )
    const [drafted] = update(
      lyrics,
      TypedLyrics({ draft: draftFromText('going away\n\ncoming home') }),
    )
    const [applied] = update(drafted, AppliedLyrics())
    expect(applied.library._tag).toBe('Populated')
    if (
      applied.library._tag !== 'Populated' ||
      applied.library.page._tag !== 'Chart' ||
      applied.library.page.work._tag !== 'Editing' ||
      applied.library.page.work.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeIdleSection = Array.head(
      applied.library.page.work.current.sections.items,
    )
    expect(Option.isSome(maybeIdleSection)).toBe(true)
    if (
      Option.isNone(maybeIdleSection) ||
      maybeIdleSection.value.lines._tag !== 'Populated'
    ) {
      return
    }
    expect(Array.length(maybeIdleSection.value.lines.items)).toBe(3)
    const maybeFirst = Array.head(maybeIdleSection.value.lines.items)
    const maybeBlank = Array.get(maybeIdleSection.value.lines.items, 1)
    const maybeLast = Array.last(maybeIdleSection.value.lines.items)
    expect(Option.isSome(maybeFirst)).toBe(true)
    expect(Option.isSome(maybeBlank)).toBe(true)
    expect(Option.isSome(maybeLast)).toBe(true)
    if (
      Option.isNone(maybeFirst) ||
      Option.isNone(maybeBlank) ||
      Option.isNone(maybeLast)
    ) {
      return
    }
    expect(maybeBlank.value.body._tag).toBe('Blank')
    expect(Option.isNone(Domain.lyricOf(maybeBlank.value))).toBe(true)
    const maybeGoing = Domain.lyricOf(maybeFirst.value)
    const maybeComing = Domain.lyricOf(maybeLast.value)
    expect(Option.isSome(maybeGoing)).toBe(true)
    expect(Option.isSome(maybeComing)).toBe(true)
    if (Option.isNone(maybeGoing) || Option.isNone(maybeComing)) {
      return
    }
    expect(maybeGoing.value).toBe('going away')
    expect(maybeComing.value).toBe('coming home')

    const roundTrip = Domain.draftOfSection(maybeIdleSection.value)
    expect(roundTrip._tag).toBe('Some')
    if (roundTrip._tag !== 'Some') {
      return
    }
    expect(roundTrip.text).toBe('going away\n\ncoming home')

    const [reopened] = update(
      applied,
      OpenedLyrics({ sectionId: maybeIdleSection.value.id }),
    )
    expect(reopened.library._tag).toBe('Populated')
    if (
      reopened.library._tag !== 'Populated' ||
      reopened.library.page._tag !== 'Chart' ||
      reopened.library.page.work._tag !== 'Editing' ||
      reopened.library.page.work.current.sections._tag !== 'Lyrics'
    ) {
      return
    }
    expect(reopened.library.page.work.current.sections.draft._tag).toBe('Some')
    if (reopened.library.page.work.current.sections.draft._tag !== 'Some') {
      return
    }
    expect(reopened.library.page.work.current.sections.draft.text).toBe(
      'going away\n\ncoming home',
    )
    const pasted = Domain.replaceLyrics(
      maybeIdleSection.value,
      NonEmptyString.make('going away\n\ncoming home'),
    )
    expect(pasted.lines._tag).toBe('Populated')
    if (pasted.lines._tag !== 'Populated') {
      return
    }
    expect(Array.length(pasted.lines.items)).toBe(3)
    const maybePastedBlank = Array.get(pasted.lines.items, 1)
    expect(Option.isSome(maybePastedBlank)).toBe(true)
    if (Option.isNone(maybePastedBlank)) {
      return
    }
    expect(maybePastedBlank.value.body._tag).toBe('Blank')
    const fromWords = Domain.lineFromLyric(
      Domain.lineIdAt(maybeIdleSection.value.id, 0),
      NonEmptyString.make('going away'),
    )
    expect(fromWords.body._tag).toBe('Words')
    const maybeFromWords = Domain.lyricOf(fromWords)
    expect(Option.isSome(maybeFromWords)).toBe(true)
    if (Option.isSome(maybeFromWords)) {
      expect(maybeFromWords.value).toBe('going away')
    }
    const screen = songbookScreen(reopened)
    expect(Array.map(inputsOf(screen), input => input.token ?? '')).toContain(
      'draft:',
    )
    expect(Array.map(textsOf(screen), text => text.content)).toContain('Lyrics')
  })
})
