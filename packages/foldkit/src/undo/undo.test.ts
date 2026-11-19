import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import { Column } from '../renderers/elements.js'
import { buttonsOf, textsOf } from '../renderers/query.js'
import { ExpiredUndoOffer, initialUndo, noticeOf, offerStep } from './undo.js'

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
  undo: Catalog.undoneBy(PutBack, { said: 'Note removed', offeredForMs: 5000 }),
  meta: { label: 'Remove', keys: [] },
})

const Rename = Catalog.action('Rename', {
  what: 'Renames the shelf',
  why: 'To tell shelves apart',
  meta: { label: 'Rename', keys: [] },
})

const catalog = Catalog.make([RemoveNote, PutBack, Rename])

const [offered, commands] = offerStep(catalog, initialUndo, RemoveNote())

const paintedOf = (
  state: typeof initialUndo,
  shelf: Shelf,
  hasHardwareKeyboard: boolean,
) => {
  const node = Column(
    {},
    ...noticeOf(state, Catalog.entries(catalog, shelf), hasHardwareKeyboard),
  )
  return {
    texts: textsOf(node).map(text => text.content),
    buttons: buttonsOf(node).map(button => [button.label, button.action]),
  }
}

describe('offerStep', () => {
  it('offers the undo an Action declares, for as long as it says', () => {
    expect(offered.maybeOffer).toEqual(
      Option.some({ undo: 'PutBack', said: 'Note removed', cue: 0 }),
    )
    expect(commands.map(command => [command.name, command.args])).toEqual([
      ['ExpireUndoOffer', { cue: 0, afterMs: 5000 }],
    ])
  })

  it('takes the offer away once the undo is asked for', () => {
    expect(offerStep(catalog, offered, PutBack())[0].maybeOffer).toEqual(
      Option.none(),
    )
  })

  it('takes the offer away when its time is up, and leaves a newer offer alone', () => {
    expect(
      offerStep(catalog, offered, ExpiredUndoOffer({ cue: 0 }))[0].maybeOffer,
    ).toEqual(Option.none())
    const [again] = offerStep(catalog, offered, RemoveNote())
    expect(
      Option.map(
        offerStep(catalog, again, ExpiredUndoOffer({ cue: 0 }))[0].maybeOffer,
        offer => offer.cue,
      ),
    ).toEqual(Option.some(1))
  })

  it('leaves the offer as it is for any other Message', () => {
    expect(offerStep(catalog, offered, Rename())).toEqual([offered, []])
  })
})

describe('noticeOf', () => {
  it('says what happened with the Undo control, read from the undoing Action', () => {
    expect(paintedOf(offered, { removed: true }, false)).toEqual({
      texts: ['Note removed.'],
      buttons: [['Undo', 'PutBack']],
    })
  })

  it('names the key only where a hardware keyboard is attached', () => {
    expect(paintedOf(offered, { removed: true }, true).texts).toEqual([
      'Note removed.',
      'Press z to undo.',
    ])
  })

  it('is nothing with no offer, and nothing when the undo cannot be asked for', () => {
    expect(paintedOf(initialUndo, { removed: true }, true)).toEqual({
      texts: [],
      buttons: [],
    })
    expect(paintedOf(offered, { removed: false }, true)).toEqual({
      texts: [],
      buttons: [],
    })
  })
})
