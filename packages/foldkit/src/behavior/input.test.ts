import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as Block from './block.js'
import * as Input from './input.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'

const defaultProps: Input.Props = {
  id: 'email',
  placeholder: 'you@example.com',
  name: 'email',
  hasLabel: true,
  hasDescription: true,
}

const step = (
  state: Input.State,
  message: Input.Message,
  props: Input.Props = defaultProps,
): Input.State => Input.chart.transition(state, message, props)[0]

describe('Input Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(Block.problemsOf({ name: 'Input', chart: Input.chart })).toEqual([])
    expect(Part.problemsOf(Input.part)).toEqual([])
    expect(Part.problemsOf(Input.secret())).toEqual([])
    expect(Part.problemsOf(Input.deviceOnly())).toEqual([])
    expect(Part.problemsOf(Input.make({ settleMs: 150 }))).toEqual([])

    Input.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('derives element IDs and pure input helpers', () => {
    expect(Input.inputId('email')).toBe('email-input')
    expect(Input.labelId('email')).toBe('email-label')
    expect(Input.descriptionId('email')).toBe('email-description')
    expect(Input.errorId('email')).toBe('email-error')
    expect(Input.visibilityButtonId('email')).toBe('email-visibility')
    expect(Input.clearButtonId('email')).toBe('email-clear')
    expect(Input.previewId('email')).toBe('email-preview')

    expect(Input.defaultInputType).toBe('text')
    expect(Input.inputTypeOf({})).toBe('text')
    expect(Input.inputTypeOf({ type: 'email' })).toBe('email')
    expect(Input.canInput()).toBe(true)
    expect(Input.canInput({ isDisabled: true })).toBe(false)
    expect(Input.canInput({ isReadOnly: true })).toBe(false)
    expect(Input.canInput({ hasHandler: false })).toBe(false)
  })

  it('handles typing, commit, cancel, clear, blur, remote updates, and reset through FieldDraft', () => {
    const started = step(Input.initialValue('hello'), Input.BeginEdit())
    expect(Input.isEditing(started)).toBe(true)
    expect(Input.isDirty(started)).toBe(false)

    const typed = step(started, Input.ChangeInput({ value: '  hello world  ' }))
    expect(Input.valueOf(typed)).toBe('hello')
    expect(Input.draftOf(typed)).toBe('  hello world  ')
    expect(Input.isDirty(typed)).toBe(true)

    const committed = step(typed, Input.CommitInput(), {
      ...defaultProps,
      trimOnCommit: true,
    })
    expect(Input.isIdle(committed)).toBe(true)
    expect(Input.valueOf(committed)).toBe('hello world')
    expect(Input.draftOf(committed)).toBe('hello world')

    const editingAgain = step(
      committed,
      Input.ChangeInput({ value: 'discard me' }),
    )
    const cancelled = step(editingAgain, Input.CancelInput())
    expect(Input.isIdle(cancelled)).toBe(true)
    expect(Input.valueOf(cancelled)).toBe('hello world')

    const cleared = step(cancelled, Input.ClearInput())
    expect(Input.valueOf(cleared)).toBe('')
    expect(Input.isEmpty(cleared)).toBe(true)

    // Remote SetInputValue reconciles dirty draft without clobbering
    const dirty = step(
      Input.initialValue('v1'),
      Input.ChangeInput({ value: 'local' }),
    )
    const remote = step(dirty, Input.SetInputValue({ value: 'v2' }))
    expect(Input.valueOf(remote)).toBe('v2')
    expect(Input.draftOf(remote)).toBe('local')

    const forced = step(
      remote,
      Input.SetInputValue({ value: 'v3', force: true }),
    )
    expect(Input.valueOf(forced)).toBe('v3')
    expect(Input.draftOf(forced)).toBe('v3')

    // Blur respects commitOnBlur
    expect(
      Input.isEditing(
        step(dirty, Input.EndEdit(), { ...defaultProps, commitOnBlur: false }),
      ),
    ).toBe(true)
    expect(
      Input.valueOf(
        step(dirty, Input.EndEdit(), { ...defaultProps, commitOnBlur: true }),
      ),
    ).toBe('local')

    // Reset restores defaultValue and hides password
    const reset = step(
      Input.initialEditing('a', 'b', true),
      Input.ResetInput(),
      { ...defaultProps, defaultValue: 'seed' },
    )
    expect(Input.isIdle(reset)).toBe(true)
    expect(Input.valueOf(reset)).toBe('seed')
    expect(Input.isPasswordVisible(reset)).toBe(false)
  })

  it('supports password visibility toggle and effectiveInputTypeOf', () => {
    const passwordProps: Input.Props = {
      id: 'pw',
      type: 'password',
      autoComplete: 'current-password',
    }
    expect(Input.effectiveInputTypeOf(Input.initial, passwordProps)).toBe(
      'password',
    )
    expect(Input.visibilityStateOf(Input.initial)).toBe('hidden')
    expect(Input.visibilityLabelOf(Input.initial)).toBe('Show password')

    const shown = step(
      Input.initial,
      Input.TogglePasswordVisibility(),
      passwordProps,
    )
    expect(Input.isPasswordVisible(shown)).toBe(true)
    expect(Input.effectiveInputTypeOf(shown, passwordProps)).toBe('text')
    expect(Input.visibilityStateOf(shown)).toBe('visible')
    expect(Input.visibilityLabelOf(shown)).toBe('Hide password')

    const explicitlyHidden = step(
      shown,
      Input.SetPasswordVisible({ isVisible: false }),
      passwordProps,
    )
    expect(Input.isPasswordVisible(explicitlyHidden)).toBe(false)
    expect(Input.effectiveInputTypeOf(explicitlyHidden, passwordProps)).toBe(
      'password',
    )

    // Ignored on non-password inputs or disabled/readOnly password inputs
    expect(
      Input.isPasswordVisible(
        step(Input.initial, Input.TogglePasswordVisibility(), defaultProps),
      ),
    ).toBe(false)
    expect(
      Input.isPasswordVisible(
        step(Input.initial, Input.TogglePasswordVisibility(), {
          ...passwordProps,
          isDisabled: true,
        }),
      ),
    ).toBe(false)
    expect(
      Input.isPasswordVisible(
        step(Input.initial, Input.TogglePasswordVisibility(), {
          ...passwordProps,
          isReadOnly: true,
        }),
      ),
    ).toBe(false)

    // atRest always masks password visibility
    expect(Input.isPasswordVisible(Input.atRest(shown))).toBe(false)
  })

  it('supports inline editable view/edit mode and Enter/Escape keyboard semantics', () => {
    expect(Input.resolveEditableKey({ key: 'Enter' })).toEqual(
      Option.some('Commit'),
    )
    expect(Input.resolveEditableKey({ key: 'Escape' })).toEqual(
      Option.some('Cancel'),
    )
    expect(
      Input.resolveEditableKey({ key: 'Enter', isComposing: true }),
    ).toEqual(Option.none())
    expect(Input.resolveEditableKey({ key: 'Enter', isShift: true })).toEqual(
      Option.none(),
    )
    expect(Input.resolveEditableKey({ key: 'Enter', isMeta: true })).toEqual(
      Option.none(),
    )
    expect(
      Input.resolveEditableKey({ key: 'Enter', submitOnEnter: false }),
    ).toEqual(Option.none())
    expect(Input.resolveEditableKey({ key: 'a' })).toEqual(Option.none())

    const editableProps: Input.Props = {
      id: 'title',
      isEditable: true,
      blurBehavior: 'Cancel',
    }
    const initial = Input.initialValue('Chapter 1')
    expect(Input.editModeOf(initial)).toBe('preview')

    // Enter on preview begins edit
    const editing = step(
      initial,
      Input.PressedInputKey({ key: 'Enter' }),
      editableProps,
    )
    expect(Input.editModeOf(editing)).toBe('edit')

    const typed = step(
      editing,
      Input.ChangeInput({ value: 'Chapter One' }),
      editableProps,
    )

    // Escape cancels and reverts
    const cancelled = step(
      typed,
      Input.PressedInputKey({ key: 'Escape' }),
      editableProps,
    )
    expect(Input.editModeOf(cancelled)).toBe('preview')
    expect(Input.valueOf(cancelled)).toBe('Chapter 1')

    // Enter commits
    const reTyped = step(
      step(cancelled, Input.BeginEdit(), editableProps),
      Input.ChangeInput({ value: 'Chapter Two' }),
      editableProps,
    )
    const committed = step(
      reTyped,
      Input.PressedInputKey({ key: 'Enter' }),
      editableProps,
    )
    expect(Input.editModeOf(committed)).toBe('preview')
    expect(Input.valueOf(committed)).toBe('Chapter Two')
  })

  it('projects reference-stable SlotBindings with WAI-ARIA across all slots', () => {
    const props: Input.Props = {
      id: 'secret-field',
      type: 'password',
      isRequired: true,
      isInvalid: true,
      hasLabel: true,
      hasDescription: true,
      hasError: true,
    }
    const state = Input.initialValue('hunter2', false)
    const first = Part.view(Input.part, state, props)
    const second = Part.view(Input.part, state, { ...props })
    expect(second).toBe(first)
    expect(second.slot('Input')).toBe(first.slot('Input'))

    const firstInput = first.slot('Input')
    const firstLabel = first.slot('Label')
    const firstDescription = first.slot('Description')
    const firstVisibility = first.slot('VisibilityToggle')
    const firstClear = first.slot('ClearButton')

    const inputAria = Slot.ariaOf(firstInput)
    expect(inputAria).toEqual({
      role: 'textbox',
      id: 'secret-field-input',
      tabindex: '0',
      'aria-labelledby': 'secret-field-label',
      'aria-describedby': 'secret-field-description secret-field-error',
      'aria-required': 'true',
      'aria-invalid': 'true',
    })

    const visibilityAria = Slot.ariaOf(firstVisibility)
    expect(visibilityAria).toEqual({
      role: 'button',
      id: 'secret-field-visibility',
      'aria-controls': 'secret-field-input',
      'aria-pressed': 'false',
      'aria-label': 'Show password',
      tabindex: '0',
    })

    const clearAria = Slot.ariaOf(firstClear)
    expect(clearAria).toEqual({
      role: 'button',
      id: 'secret-field-clear',
      'aria-controls': 'secret-field-input',
      'aria-label': 'Clear input',
      tabindex: '0',
    })

    // When password visibility toggles, unrelated slots keep object identity
    const toggled = step(state, Input.TogglePasswordVisibility(), props)
    const afterToggle = Part.view(Input.part, toggled, props)
    expect(afterToggle.slot('Description')).toBe(firstDescription)
    expect(afterToggle.slot('Label')).toBe(firstLabel)
    expect(afterToggle.slot('Input')).toBe(firstInput)
    expect(afterToggle.slot('VisibilityToggle')).not.toBe(firstVisibility)
    expect(Slot.ariaOf(afterToggle.slot('VisibilityToggle'))).toMatchObject({
      'aria-pressed': 'true',
      'aria-label': 'Hide password',
    })

    // VisibilityToggle is hidden on non-password inputs; ClearButton is hidden when empty
    const plainEmpty = Part.view(Input.part, Input.initial, defaultProps)
    expect(Slot.ariaOf(plainEmpty.slot('VisibilityToggle'))['hidden']).toBe('')
    expect(Slot.ariaOf(plainEmpty.slot('ClearButton'))['hidden']).toBe('')
  })

  it('derives Pace.Settled sync by default and omits Input.secret / Input.deviceOnly from synced logs', () => {
    const Base = make({
      id: 'input-sync-test',
      version: 1,
      Model: S.Struct({ count: S.Number }),
      Message: S.Union([
        Catalog.action('Bump', {
          what: 'Bumps',
          why: 'To bump',
          meta: { label: 'Bump', keys: [] },
        }),
      ]),
      init: () => [{ count: 0 }, []],
      update: model => [{ count: model.count + 1 }, []],
    })

    const syncedApp = Part.compose({
      of: Base,
      parts: [Part.given(Input.make({ settleMs: 150 }), () => defaultProps)],
    })
    expect(
      syncedApp.synchronization?.paceOf?.(Input.ChangeInput({ value: 'abc' })),
    ).toEqual(Pace.Settled({ afterMs: 150 }))
    expect(syncedApp.synchronization?.paceOf?.(Input.CommitInput())).toEqual(
      Pace.Synced(),
    )
    expect(
      syncedApp.synchronization?.isLocalOnly?.(
        Input.ChangeInput({ value: 'abc' }),
      ),
    ).toBe(false)

    const secretApp = Part.compose({
      of: Base,
      parts: [
        Part.given(
          Input.secret({ name: 'SecretPassword' }),
          (): Input.Props => ({
            ...defaultProps,
            type: 'password',
          }),
        ),
      ],
    })
    expect(
      secretApp.synchronization?.paceOf?.(
        Input.ChangeInput({ value: 'top-secret' }),
      ),
    ).toEqual(Pace.Device({ because: 'Secret' }))
    expect(
      secretApp.synchronization?.isLocalOnly?.(
        Input.ChangeInput({ value: 'top-secret' }),
      ),
    ).toBe(true)

    const [secretInit] = secretApp.init()
    const [afterSecret] = secretApp.update(
      secretInit,
      Input.ChangeInput({ value: 'top-secret' }),
    )
    const encoded = S.encodeSync(secretApp.Model)(afterSecret)
    expect(encoded).toEqual({ count: 0 })
  })
})
