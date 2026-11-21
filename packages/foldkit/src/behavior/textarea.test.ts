import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as Textarea from './textarea.js'

const defaultProps: Textarea.Props = {
  id: 'notes',
  placeholder: 'Add your notes',
  name: 'notes',
  hasLabel: true,
  hasDescription: true,
}

const step = (
  state: Textarea.State,
  message: Textarea.Message,
  props: Textarea.Props = defaultProps,
): Textarea.State => Textarea.chart.transition(state, message, props)[0]

describe('Textarea Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'Textarea', chart: Textarea.chart }),
    ).toEqual([])
    expect(Part.problemsOf(Textarea.part)).toEqual([])
    expect(Part.problemsOf(Textarea.deviceOnly())).toEqual([])
    expect(Part.problemsOf(Textarea.make({ settleMs: 150 }))).toEqual([])

    Textarea.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('derives element IDs and pure multiline helpers', () => {
    expect(Textarea.textareaId('notes')).toBe('notes-textarea')
    expect(Textarea.labelId('notes')).toBe('notes-label')
    expect(Textarea.descriptionId('notes')).toBe('notes-description')
    expect(Textarea.errorId('notes')).toBe('notes-error')
    expect(Textarea.clearButtonId('notes')).toBe('notes-clear')

    expect(Textarea.canInput()).toBe(true)
    expect(Textarea.canInput({ isDisabled: true })).toBe(false)
    expect(Textarea.canInput({ isReadOnly: true })).toBe(false)
    expect(Textarea.canInput({ hasHandler: false })).toBe(false)

    expect(Textarea.isDisabledOf({})).toBe(false)
    expect(Textarea.isDisabledOf({ isDisabled: true })).toBe(true)
    expect(Textarea.isInvalidOf({})).toBe(false)
    expect(Textarea.isInvalidOf({ isInvalid: true })).toBe(true)
    expect(Textarea.resizeModeOf({})).toBe('Vertical')
    expect(Textarea.resizeModeOf({ autoGrow: true })).toBe('Auto')
    expect(Textarea.resizeModeOf({ resize: 'None', autoGrow: true })).toBe(
      'None',
    )
  })

  it('computes lineCountOf, visibleRowsOf, characterCountOf, and remainingCharactersOf', () => {
    expect(Textarea.lineCountOf('')).toBe(1)
    expect(Textarea.lineCountOf('single line')).toBe(1)
    expect(Textarea.lineCountOf('line 1\nline 2\nline 3')).toBe(3)
    expect(Textarea.lineCountOf('line 1\r\nline 2\rline 3\n')).toBe(4)

    const multiState = Textarea.initialEditing('a', '1\n2\n3\n4')
    expect(Textarea.lineCountOf(multiState)).toBe(4)

    // Auto-grow clamps between minRows / rows and maxRows
    expect(Textarea.visibleRowsOf('one', {})).toBe(Textarea.defaultRows)
    expect(Textarea.visibleRowsOf('one', { minRows: 2, maxRows: 5 })).toBe(2)
    expect(Textarea.visibleRowsOf(multiState, { minRows: 2, maxRows: 5 })).toBe(
      4,
    )
    expect(
      Textarea.visibleRowsOf('1\n2\n3\n4\n5\n6\n7', { minRows: 2, maxRows: 5 }),
    ).toBe(5)
    expect(Textarea.visibleRowsOf('1\n2\n3\n4', { rows: 2, maxRows: 6 })).toBe(
      4,
    )
    expect(
      Textarea.visibleRowsOf('1\n2\n3\n4\n5', { rows: 3, autoGrow: false }),
    ).toBe(3)
    expect(Textarea.visibleRowsOf('1', { minRows: 0 })).toBe(1)
    expect(
      Textarea.visibleRowsOf('1\n2\n3\n4', { minRows: 5, maxRows: 3 }),
    ).toBe(5)

    // Character counts & maxLength
    expect(Textarea.characterCountOf('hello\nworld')).toBe(11)
    expect(Textarea.characterCountOf(multiState)).toBe(7)
    expect(Textarea.remainingCharactersOf('hello', {})).toEqual(Option.none())
    expect(Textarea.remainingCharactersOf('hello', { maxLength: 10 })).toEqual(
      Option.some(5),
    )
    expect(Textarea.remainingCharactersOf('hello', { maxLength: 3 })).toEqual(
      Option.some(0),
    )
    expect(Textarea.isAtMaxLength('hello', { maxLength: 5 })).toBe(true)
    expect(Textarea.isAtMaxLength('hello', { maxLength: 6 })).toBe(false)
    expect(Textarea.isAtMaxLength('hello', {})).toBe(false)
  })

  it('handles multiline editing, commit, cancel, clear, blur, remote updates, maxLength, and reset through FieldDraft', () => {
    const started = step(Textarea.initialValue('Line 1'), Textarea.BeginEdit())
    expect(Textarea.isEditing(started)).toBe(true)
    expect(Textarea.isDirty(started)).toBe(false)

    const typed = step(
      started,
      Textarea.ChangeTextarea({ value: '  Line 1\nLine 2  ' }),
    )
    expect(Textarea.valueOf(typed)).toBe('Line 1')
    expect(Textarea.draftOf(typed)).toBe('  Line 1\nLine 2  ')
    expect(Textarea.isDirty(typed)).toBe(true)

    const committed = step(typed, Textarea.CommitTextarea(), {
      ...defaultProps,
      trimOnCommit: true,
    })
    expect(Textarea.isIdle(committed)).toBe(true)
    expect(Textarea.valueOf(committed)).toBe('Line 1\nLine 2')
    expect(Textarea.draftOf(committed)).toBe('Line 1\nLine 2')

    // Enforces maxLength on ChangeTextarea
    const clamped = step(
      committed,
      Textarea.ChangeTextarea({ value: '1234567890' }),
      { ...defaultProps, maxLength: 5 },
    )
    expect(Textarea.draftOf(clamped)).toBe('12345')

    // Cancel reverts draft to committed value
    const cancelled = step(clamped, Textarea.CancelTextarea())
    expect(Textarea.isIdle(cancelled)).toBe(true)
    expect(Textarea.valueOf(cancelled)).toBe('Line 1\nLine 2')

    // Clear empties committed value
    const cleared = step(cancelled, Textarea.ClearTextarea())
    expect(Textarea.valueOf(cleared)).toBe('')
    expect(Textarea.isEmpty(cleared)).toBe(true)

    // Remote SetTextareaValue reconciles dirty draft without clobbering
    const dirty = step(
      Textarea.initialValue('v1'),
      Textarea.ChangeTextarea({ value: 'local\ndraft' }),
    )
    const remote = step(dirty, Textarea.SetTextareaValue({ value: 'v2' }))
    expect(Textarea.valueOf(remote)).toBe('v2')
    expect(Textarea.draftOf(remote)).toBe('local\ndraft')

    const forced = step(
      remote,
      Textarea.SetTextareaValue({ value: 'v3', force: true }),
    )
    expect(Textarea.valueOf(forced)).toBe('v3')
    expect(Textarea.draftOf(forced)).toBe('v3')

    // Blur respects blurBehavior / commitOnBlur
    expect(
      Textarea.isEditing(
        step(dirty, Textarea.EndEdit(), {
          ...defaultProps,
          commitOnBlur: false,
        }),
      ),
    ).toBe(true)
    expect(
      Textarea.valueOf(
        step(dirty, Textarea.EndEdit(), {
          ...defaultProps,
          blurBehavior: 'Cancel',
        }),
      ),
    ).toBe('v1')
    expect(
      Textarea.valueOf(
        step(dirty, Textarea.EndEdit(), {
          ...defaultProps,
          commitOnBlur: true,
        }),
      ),
    ).toBe('local\ndraft')

    // Reset restores defaultValue and returns to Idle
    const reset = step(dirty, Textarea.ResetTextarea(), {
      ...defaultProps,
      defaultValue: 'Initial\nTemplate',
    })
    expect(Textarea.isIdle(reset)).toBe(true)
    expect(Textarea.valueOf(reset)).toBe('Initial\nTemplate')

    // atRest preserves settled draft on reload
    expect(Textarea.atRest(dirty)).toEqual(
      Textarea.initialValue('local\ndraft'),
    )
  })

  it('resolves multiline keyboard rules: plain Enter keeps newline, Mod+Enter/Ctrl+Enter commits, Escape cancels', () => {
    expect(Textarea.resolveTextareaKey({ key: 'Enter' })).toEqual(Option.none())
    expect(
      Textarea.resolveTextareaKey({ key: 'Enter', isShift: true }),
    ).toEqual(Option.none())
    expect(Textarea.resolveTextareaKey({ key: 'Enter', isMeta: true })).toEqual(
      Option.some('Commit'),
    )
    expect(
      Textarea.resolveTextareaKey({ key: 'Enter', isControl: true }),
    ).toEqual(Option.some('Commit'))
    expect(
      Textarea.resolveTextareaKey({
        key: 'Enter',
        isMeta: true,
        isAlt: true,
      }),
    ).toEqual(Option.none())
    expect(
      Textarea.resolveTextareaKey({
        key: 'Enter',
        isMeta: true,
        submitOnModEnter: false,
      }),
    ).toEqual(Option.none())
    expect(
      Textarea.resolveTextareaKey({
        key: 'Enter',
        isMeta: true,
        isComposing: true,
      }),
    ).toEqual(Option.none())
    expect(Textarea.resolveTextareaKey({ key: 'Escape' })).toEqual(
      Option.some('Cancel'),
    )
    expect(
      Textarea.resolveTextareaKey({ key: 'Escape', cancelOnEscape: false }),
    ).toEqual(Option.none())
    expect(
      Textarea.resolveTextareaKey({ key: 'Escape', isComposing: true }),
    ).toEqual(Option.none())

    const editing = step(
      Textarea.initialValue('Original'),
      Textarea.ChangeTextarea({ value: 'Line 1\nLine 2' }),
    )

    // Plain Enter does NOT commit or leave Editing
    const afterPlainEnter = step(
      editing,
      Textarea.PressedTextareaKey({ key: 'Enter' }),
    )
    expect(Textarea.isEditing(afterPlainEnter)).toBe(true)
    expect(Textarea.draftOf(afterPlainEnter)).toBe('Line 1\nLine 2')

    // Mod+Enter commits
    const afterModEnter = step(
      editing,
      Textarea.PressedTextareaKey({ key: 'Enter', isMeta: true }),
    )
    expect(Textarea.isIdle(afterModEnter)).toBe(true)
    expect(Textarea.valueOf(afterModEnter)).toBe('Line 1\nLine 2')

    // Ctrl+Enter commits
    const afterCtrlEnter = step(
      editing,
      Textarea.PressedTextareaKey({ key: 'Enter', isControl: true }),
    )
    expect(Textarea.isIdle(afterCtrlEnter)).toBe(true)
    expect(Textarea.valueOf(afterCtrlEnter)).toBe('Line 1\nLine 2')

    // Disabled submitOnModEnter ignores Mod+Enter
    const ignoredModEnter = step(
      editing,
      Textarea.PressedTextareaKey({ key: 'Enter', isMeta: true }),
      { ...defaultProps, submitOnModEnter: false },
    )
    expect(Textarea.isEditing(ignoredModEnter)).toBe(true)

    // Escape cancels and reverts
    const afterEscape = step(
      editing,
      Textarea.PressedTextareaKey({ key: 'Escape' }),
    )
    expect(Textarea.isIdle(afterEscape)).toBe(true)
    expect(Textarea.valueOf(afterEscape)).toBe('Original')

    // Disabled cancelOnEscape ignores Escape
    const ignoredEscape = step(
      editing,
      Textarea.PressedTextareaKey({ key: 'Escape' }),
      { ...defaultProps, cancelOnEscape: false },
    )
    expect(Textarea.isEditing(ignoredEscape)).toBe(true)
  })

  it('refuses edits when disabled or readOnly', () => {
    const initial = Textarea.initialValue('locked')
    const disabledProps: Textarea.Props = { ...defaultProps, isDisabled: true }
    const readOnlyProps: Textarea.Props = { ...defaultProps, isReadOnly: true }

    expect(step(initial, Textarea.BeginEdit(), disabledProps)).toEqual(initial)
    expect(
      step(initial, Textarea.ChangeTextarea({ value: 'new' }), disabledProps),
    ).toEqual(initial)
    expect(step(initial, Textarea.ClearTextarea(), disabledProps)).toEqual(
      initial,
    )

    expect(step(initial, Textarea.BeginEdit(), readOnlyProps)).toEqual(initial)
    expect(
      step(initial, Textarea.ChangeTextarea({ value: 'new' }), readOnlyProps),
    ).toEqual(initial)
    expect(step(initial, Textarea.ClearTextarea(), readOnlyProps)).toEqual(
      initial,
    )
  })

  it('projects reference-stable SlotBindings with aria-multiline and WAI-ARIA across all slots', () => {
    const props: Textarea.Props = {
      id: 'bio',
      isRequired: true,
      isInvalid: true,
      hasLabel: true,
      hasDescription: true,
      hasError: true,
    }
    const state = Textarea.initialValue('Line one\nLine two')
    const first = Part.view(Textarea.part, state, props)
    const second = Part.view(Textarea.part, state, { ...props })
    expect(second).toBe(first)
    expect(second.slot('Textarea')).toBe(first.slot('Textarea'))

    const firstTextarea = first.slot('Textarea')
    const firstLabel = first.slot('Label')
    const firstDescription = first.slot('Description')
    const firstError = first.slot('Error')
    const firstClear = first.slot('ClearButton')

    expect(Slot.ariaOf(firstTextarea)).toEqual({
      role: 'textbox',
      id: 'bio-textarea',
      tabindex: '0',
      'aria-multiline': 'true',
      'aria-labelledby': 'bio-label',
      'aria-describedby': 'bio-description bio-error',
      'aria-required': 'true',
      'aria-invalid': 'true',
    })

    expect(Slot.ariaOf(firstLabel)).toEqual({
      id: 'bio-label',
    })

    expect(Slot.ariaOf(firstDescription)).toEqual({
      id: 'bio-description',
    })

    expect(Slot.ariaOf(firstError)).toEqual({
      id: 'bio-error',
    })

    expect(Slot.ariaOf(firstClear)).toEqual({
      role: 'button',
      id: 'bio-clear',
      'aria-controls': 'bio-textarea',
      'aria-label': 'Clear textarea',
      tabindex: '0',
    })

    // When text changes from non-empty to another non-empty draft, unchanged slots keep identity
    const edited = step(
      state,
      Textarea.ChangeTextarea({ value: 'Updated\ndraft' }),
      props,
    )
    const afterEdit = Part.view(Textarea.part, edited, props)
    expect(afterEdit.slot('Textarea')).toBe(firstTextarea)
    expect(afterEdit.slot('Label')).toBe(firstLabel)
    expect(afterEdit.slot('Description')).toBe(firstDescription)
    expect(afterEdit.slot('Error')).toBe(firstError)
    expect(afterEdit.slot('ClearButton')).toBe(firstClear)

    // ClearButton hides when empty; Error hides when valid
    const emptyValid = Part.view(Textarea.part, Textarea.initial, defaultProps)
    expect(Slot.ariaOf(emptyValid.slot('ClearButton'))['hidden']).toBe('')
    expect(Slot.ariaOf(emptyValid.slot('Error'))['hidden']).toBe('')
  })

  it('derives Pace.Settled sync by default and omits Textarea.deviceOnly from synced logs', () => {
    const Base = make({
      id: 'textarea-sync-test',
      version: 1,
      Model: S.Struct({ count: S.Number }),
      Message: S.Union([
        Catalog.action('Bump', { what: 'Bumps', why: 'To bump' }),
      ]),
      init: () => [{ count: 0 }, []],
      update: model => [{ count: model.count + 1 }, []],
    })

    const syncedApp = Part.compose({
      of: Base,
      parts: [Part.given(Textarea.make({ settleMs: 150 }), () => defaultProps)],
    })
    expect(
      syncedApp.synchronization?.paceOf?.(
        Textarea.ChangeTextarea({ value: 'a\nb' }),
      ),
    ).toEqual(Pace.Settled({ afterMs: 150 }))
    expect(
      syncedApp.synchronization?.paceOf?.(Textarea.CommitTextarea()),
    ).toEqual(Pace.Synced())
    expect(
      syncedApp.synchronization?.isLocalOnly?.(
        Textarea.ChangeTextarea({ value: 'a\nb' }),
      ),
    ).toBe(false)

    const localApp = Part.compose({
      of: Base,
      parts: [
        Part.given(
          Textarea.deviceOnly({ name: 'Scratchpad' }),
          () => defaultProps,
        ),
      ],
    })
    expect(
      localApp.synchronization?.paceOf?.(
        Textarea.ChangeTextarea({ value: 'local note' }),
      ),
    ).toEqual(Pace.Device({ because: 'OwnView' }))
    expect(
      localApp.synchronization?.isLocalOnly?.(
        Textarea.ChangeTextarea({ value: 'local note' }),
      ),
    ).toBe(true)

    const [localInit] = localApp.init()
    const [afterLocal] = localApp.update(
      localInit,
      Textarea.ChangeTextarea({ value: 'local note' }),
    )
    const encoded = S.encodeSync(localApp.Model)(afterLocal)
    expect(encoded).toEqual({ count: 0 })
  })
})
