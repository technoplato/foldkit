import { Array, Option } from 'effect'
import { buttonsOf, inputsOf, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import {
  AddedSection,
  AppliedLyrics,
  ClickedCopy,
  ClickedNew,
  ClickedShelf,
  ConfirmedDelete,
  NamedTitle,
  OpenedLyrics,
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
    expect(withSection.library.place.current.sections._tag).toBe('Populated')
    if (withSection.library.place.current.sections._tag !== 'Populated') {
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
    if (lyrics.library.place.working._tag !== 'Editing') {
      return
    }
    expect(lyrics.library.place.working.focus._tag).toBe('Lyrics')
    if (lyrics.library.place.working.focus._tag !== 'Lyrics') {
      return
    }
    expect(lyrics.library.place.working.focus.draft._tag).toBe('None')
    expect(lyrics.library.place.working.focus.current.id).toBe(
      maybeSection.value.id,
    )
    expect(
      Array.some(
        zipperItems(
          lyrics.library.place.working.focus.before,
          lyrics.library.place.working.focus.current,
          lyrics.library.place.working.focus.after,
        ),
        section => section.id === maybeSection.value.id,
      ),
    ).toBe(true)

    const [drafted] = update(lyrics, TypedLyrics({ text: 'going away' }))
    expect(drafted.library._tag).toBe('Populated')
    if (
      drafted.library._tag !== 'Populated' ||
      drafted.library.place._tag !== 'Chart' ||
      drafted.library.place.working._tag !== 'Editing' ||
      drafted.library.place.working.focus._tag !== 'Lyrics'
    ) {
      return
    }
    expect(drafted.library.place.working.focus.draft._tag).toBe('Some')

    const [applied] = update(drafted, AppliedLyrics())
    expect(applied.library._tag).toBe('Populated')
    if (
      applied.library._tag !== 'Populated' ||
      applied.library.place._tag !== 'Chart'
    ) {
      return
    }
    expect(applied.library.place.working._tag).toBe('Editing')
    if (applied.library.place.working._tag !== 'Editing') {
      return
    }
    expect(applied.library.place.working.focus._tag).toBe('Viewing')
    expect(applied.library.place.current.sections._tag).toBe('Populated')

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
})
