import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Block from './block.js'
import * as FieldDraft from './fieldDraft.js'
import * as Pace from './pace.js'

const step = (
  state: FieldDraft.State,
  message: FieldDraft.Message,
  props: FieldDraft.Props = {},
): FieldDraft.State => FieldDraft.chart.transition(state, message, props)[0]

describe('FieldDraft block', () => {
  it('has no unreachable states or dead transitions', () => {
    expect(
      Block.problemsOf({ name: 'FieldDraft', chart: FieldDraft.chart }),
    ).toEqual([])
  })

  it('starts idle and empty, supporting begin, change, commit, cancel, clear, and reset', () => {
    expect(FieldDraft.initial).toEqual(FieldDraft.Idle({ value: '' }))
    expect(FieldDraft.isIdle(FieldDraft.initial)).toBe(true)
    expect(FieldDraft.isEditing(FieldDraft.initial)).toBe(false)
    expect(FieldDraft.isDirty(FieldDraft.initial)).toBe(false)
    expect(FieldDraft.isEmpty(FieldDraft.initial)).toBe(true)
    expect(FieldDraft.isBlank(FieldDraft.initial)).toBe(true)
    expect(FieldDraft.canSubmit(FieldDraft.initial)).toBe(false)

    const editing = step(
      FieldDraft.initialValue('hello'),
      FieldDraft.BeginEdit(),
    )
    expect(editing).toEqual(
      FieldDraft.Editing({ value: 'hello', draft: 'hello' }),
    )
    expect(FieldDraft.isEditing(editing)).toBe(true)
    expect(FieldDraft.isDirty(editing)).toBe(false)
    expect(FieldDraft.canSubmit(editing)).toBe(true)

    const typed = step(
      editing,
      FieldDraft.ChangeDraft({ value: 'hello world' }),
    )
    expect(typed).toEqual(
      FieldDraft.Editing({ value: 'hello', draft: 'hello world' }),
    )
    expect(FieldDraft.valueOf(typed)).toBe('hello')
    expect(FieldDraft.draftOf(typed)).toBe('hello world')
    expect(FieldDraft.isDirty(typed)).toBe(true)
    expect(FieldDraft.isEmpty(typed)).toBe(false)

    const reverted = step(typed, FieldDraft.CancelDraft())
    expect(reverted).toEqual(FieldDraft.Idle({ value: 'hello' }))
    expect(FieldDraft.draftOf(reverted)).toBe('hello')
    expect(FieldDraft.isDirty(reverted)).toBe(false)

    const typedDirectly = step(
      reverted,
      FieldDraft.ChangeDraft({ value: '  saved  ' }),
    )
    expect(typedDirectly).toEqual(
      FieldDraft.Editing({ value: 'hello', draft: '  saved  ' }),
    )

    const committed = step(typedDirectly, FieldDraft.CommitDraft(), {
      trimOnCommit: true,
    })
    expect(committed).toEqual(FieldDraft.Idle({ value: 'saved' }))
    expect(FieldDraft.valueOf(committed)).toBe('saved')

    const clearedIdle = step(committed, FieldDraft.ClearDraft())
    expect(clearedIdle).toEqual(FieldDraft.Idle({ value: '' }))
    expect(FieldDraft.isEmpty(clearedIdle)).toBe(true)

    const clearedEditing = step(typed, FieldDraft.ClearDraft())
    expect(clearedEditing).toEqual(FieldDraft.Editing({ value: '', draft: '' }))
    expect(FieldDraft.isDirty(clearedEditing)).toBe(false)
    expect(FieldDraft.isEmpty(clearedEditing)).toBe(true)

    const reset = step(typed, FieldDraft.ResetField(), {
      defaultValue: 'initial',
    })
    expect(reset).toEqual(FieldDraft.Idle({ value: 'initial' }))
  })

  it('syncs typing bursts via Pace.Settled on typing pauses without waiting for blur', () => {
    expect(FieldDraft.defaultSettleMs).toBe(200)
    expect(FieldDraft.paceOf(FieldDraft.ChangeDraft({ value: 'a' }))).toEqual(
      Pace.Settled({ afterMs: 200 }),
    )
    expect(
      FieldDraft.paceOf(FieldDraft.ChangeDraft({ value: 'a' }), {
        settleMs: 120,
      }),
    ).toEqual(Pace.Settled({ afterMs: 120 }))
    expect(FieldDraft.paceOf(FieldDraft.CommitDraft())).toEqual(Pace.Synced())

    const first = Pace.arrived(Pace.empty, {
      part: 'Search',
      key: 'Search.ChangeDraft',
      sync: FieldDraft.paceOf(FieldDraft.ChangeDraft({ value: 'f' })),
      atMs: 1000,
    })
    expect(first.write).toEqual([])
    expect(first.maybeNextAtMs).toEqual(Option.some(1200))

    const second = Pace.arrived(first.queue, {
      part: 'Search',
      key: 'Search.ChangeDraft',
      sync: FieldDraft.paceOf(FieldDraft.ChangeDraft({ value: 'fo' })),
      atMs: 1080,
    })
    expect(second.write).toEqual([])
    expect(second.maybeNextAtMs).toEqual(Option.some(1280))

    // Still before the 200ms pause: nothing flushed yet
    const beforePause = Pace.due(second.queue, 1279)
    expect(beforePause.write).toEqual([])

    // 200ms after the last keystroke, the typing burst flushes WITHOUT blur
    const onPause = Pace.due(beforePause.queue, 1280)
    expect(onPause.write).toEqual(['Search.ChangeDraft'])
    expect(onPause.maybeNextAtMs).toEqual(Option.none())

    // A discrete Synced message flushes pending ChangeDraft before itself
    const pending = Pace.arrived(Pace.empty, {
      part: 'Search',
      key: 'Search.ChangeDraft',
      sync: FieldDraft.paceOf(FieldDraft.ChangeDraft({ value: 'fold' })),
      atMs: 2000,
    })
    const committed = Pace.arrived(pending.queue, {
      part: 'Search',
      key: 'Search.CommitDraft',
      sync: FieldDraft.paceOf(FieldDraft.CommitDraft()),
      atMs: 2050,
    })
    expect(committed.write).toEqual([
      'Search.ChangeDraft',
      'Search.CommitDraft',
    ])
  })

  it('enforces maxLength and trimOnCommit normalization', () => {
    const props: FieldDraft.Props = { maxLength: 5, trimOnCommit: true }
    const typed = step(
      FieldDraft.initial,
      FieldDraft.ChangeDraft({ value: '  abcdefg' }),
      props,
    )
    expect(FieldDraft.draftOf(typed)).toBe('  abc')

    const committed = step(typed, FieldDraft.CommitDraft(), props)
    expect(committed).toEqual(FieldDraft.Idle({ value: 'abc' }))

    expect(FieldDraft.isBlank(FieldDraft.initialValue('   '))).toBe(true)
    expect(FieldDraft.isEmpty(FieldDraft.initialValue('   '))).toBe(false)
  })

  it('handles EndEdit according to blurBehavior and commitOnBlur', () => {
    const dirty = FieldDraft.initialEditing('old', '  new  ')

    // Default: commits on blur
    expect(step(dirty, FieldDraft.EndEdit(), { trimOnCommit: true })).toEqual(
      FieldDraft.Idle({ value: 'new' }),
    )

    // commitOnBlur: false keeps active draft in Editing
    expect(step(dirty, FieldDraft.EndEdit(), { commitOnBlur: false })).toEqual(
      dirty,
    )

    // blurBehavior: 'Cancel' reverts draft back to committed value
    expect(
      step(dirty, FieldDraft.EndEdit(), { blurBehavior: 'Cancel' }),
    ).toEqual(FieldDraft.Idle({ value: 'old' }))

    // blurBehavior: 'Keep' preserves active draft
    expect(step(dirty, FieldDraft.EndEdit(), { blurBehavior: 'Keep' })).toEqual(
      dirty,
    )
  })

  it('rejects edits when disabled or readOnly', () => {
    const disabled: FieldDraft.Props = { isDisabled: true }
    const readOnly: FieldDraft.Props = { isReadOnly: true }
    expect(FieldDraft.canEdit(disabled)).toBe(false)
    expect(FieldDraft.canEdit(readOnly)).toBe(false)
    expect(FieldDraft.canEdit({})).toBe(true)

    const idle = FieldDraft.initialValue('locked')
    expect(step(idle, FieldDraft.BeginEdit(), disabled)).toEqual(idle)
    expect(
      step(idle, FieldDraft.ChangeDraft({ value: 'nope' }), disabled),
    ).toEqual(idle)
    expect(step(idle, FieldDraft.ClearDraft(), disabled)).toEqual(idle)

    expect(step(idle, FieldDraft.BeginEdit(), readOnly)).toEqual(idle)
    expect(
      step(idle, FieldDraft.ChangeDraft({ value: 'nope' }), readOnly),
    ).toEqual(idle)
    expect(step(idle, FieldDraft.ClearDraft(), readOnly)).toEqual(idle)

    const editing = FieldDraft.initialEditing('locked', 'draft')
    expect(FieldDraft.canSubmit(editing, disabled)).toBe(false)
    expect(FieldDraft.canSubmit(editing, readOnly)).toBe(false)
    expect(step(editing, FieldDraft.CommitDraft(), disabled)).toEqual(editing)
    expect(step(editing, FieldDraft.CancelDraft(), readOnly)).toEqual(editing)
    expect(step(editing, FieldDraft.EndEdit(), disabled)).toEqual(editing)
  })

  it('reconciles external/remote SetFieldValue updates without clobbering active dirty edits', () => {
    // Idle adopts remote value cleanly, even when disabled or readOnly
    expect(
      step(
        FieldDraft.initialValue('old'),
        FieldDraft.SetFieldValue({ value: 'remote' }),
        { isDisabled: true },
      ),
    ).toEqual(FieldDraft.Idle({ value: 'remote' }))

    // Clean Editing adopts remote value cleanly for both value and draft
    expect(
      step(
        FieldDraft.initialEditing('old', 'old'),
        FieldDraft.SetFieldValue({ value: 'remote' }),
      ),
    ).toEqual(FieldDraft.Editing({ value: 'remote', draft: 'remote' }))

    // Dirty Editing updates committed baseline without clobbering active local draft
    const reconciled = step(
      FieldDraft.initialEditing('old', 'local typing'),
      FieldDraft.SetFieldValue({ value: 'remote' }),
    )
    expect(reconciled).toEqual(
      FieldDraft.Editing({ value: 'remote', draft: 'local typing' }),
    )
    expect(FieldDraft.isDirty(reconciled)).toBe(true)

    // Reverting after a remote baseline update returns to the new remote baseline
    expect(step(reconciled, FieldDraft.CancelDraft())).toEqual(
      FieldDraft.Idle({ value: 'remote' }),
    )

    // Explicit force: true overwrites even an active dirty draft
    expect(
      step(
        FieldDraft.initialEditing('old', 'local typing'),
        FieldDraft.SetFieldValue({ value: 'forced', force: true }),
      ),
    ).toEqual(FieldDraft.Editing({ value: 'forced', draft: 'forced' }))
  })

  it('preserves settled typed text at rest and round-trips through JSON Schema', () => {
    const editing = FieldDraft.initialEditing('old', 'settled text')
    expect(FieldDraft.atRest(editing)).toEqual(
      FieldDraft.Idle({ value: 'settled text' }),
    )

    const encoded = S.encodeSync(FieldDraft.State)(editing)
    expect(S.decodeSync(FieldDraft.State)(encoded)).toEqual(editing)

    expect(Pace.isSynced(FieldDraft.synced.ChangeDraft)).toBe(true)
    expect(Pace.isSynced(FieldDraft.synced.CommitDraft)).toBe(true)
    expect(Pace.isSynced(FieldDraft.secretSync.ChangeDraft)).toBe(false)
    expect(FieldDraft.secretSync.ChangeDraft).toEqual(
      Pace.Device({ because: 'Secret' }),
    )
    expect(FieldDraft.deviceSync('OwnView').ChangeDraft).toEqual(
      Pace.Device({ because: 'OwnView' }),
    )
  })
})
