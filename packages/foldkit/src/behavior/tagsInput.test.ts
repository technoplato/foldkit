import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as TagsInput from './tagsInput.js'

const defaultProps: TagsInput.Props = {
  id: 'skills',
  maxTags: 4,
  delimiter: ',',
  hasLabel: true,
}

const step = (
  state: TagsInput.State,
  message: TagsInput.Message,
  props: TagsInput.Props = defaultProps,
): TagsInput.State => TagsInput.chart.transition(state, message, props)[0]

describe('TagsInput Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'TagsInput', chart: TagsInput.chart }),
    ).toEqual([])
    expect(Part.problemsOf(TagsInput.part)).toEqual([])
    expect(
      Part.problemsOf(
        TagsInput.make({ name: 'TopicsInput', defaultTags: ['effect'] }),
      ),
    ).toEqual([])
    expect(Part.problemsOf(TagsInput.deviceOnly())).toEqual([])

    TagsInput.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('adds tags on Enter, delimiter, paste, and blur while enforcing maxTags, allowDuplicates, and validateTag', () => {
    // Enter adds trimmed draft
    const typed = step(
      TagsInput.initial,
      TagsInput.ChangeTagInput({ value: '  effect  ' }),
    )
    expect(TagsInput.inputDraftOf(typed)).toBe('  effect  ')
    const afterEnter = step(typed, TagsInput.PressedTagsKey({ key: 'Enter' }))
    expect(TagsInput.tagsOf(afterEnter)).toEqual(['effect'])
    expect(TagsInput.inputDraftOf(afterEnter)).toBe('')

    // Delimiter at end of typed value commits immediately
    const afterComma = step(
      afterEnter,
      TagsInput.ChangeTagInput({ value: 'typescript,' }),
    )
    expect(TagsInput.tagsOf(afterComma)).toEqual(['effect', 'typescript'])
    expect(TagsInput.inputDraftOf(afterComma)).toBe('')

    // Duplicates rejected when allowDuplicates is false (default)
    const duplicateAttempt = step(
      afterComma,
      TagsInput.AddTag({ value: 'effect' }),
    )
    expect(TagsInput.tagsOf(duplicateAttempt)).toEqual(['effect', 'typescript'])

    // Duplicates allowed when allowDuplicates is true
    const dupAllowed = step(afterComma, TagsInput.AddTag({ value: 'effect' }), {
      ...defaultProps,
      allowDuplicates: true,
    })
    expect(TagsInput.tagsOf(dupAllowed)).toEqual([
      'effect',
      'typescript',
      'effect',
    ])

    // Paste splits on delimiter and enforces maxTags (4)
    const afterPaste = step(
      afterComma,
      TagsInput.PasteTags({ value: 'elm, rust, zig' }),
    )
    expect(TagsInput.tagsOf(afterPaste)).toEqual([
      'effect',
      'typescript',
      'elm',
      'rust',
    ])
    expect(TagsInput.isAtMax(afterPaste, defaultProps)).toBe(true)

    // Blur adds when addOnBlur: true / blurBehavior: 'Add'
    const blurAddProps: TagsInput.Props = { ...defaultProps, addOnBlur: true }
    const afterBlurAdd = step(
      step(
        TagsInput.initial,
        TagsInput.ChangeTagInput({ value: 'foldkit' }),
        blurAddProps,
      ),
      TagsInput.EndTagInput(),
      blurAddProps,
    )
    expect(TagsInput.tagsOf(afterBlurAdd)).toEqual(['foldkit'])

    // Custom validateTag predicate
    const validatedProps: TagsInput.Props = {
      ...defaultProps,
      validateTag: candidate => candidate.length >= 3,
    }
    const shortRejected = step(
      TagsInput.initial,
      TagsInput.AddTag({ value: 'go' }),
      validatedProps,
    )
    expect(TagsInput.tagsOf(shortRejected)).toEqual([])
    const longAccepted = step(
      shortRejected,
      TagsInput.AddTag({ value: 'zig' }),
      validatedProps,
    )
    expect(TagsInput.tagsOf(longAccepted)).toEqual(['zig'])
  })

  it('highlights, navigates, edits, and deletes existing tags with ArrowLeft/ArrowRight/Backspace/Delete/Enter/Escape', () => {
    let state = TagsInput.initialTags(['alpha', 'beta', 'gamma'])

    // ArrowLeft from empty input highlights last tag (index 2)
    state = step(state, TagsInput.PressedTagsKey({ key: 'ArrowLeft' }))
    expect(TagsInput.highlightedIndexOf(state)).toEqual(Option.some(2))

    // ArrowLeft moves 2 -> 1
    state = step(state, TagsInput.PressedTagsKey({ key: 'ArrowLeft' }))
    expect(TagsInput.highlightedIndexOf(state)).toEqual(Option.some(1))

    // Enter enters EditingTag for index 1
    state = step(state, TagsInput.PressedTagsKey({ key: 'Enter' }))
    expect(TagsInput.isEditingTag(state)).toBe(true)
    expect(TagsInput.editingIndexOf(state)).toEqual(Option.some(1))
    expect(TagsInput.editedTagDraftOf(state)).toEqual(Option.some('beta'))

    // Escape cancels edit without mutating tags
    state = step(state, TagsInput.ChangeEditedTag({ value: 'discarded' }))
    state = step(state, TagsInput.PressedTagsKey({ key: 'Escape' }))
    expect(TagsInput.isEditingTag(state)).toBe(false)
    expect(TagsInput.tagsOf(state)).toEqual(['alpha', 'beta', 'gamma'])
    expect(TagsInput.highlightedIndexOf(state)).toEqual(Option.some(1))

    // Edit again and commit with Enter
    state = step(state, TagsInput.PressedTagsKey({ key: 'Enter' }))
    state = step(state, TagsInput.ChangeEditedTag({ value: 'beta-2' }))
    state = step(state, TagsInput.PressedTagsKey({ key: 'Enter' }))
    expect(TagsInput.isEditingTag(state)).toBe(false)
    expect(TagsInput.tagsOf(state)).toEqual(['alpha', 'beta-2', 'gamma'])

    // ArrowRight moves 1 -> 2, and another ArrowRight returns focus to input (None)
    state = step(state, TagsInput.PressedTagsKey({ key: 'ArrowRight' }))
    expect(TagsInput.highlightedIndexOf(state)).toEqual(Option.some(2))
    state = step(state, TagsInput.PressedTagsKey({ key: 'ArrowRight' }))
    expect(TagsInput.highlightedIndexOf(state)).toEqual(Option.none())

    // Backspace from empty input highlights last tag; second Backspace deletes it
    state = step(state, TagsInput.PressedTagsKey({ key: 'Backspace' }))
    expect(TagsInput.highlightedIndexOf(state)).toEqual(Option.some(2))
    state = step(state, TagsInput.PressedTagsKey({ key: 'Backspace' }))
    expect(TagsInput.tagsOf(state)).toEqual(['alpha', 'beta-2'])
    expect(TagsInput.highlightedIndexOf(state)).toEqual(Option.some(1))

    // Delete removes highlighted tag (index 1)
    state = step(state, TagsInput.PressedTagsKey({ key: 'Delete' }))
    expect(TagsInput.tagsOf(state)).toEqual(['alpha'])
    expect(TagsInput.highlightedIndexOf(state)).toEqual(Option.some(0))

    // Escape clears highlight
    state = step(state, TagsInput.PressedTagsKey({ key: 'Escape' }))
    expect(TagsInput.highlightedIndexOf(state)).toEqual(Option.none())

    // RemoveTag and ClearTags
    const cleared = step(state, TagsInput.ClearTags())
    expect(TagsInput.isEmpty(cleared)).toBe(true)
  })

  it('declares Settled sync, atRest, JSON round-trip, and reference-stable SlotBindings', () => {
    expect(TagsInput.synced.ChangeTagInput).toEqual(
      Pace.Settled({ afterMs: 200 }),
    )
    expect(TagsInput.synced.ChangeEditedTag).toEqual(
      Pace.Settled({ afterMs: 200 }),
    )
    expect(TagsInput.synced.AddTag).toEqual(Pace.Synced())
    expect(TagsInput.deviceSync('OwnView').AddTag).toEqual(
      Pace.Device({ because: 'OwnView' }),
    )

    const editing = step(
      TagsInput.initialTags(['one', 'two']),
      TagsInput.BeginEditTag({ index: 0 }),
    )
    const rested = TagsInput.atRest(editing)
    expect(TagsInput.isEditingTag(rested)).toBe(false)
    expect(TagsInput.tagsOf(rested)).toEqual(['one', 'two'])

    const encoded = S.encodeSync(TagsInput.State)(editing)
    expect(S.decodeUnknownSync(TagsInput.State)(encoded)).toEqual(editing)

    const highlighted = step(rested, TagsInput.HighlightTag({ index: 0 }))
    const view1 = Part.view(TagsInput.part, highlighted, defaultProps)
    const view2 = Part.view(TagsInput.part, highlighted, { ...defaultProps })
    expect(view1).toBe(view2)
    expect(view1.slot('Tag', '0')).toBe(view2.slot('Tag', '0'))

    expect(Slot.ariaOf(view1.slot('Root'))['role']).toBe('group')
    expect(Slot.ariaOf(view1.slot('Input'))['role']).toBe('textbox')
    expect(Slot.ariaOf(view1.slot('Tag', '0'))['aria-current']).toBe('true')
    expect(Slot.ariaOf(view1.slot('TagDeleteButton', '0'))['aria-label']).toBe(
      'Delete tag one',
    )
    expect(Slot.ariaOf(view1.slot('ClearButton'))['hidden']).toBeUndefined()

    const moved = step(highlighted, TagsInput.HighlightTag({ index: 1 }))
    const view3 = Part.view(TagsInput.part, moved, defaultProps)
    expect(view3.slot('Root')).toBe(view1.slot('Root'))
    expect(view3.slot('ClearButton')).toBe(view1.slot('ClearButton'))
  })
})
