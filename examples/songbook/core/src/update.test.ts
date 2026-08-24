import { Array, Option } from 'effect'
import { buttonsOf, inputsOf, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  AddedSection,
  AppliedLyrics,
  ClickedCopy,
  ClickedEdit,
  ClickedNew,
  ClickedPlay,
  ClickedShelf,
  ConfirmedDelete,
  NamedTitle,
  OpenedLyrics,
  OpenedWord,
  RequestedDelete,
  SucceededGeneratedIds,
  TypedLyrics,
  TypedSearch,
} from './message.js'
import { emptyModel, zipperItems } from './model.js'
import { songbookScreen } from './program.js'
import { update } from './update.js'

describe('songbook update', () => {
  it('creates a named chart and applies lyrics from a None | Some draft', () => {
    const empty = emptyModel()
    const [, createCommands] = update(empty, ClickedNew())
    expect(createCommands[0]?.name).toBe('GenerateIds')

    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    expect(created.library._tag).toBe('Populated')
    if (created.library._tag !== 'Populated') {
      return
    }
    expect(created.library.place._tag).toBe('Chart')
    if (created.library.place._tag !== 'Chart') {
      return
    }
    expect(created.library.place.current.title._tag).toBe('Untitled')

    const [named] = update(created, NamedTitle({ name: 'Midnight Train' }))
    expect(named.library._tag).toBe('Populated')
    if (
      named.library._tag !== 'Populated' ||
      named.library.place._tag !== 'Chart'
    ) {
      return
    }
    expect(named.library.place.current.title._tag).toBe('Named')
    if (named.library.place.current.title._tag === 'Named') {
      expect(named.library.place.current.title.name).toBe('Midnight Train')
    }

    const [withSection] = update(named, AddedSection({ kind: 'Verse' }))
    expect(withSection.library._tag).toBe('Populated')
    if (
      withSection.library._tag !== 'Populated' ||
      withSection.library.place._tag !== 'Chart'
    ) {
      return
    }
    expect(withSection.library.place.current.sections._tag).toBe('Idle')
    if (withSection.library.place.current.sections._tag !== 'Idle') {
      return
    }
    const maybeSection = Array.head(
      withSection.library.place.current.sections.items,
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
      lyrics.library.place._tag !== 'Chart'
    ) {
      return
    }
    expect(lyrics.library.place.working._tag).toBe('Editing')
    expect(lyrics.library.place.current.sections._tag).toBe('Lyrics')
    if (lyrics.library.place.current.sections._tag !== 'Lyrics') {
      return
    }
    expect(lyrics.library.place.current.sections.draft._tag).toBe('None')
    expect(lyrics.library.place.current.sections.current.id).toBe(
      maybeSection.value.id,
    )
    expect(
      Array.some(
        zipperItems(
          lyrics.library.place.current.sections.before,
          lyrics.library.place.current.sections.current,
          lyrics.library.place.current.sections.after,
        ),
        section => section.id === maybeSection.value.id,
      ),
    ).toBe(true)

    const [drafted] = update(lyrics, TypedLyrics({ text: 'going away' }))
    expect(drafted.library._tag).toBe('Populated')
    if (
      drafted.library._tag !== 'Populated' ||
      drafted.library.place._tag !== 'Chart' ||
      drafted.library.place.current.sections._tag !== 'Lyrics'
    ) {
      return
    }
    expect(drafted.library.place.current.sections.draft._tag).toBe('Some')

    const [applied] = update(drafted, AppliedLyrics())
    expect(applied.library._tag).toBe('Populated')
    if (
      applied.library._tag !== 'Populated' ||
      applied.library.place._tag !== 'Chart'
    ) {
      return
    }
    expect(applied.library.place.working._tag).toBe('Editing')
    expect(applied.library.place.current.sections._tag).toBe('Idle')

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
      shelf.library.place._tag !== 'Shelf'
    ) {
      return
    }
    expect(shelf.library.place.deleting._tag).toBe('Idle')

    const [confirming] = update(shelf, RequestedDelete({ songId: 'song-a' }))
    expect(confirming.library._tag).toBe('Populated')
    if (
      confirming.library._tag !== 'Populated' ||
      confirming.library.place._tag !== 'Shelf'
    ) {
      return
    }
    expect(confirming.library.place.deleting._tag).toBe('Confirming')
    if (confirming.library.place.deleting._tag !== 'Confirming') {
      return
    }
    expect(confirming.library.place.deleting.current.id).toBe('song-a')
    expect(
      Array.some(
        zipperItems(
          confirming.library.place.deleting.before,
          confirming.library.place.deleting.current,
          confirming.library.place.deleting.after,
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
    const [searching] = update(empty, TypedSearch({ query: 'mid' }))
    expect(searching.library._tag).toBe('Empty')
    if (searching.library._tag !== 'Empty') {
      return
    }
    expect(searching.library.place._tag).toBe('Shelf')
    if (searching.library.place._tag !== 'Shelf') {
      return
    }
    expect(searching.library.place.looking._tag).toBe('Searching')
    const screen = songbookScreen(searching)
    expect(Array.map(inputsOf(screen), input => input.value)).toContain('mid')
    expect(
      Array.map(buttonsOf(screen), button => button.token ?? ''),
    ).toContain('new')
  })

  it('flattens a lyrics zipper to Idle when play starts', () => {
    const empty = emptyModel()
    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    const [named] = update(created, NamedTitle({ name: 'Midnight Train' }))
    const [withSection] = update(named, AddedSection({ kind: 'Verse' }))
    expect(withSection.library._tag).toBe('Populated')
    if (
      withSection.library._tag !== 'Populated' ||
      withSection.library.place._tag !== 'Chart' ||
      withSection.library.place.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeSection = Array.head(
      withSection.library.place.current.sections.items,
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
      lyrics.library.place._tag !== 'Chart'
    ) {
      return
    }
    expect(lyrics.library.place.current.sections._tag).toBe('Lyrics')

    const [playing] = update(lyrics, ClickedPlay())
    expect(playing.library._tag).toBe('Populated')
    if (
      playing.library._tag !== 'Populated' ||
      playing.library.place._tag !== 'Chart'
    ) {
      return
    }
    expect(playing.library.place.working._tag).toBe('Playing')
    expect(playing.library.place.current.sections._tag).toBe('Idle')

    const [editing] = update(playing, ClickedEdit())
    expect(editing.library._tag).toBe('Populated')
    if (
      editing.library._tag !== 'Populated' ||
      editing.library.place._tag !== 'Chart'
    ) {
      return
    }
    expect(editing.library.place.working._tag).toBe('Editing')
    expect(editing.library.place.current.sections._tag).toBe('Idle')
  })

  it('opens a word zipper that is a member of the current song', () => {
    const empty = emptyModel()
    const [created] = update(empty, SucceededGeneratedIds({ songId: 'song-a' }))
    const [named] = update(created, NamedTitle({ name: 'Midnight Train' }))
    const [withSection] = update(named, AddedSection({ kind: 'Verse' }))
    expect(withSection.library._tag).toBe('Populated')
    if (
      withSection.library._tag !== 'Populated' ||
      withSection.library.place._tag !== 'Chart' ||
      withSection.library.place.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeSection = Array.head(
      withSection.library.place.current.sections.items,
    )
    expect(Option.isSome(maybeSection)).toBe(true)
    if (Option.isNone(maybeSection)) {
      return
    }
    const [lyrics] = update(
      withSection,
      OpenedLyrics({ sectionId: maybeSection.value.id }),
    )
    const [drafted] = update(lyrics, TypedLyrics({ text: 'going away' }))
    const [applied] = update(drafted, AppliedLyrics())
    expect(applied.library._tag).toBe('Populated')
    if (
      applied.library._tag !== 'Populated' ||
      applied.library.place._tag !== 'Chart' ||
      applied.library.place.current.sections._tag !== 'Idle'
    ) {
      return
    }
    const maybeIdleSection = Array.head(
      applied.library.place.current.sections.items,
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
      word.library.place._tag !== 'Chart'
    ) {
      return
    }
    expect(word.library.place.working._tag).toBe('Editing')
    expect(word.library.place.current.sections._tag).toBe('Word')
    if (word.library.place.current.sections._tag !== 'Word') {
      return
    }
    expect(word.library.place.current.sections.word.id).toBe(maybeWord.value.id)
    expect(
      Array.some(
        zipperItems(
          word.library.place.current.sections.sectionsBefore,
          word.library.place.current.sections.section,
          word.library.place.current.sections.sectionsAfter,
        ),
        section => section.id === maybeIdleSection.value.id,
      ),
    ).toBe(true)
    expect(
      Array.map(textsOf(songbookScreen(word)), text => text.content),
    ).toContain('Word')
  })
})
