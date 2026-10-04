import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { TextInput } from './elements.js'
import {
  isClearedOnSubmit,
  isSubmittedOnLeave,
  submittedTagOf,
} from './textInput.js'

describe('submittedTagOf', () => {
  it('presses the action with the trimmed text as its choice', () => {
    const field = TextInput({ value: '', action: 'AddReminder' })
    expect(submittedTagOf(field, '  Buy milk ')).toEqual(
      Option.some('AddReminder:Buy milk'),
    )
    expect(submittedTagOf(field, 'Note: pick up at 5')).toEqual(
      Option.some('AddReminder:Note: pick up at 5'),
    )
  })

  it('presses nothing for an empty entry or for a value left as it was', () => {
    expect(
      submittedTagOf(TextInput({ value: '', action: 'AddReminder' }), '   '),
    ).toEqual(Option.none())
    expect(
      submittedTagOf(
        TextInput({ value: 'Oat milk', action: 'RenameReminder' }),
        ' Oat milk ',
      ),
    ).toEqual(Option.none())
  })

  it('presses the clear action when a field that edits is emptied', () => {
    const notes = TextInput({
      value: 'Fruit and water',
      action: 'SetNotes',
      clearAction: 'ClearNotes',
    })
    expect(submittedTagOf(notes, '')).toEqual(Option.some('ClearNotes'))
    expect(
      submittedTagOf(TextInput({ value: 'Oat milk', action: 'Rename' }), ''),
    ).toEqual(Option.none())
  })
})

describe('field kinds', () => {
  it('clears a field that adds, and keeps a field that edits', () => {
    const adds = TextInput({ value: '', action: 'AddReminder' })
    const editsTitle = TextInput({ value: 'Oat milk', action: 'Rename' })
    const editsNotes = TextInput({
      value: '',
      action: 'SetNotes',
      clearAction: 'ClearNotes',
    })
    expect([adds, editsTitle, editsNotes].map(isClearedOnSubmit)).toEqual([
      true,
      false,
      false,
    ])
    expect([adds, editsTitle, editsNotes].map(isSubmittedOnLeave)).toEqual([
      false,
      true,
      true,
    ])
  })
})
