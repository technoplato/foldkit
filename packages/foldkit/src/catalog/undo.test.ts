import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { toolOf } from '../declaration/tool.js'
import * as Catalog from './catalog.js'

type Shelf = Readonly<{ removed: boolean }>

const PutBack = Catalog.action('PutBack', {
  what: 'Puts back the note that was just removed',
  why: 'To undo a removal made by mistake',
  enabled: (shelf: Shelf) =>
    shelf.removed
      ? Catalog.Enabled()
      : Catalog.Disabled({ because: 'nothing was just removed' }),
  meta: { label: 'Undo', keys: ['z'] },
})

const RemoveNote = Catalog.action('RemoveNote', {
  what: 'Removes the note',
  why: 'To clear away a note that is no longer needed',
  undo: Catalog.undoneBy(PutBack, { said: 'Note removed' }),
  meta: { label: 'Remove', keys: [] },
})

const EmptyList = Catalog.action('EmptyList', {
  what: 'Empties the list of notes',
  why: 'To start a new list',
  undo: Catalog.cannotBeUndone('the notes are gone for good'),
  meta: { label: 'Empty', keys: [] },
})

const DeleteAll = Catalog.action('DeleteAll', {
  what: 'Deletes every note',
  why: 'To start with nothing',
  meta: { label: 'Delete all', keys: [] },
})

const Rename = Catalog.action('Rename', {
  what: 'Renames the shelf',
  why: 'To tell shelves apart',
  meta: { label: 'Rename', keys: [] },
})

describe('what undoes an Action', () => {
  it('is said once, on the Action, by reference to the Action that puts it back', () => {
    expect(RemoveNote.maybeUndo).toEqual(
      Option.some({
        _tag: 'UndoneBy',
        tag: 'PutBack',
        said: 'Note removed',
        offeredForMs: Catalog.undoOfferedForMs,
      }),
    )
    expect(EmptyList.maybeUndo).toEqual(
      Option.some({
        _tag: 'CannotBeUndone',
        because: 'the notes are gone for good',
      }),
    )
    expect(Rename.maybeUndo).toEqual(Option.none())
  })

  it('is part of the plain declaration every Client reads', () => {
    expect(Catalog.declarationOf(RemoveNote).undo).toEqual({
      _tag: 'UndoneBy',
      by: 'PutBack',
      said: 'Note removed',
      offeredForMs: Catalog.undoOfferedForMs,
    })
    expect(Catalog.declarationOf(EmptyList).undo).toEqual({
      _tag: 'CannotBeUndone',
      because: 'the notes are gone for good',
    })
    expect(Catalog.declarationOf(Rename).undo).toBeUndefined()
  })

  it('tells an agent what cannot be taken back', () => {
    expect(
      toolOf(['EmptyList'], Catalog.declarationOf(EmptyList)).annotations,
    ).toMatchObject({ destructiveHint: true })
    expect(
      toolOf(['RemoveNote'], Catalog.declarationOf(RemoveNote)).annotations,
    ).toMatchObject({ destructiveHint: false })
  })

  it('marks the entry of an Action that undoes another', () => {
    const catalog = Catalog.make([RemoveNote, PutBack, Rename])
    expect(
      Catalog.entries(catalog, { removed: true }).map(entry => [
        entry.tag,
        entry.undoes,
      ]),
    ).toEqual([
      ['RemoveNote', false],
      ['PutBack', true],
      ['Rename', false],
    ])
  })
})

describe('Catalog.undoOf', () => {
  const catalog = Catalog.make([RemoveNote, PutBack, Rename])

  it('is the Action that undoes, while it can be asked for', () => {
    expect(
      Option.map(Catalog.undoOf(catalog, { removed: true }), ({ tag }) => tag),
    ).toEqual(Option.some('PutBack'))
  })

  it('is None while there is nothing to undo', () => {
    expect(Catalog.undoOf(catalog, { removed: false })).toEqual(Option.none())
  })
})

describe('Catalog.undeclaredUndos', () => {
  it('finds nothing when every Action that destroys says how it is undone, or that it cannot be', () => {
    expect(
      Catalog.undeclaredUndos(Catalog.make([RemoveNote, PutBack, EmptyList])),
    ).toEqual([])
  })

  it('names an Action that destroys and says neither', () => {
    expect(
      Catalog.undeclaredUndos(Catalog.make([DeleteAll, Rename, PutBack])),
    ).toEqual([
      'DeleteAll destroys something and says neither what undoes it nor that it cannot be undone.',
    ])
  })

  it('names an undo that is not in the Catalog, so nothing offers an Action nobody can ask for', () => {
    expect(Catalog.undeclaredUndos(Catalog.make([RemoveNote, Rename]))).toEqual(
      ['RemoveNote says PutBack undoes it, and the Catalog has no PutBack.'],
    )
  })
})
