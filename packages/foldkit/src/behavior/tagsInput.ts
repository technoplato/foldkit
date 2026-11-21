import { Array, Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, to, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import * as FieldDraft from './fieldDraft.js'
import {
  Device,
  type DeviceReason,
  Settled,
  type Sync,
  Synced,
  defaultPace,
} from './pace.js'
import * as Part from './part.js'
import * as RovingFocus from './rovingFocus.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core TagsInput Part (Widget #34 of 54, Scribe #2673).
// It composes `FieldDraft` (`Pace.Settled` typing sync) and `RovingFocus`
// into one framework-free Machine and Part declaration covering Zag
// tags-input semantics: adding tags on Enter, delimiter, paste, and blur,
// `maxTags`, `allowDuplicates`, `validateTag`, highlighting and editing or
// deleting existing tags with ArrowLeft/ArrowRight/Backspace/Delete/Enter/Escape,
// `atRest`, and reference-stable SlotBindings (`Root`, `Input`, `Tag`,
// `TagDeleteButton`, `ClearButton`, `Label`).

// CONSTANTS

/** Default delimiter that commits a typed tag (`','`). */
export const defaultDelimiter = ','

/** Default typing-pause settle window in milliseconds (`200`). */
export const defaultSettleMs: number = FieldDraft.defaultSettleMs

// SCHEMAS

/**
 * What leaving the tags input (blur) does with any non-empty draft:
 * - `Add`: attempts to add the draft as a tag and clears the input.
 * - `Clear`: clears the input draft without adding a tag.
 * - `None`: leaves the settled input draft in place (the default).
 */
export const BlurBehavior = S.Literals(['Add', 'Clear', 'None'])
/** What leaving the tags input (blur) does with any non-empty draft. */
export type BlurBehavior = typeof BlurBehavior.Type

/** Predicate validating a candidate tag value against the current tag list. */
export type TagValidator = (
  value: string,
  existingTags: ReadonlyArray<string>,
) => boolean

const TagValidatorSchema: S.Schema<TagValidator> = S.declare<TagValidator>(
  (input): input is TagValidator => typeof input === 'function',
)

/**
 * Read-only props supplied to the TagsInput chart and projection from the
 * Program's Model. Validation rules, limits, delimiters, and accessibility
 * linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  maxTags: S.optionalKey(S.Number),
  allowDuplicates: S.optionalKey(S.Boolean),
  delimiter: S.optionalKey(S.String),
  addOnPaste: S.optionalKey(S.Boolean),
  addOnBlur: S.optionalKey(S.Boolean),
  blurBehavior: S.optionalKey(BlurBehavior),
  isEditable: S.optionalKey(S.Boolean),
  validateTag: S.optionalKey(TagValidatorSchema),
  maxLength: S.optionalKey(S.Number),
  direction: S.optionalKey(RovingFocus.Direction),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  defaultTags: S.optionalKey(S.Array(S.String)),
  settleMs: S.optionalKey(S.Number),
  placeholder: S.optionalKey(S.String),
  label: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
  name: S.optionalKey(S.String),
  form: S.optionalKey(S.String),
})
/** Read-only props supplied to the TagsInput chart and projection. */
export type Props = typeof Props.Type

// STATE

/**
 * The tags input is in its main state, holding committed `tags`, the new-tag
 * `inputField` (`FieldDraft.State`), and an optional `maybeHighlightedIndex`
 * while roving through existing tags.
 */
export const Idle = ts('Idle', {
  tags: S.Array(S.String),
  inputField: FieldDraft.State,
  maybeHighlightedIndex: S.Option(S.Number),
})
/** The tags input is in its main state (typing or navigating tags). */
export type Idle = typeof Idle.Type

/**
 * An existing tag at `editingIndex` is being edited inline through
 * `tagField` (`FieldDraft.Editing`), so Enter commits and Escape cancels.
 */
export const EditingTag = ts('EditingTag', {
  tags: S.Array(S.String),
  inputField: FieldDraft.Idle,
  editingIndex: S.Number,
  tagField: FieldDraft.Editing,
})
/** An existing tag is being edited inline. */
export type EditingTag = typeof EditingTag.Type

/** Where a TagsInput Part stands: `Idle` or `EditingTag`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, EditingTag])
/** Where a TagsInput Part stands. */
export type State = typeof State.Type

/** Initial TagsInput state: empty tag list, empty input draft, no highlighted tag. */
export const initial: State = Idle({
  tags: [],
  inputField: FieldDraft.initial,
  maybeHighlightedIndex: Option.none(),
})

/** Creates an initial Idle TagsInput state pre-populated with `tags`. */
export const initialTags = (tags: ReadonlyArray<string>): State =>
  Idle({
    tags,
    inputField: FieldDraft.initial,
    maybeHighlightedIndex: Option.none(),
  })

// CONFIG READERS

/** Resolved tag delimiter (`','` by default). */
export const delimiterOf = (props: Pick<Props, 'delimiter'> = {}): string =>
  props.delimiter ?? defaultDelimiter

/** True when duplicate tags are allowed (`false` by default). */
export const allowDuplicatesOf = (
  props: Pick<Props, 'allowDuplicates'> = {},
): boolean => props.allowDuplicates === true

/** True when pasting text splits on `delimiter` and adds tags (`true` by default). */
export const addOnPasteOf = (props: Pick<Props, 'addOnPaste'> = {}): boolean =>
  props.addOnPaste ?? true

/** Resolved blur behavior (`blurBehavior`, else `'Add'` when `addOnBlur: true`, else `'None'`). */
export const blurBehaviorOf = (
  props: Pick<Props, 'blurBehavior' | 'addOnBlur'> = {},
): BlurBehavior => {
  if (props.blurBehavior !== undefined) {
    return props.blurBehavior
  } else if (props.addOnBlur === true) {
    return 'Add'
  } else {
    return 'None'
  }
}

/** True when existing tags can be edited inline (`true` by default). */
export const isEditableOf = (props: Pick<Props, 'isEditable'> = {}): boolean =>
  props.isEditable ?? true

/** Resolved horizontal reading direction (`'Ltr'` by default). */
export const directionOf = (
  props: Pick<Props, 'direction'> = {},
): RovingFocus.Direction => props.direction ?? 'Ltr'

/** True when the tags input is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the tags input is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when the tags input is required (`false` by default). */
export const isRequiredOf = (props: Pick<Props, 'isRequired'> = {}): boolean =>
  props.isRequired === true

/** True when the tags input is marked invalid (`false` by default). */
export const isInvalidOf = (props: Pick<Props, 'isInvalid'> = {}): boolean =>
  props.isInvalid === true

/** True when the tags input accepts user edits (neither disabled nor read-only). */
export const canEdit = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => FieldDraft.canEdit(props)

/** Resolved typing-pause settle duration in milliseconds (`200` by default). */
export const settleMsOf = (props: Pick<Props, 'settleMs'> = {}): number =>
  props.settleMs ?? defaultSettleMs

/** Projects `TagsInput.Props` onto the underlying {@link FieldDraft.Props}. */
export const fieldPropsOf = (props: Props): FieldDraft.Props => ({
  ...(props.isDisabled === undefined ? {} : { isDisabled: props.isDisabled }),
  ...(props.isReadOnly === undefined ? {} : { isReadOnly: props.isReadOnly }),
  ...(props.maxLength === undefined ? {} : { maxLength: props.maxLength }),
  ...(props.settleMs === undefined ? {} : { settleMs: props.settleMs }),
})

// ACTIONS

/** Enters typing mode on the new-tag input and clears any tag highlight. */
export const BeginTagInput = Catalog.action('BeginTagInput', {
  what: 'Starts typing in the new-tag input field',
  why: 'To compose another label for the collection',
  meta: { label: 'Begin tag input', keys: [] },
})

/** Updates the new-tag input draft; commits automatically when ending with `delimiter`. */
export const ChangeTagInput = Catalog.action('ChangeTagInput', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'tag text',
    prompt: 'Enter tag text',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No tag text entered',
  },
  what: 'Updates the draft text for the next tag',
  why: 'To type a label before adding it to the list',
  meta: { label: 'Change tag input', keys: [] },
})

/** Adds `value` (or the current input draft) as a new tag when valid and within limits. */
export const AddTag = Catalog.action('AddTag', {
  fields: { value: S.optionalKey(S.String) },
  what: 'Adds a validated tag to the collection',
  why: 'To attach another category or keyword',
  meta: { label: 'Add tag', keys: [] },
})

/** Removes the tag at `index` from the collection. */
export const RemoveTag = Catalog.action('RemoveTag', {
  fields: { index: S.Number },
  choose: {
    field: 'index',
    noun: 'tag',
    prompt: 'Remove which tag?',
    token: S.FiniteFromString.pipe(S.decodeTo(S.Int)),
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No tag is available to remove',
  },
  what: 'Removes the chosen tag from the collection',
  why: 'To drop an unwanted label',
  meta: { label: 'Remove tag', keys: [] },
})

/** Highlights an existing tag at `index` for keyboard navigation, editing, or deletion. */
export const HighlightTag = Catalog.action('HighlightTag', {
  fields: { index: S.Number },
  choose: {
    field: 'index',
    noun: 'tag',
    prompt: 'Highlight which tag?',
    token: S.FiniteFromString.pipe(S.decodeTo(S.Int)),
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No tag is available to highlight',
  },
  what: 'Highlights an existing tag in the collection',
  why: 'To focus a saved label for editing or removal',
  meta: { label: 'Highlight tag', keys: [] },
})

/** Starts inline editing for the tag at `index` (or the currently highlighted tag). */
export const BeginEditTag = Catalog.action('BeginEditTag', {
  fields: { index: S.optionalKey(S.Number) },
  what: 'Opens inline editing for an existing tag',
  why: 'To revise the text of a saved label in place',
  meta: { label: 'Edit tag', keys: [] },
})

/** Updates the live text draft of the tag currently being edited inline. */
export const ChangeEditedTag = Catalog.action('ChangeEditedTag', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'edited tag',
    prompt: 'Edit tag text',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No edited tag text provided',
  },
  what: 'Updates the inline draft for the active tag',
  why: 'To revise its wording before saving',
  meta: { label: 'Change edited tag', keys: [] },
})

/** Saves the inline tag edit (or removes the tag when cleared to empty). */
export const CommitEditedTag = Catalog.action('CommitEditedTag', {
  what: 'Saves the inline edit to the active tag',
  why: 'To finalize the revised label',
  meta: { label: 'Commit edited tag', keys: [] },
})

/** Cancels inline tag editing and restores the original tag text. */
export const CancelEditTag = Catalog.action('CancelEditTag', {
  what: 'Discards the inline edit and restores the original tag',
  why: 'To keep the saved label unchanged',
  meta: { label: 'Cancel tag edit', keys: [] },
})

/** Pastes text into the tags input, splitting on `delimiter` when `addOnPaste` is enabled. */
export const PasteTags = Catalog.action('PasteTags', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'tags text',
    prompt: 'Paste tag text',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'No pasted text provided',
  },
  what: 'Splits pasted text by the delimiter and appends valid tags',
  why: 'To insert multiple labels at once',
  meta: { label: 'Paste tags', keys: [] },
})

/** Removes all tags and clears the new-tag draft. */
export const ClearTags = Catalog.action('ClearTags', {
  what: 'Removes every tag and clears the draft',
  why: 'To empty the entire collection quickly',
  meta: { label: 'Clear tags', keys: [] },
})

/** Restores the tag collection to `props.defaultTags` (or empty) and returns to `Idle`. */
export const ResetTags = Catalog.action('ResetTags', {
  what: 'Restores the tags to their starting entries',
  why: 'To undo modifications and start fresh',
  meta: { label: 'Reset tags', keys: [] },
})

/** The Catalog Actions a TagsInput Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  BeginTagInput,
  ChangeTagInput,
  AddTag,
  RemoveTag,
  HighlightTag,
  BeginEditTag,
  ChangeEditedTag,
  CommitEditedTag,
  CancelEditTag,
  PasteTags,
  ClearTags,
  ResetTags,
]

// MESSAGE

/** Focus left the tags input (blur): applies `blurBehavior` / `addOnBlur` or settles an inline tag edit. */
export const EndTagInput = m('EndTagInput')

/** A keyboard key was pressed while interacting with the tags input or inline tag editor. */
export const PressedTagsKey = m('PressedTagsKey', {
  key: S.String,
  isCaretAtStart: S.optionalKey(S.Boolean),
  isComposing: S.optionalKey(S.Boolean),
})

/** Replaces the tag collection programmatically with `tags`. */
export const SetTags = m('SetTags', {
  tags: S.Array(S.String),
})

/** Every Message the TagsInput chart handles. */
export const Message = S.Union([
  BeginTagInput,
  ChangeTagInput,
  AddTag,
  RemoveTag,
  HighlightTag,
  BeginEditTag,
  ChangeEditedTag,
  CommitEditedTag,
  CancelEditTag,
  PasteTags,
  ClearTags,
  ResetTags,
  EndTagInput,
  PressedTagsKey,
  SetTags,
])
/** Every Message the TagsInput chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the TagsInput Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the tags input root element id from a base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the new-tag input element id from a base `id`. */
export const inputId = (id: string): string => `${id}-input`

/** Derives one tag element id from a base `id` and `index`. */
export const tagId = (id: string, index: number): string =>
  `${id}-tag-${index.toString()}`

/** Derives one tag delete button element id from a base `id` and `index`. */
export const tagDeleteButtonId = (id: string, index: number): string =>
  `${id}-tag-delete-${index.toString()}`

/** Derives the clear-all button element id from a base `id`. */
export const clearButtonId = (id: string): string => `${id}-clear`

/** Derives the label element id from a base `id`. */
export const labelId = (id: string): string => `${id}-label`

// READINGS

/** All committed tags in order. */
export const tagsOf = (state: State): ReadonlyArray<string> => state.tags

/** Number of committed tags. */
export const countOf = (state: State): number => state.tags.length

/** True when no tags are present. */
export const isEmpty = (state: State): boolean =>
  Array.isReadonlyArrayEmpty(state.tags)

/** True when the tag count has reached or exceeded `props.maxTags`. */
export const isAtMax = (
  state: State,
  props: Pick<Props, 'maxTags'> = {},
): boolean => props.maxTags !== undefined && state.tags.length >= props.maxTags

/** True when the tag count strictly exceeds `props.maxTags`. */
export const isOverflowing = (
  state: State,
  props: Pick<Props, 'maxTags'> = {},
): boolean => props.maxTags !== undefined && state.tags.length > props.maxTags

/** Current live draft text in the new-tag input. */
export const inputDraftOf = (state: State): string =>
  FieldDraft.draftOf(state.inputField)

/** Currently highlighted tag index while `Idle`, or `Option.none()`. */
export const highlightedIndexOf = (state: State): Option.Option<number> =>
  state._tag === 'Idle' ? state.maybeHighlightedIndex : Option.none()

/** Currently edited tag index while `EditingTag`, or `Option.none()`. */
export const editingIndexOf = (state: State): Option.Option<number> =>
  state._tag === 'EditingTag' ? Option.some(state.editingIndex) : Option.none()

/** Live inline draft text while `EditingTag`, or `Option.none()`. */
export const editedTagDraftOf = (state: State): Option.Option<string> =>
  state._tag === 'EditingTag'
    ? Option.some(state.tagField.draft)
    : Option.none()

/** True while `state` is `EditingTag`. */
export const isEditingTag = (state: State): boolean =>
  state._tag === 'EditingTag'

/** True when `candidate` can be added to `existingTags` under `props` (non-empty, within `maxTags`, dedupe, `validateTag`). */
export const canAddTag = (
  candidate: string,
  existingTags: ReadonlyArray<string>,
  props: Pick<
    Props,
    'maxTags' | 'allowDuplicates' | 'validateTag' | 'isDisabled' | 'isReadOnly'
  > = {},
): boolean => {
  if (!canEdit(props)) {
    return false
  }
  const trimmed = candidate.trim()
  if (trimmed.length === 0) {
    return false
  }
  if (props.maxTags !== undefined && existingTags.length >= props.maxTags) {
    return false
  }
  if (!allowDuplicatesOf(props) && Array.contains(existingTags, trimmed)) {
    return false
  }
  if (
    props.validateTag !== undefined &&
    !props.validateTag(trimmed, existingTags)
  ) {
    return false
  }
  return true
}

// INTERNAL HELPERS

const removeAt = (
  tags: ReadonlyArray<string>,
  index: number,
): ReadonlyArray<string> =>
  Array.filter(tags, (_tag, current) => current !== index)

const replaceAt = (
  tags: ReadonlyArray<string>,
  index: number,
  nextValue: string,
): ReadonlyArray<string> =>
  Array.map(tags, (existing, current) =>
    current === index ? nextValue : existing,
  )

const appendCandidates = (
  existingTags: ReadonlyArray<string>,
  candidates: ReadonlyArray<string>,
  props: Props,
): ReadonlyArray<string> =>
  Array.reduce(candidates, existingTags, (accumulated, raw) => {
    const trimmed = raw.trim()
    return canAddTag(trimmed, accumulated, props)
      ? [...accumulated, trimmed]
      : accumulated
  })

const splitByDelimiter = (
  raw: string,
  props: Pick<Props, 'delimiter'>,
): ReadonlyArray<string> => {
  const delimiter = delimiterOf(props)
  return delimiter.length === 0 ? [raw] : raw.split(delimiter)
}

const isValidTagIndex = (tags: ReadonlyArray<string>, index: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < tags.length

const changeInputField = (
  field: FieldDraft.State,
  value: string,
  props: Props,
): FieldDraft.State => {
  const [nextField] = FieldDraft.chart.transition(
    field,
    FieldDraft.ChangeDraft({ value }),
    fieldPropsOf(props),
  )
  return nextField
}

const beginInputField = (
  field: FieldDraft.State,
  props: Props,
): FieldDraft.State => {
  const [nextField] = FieldDraft.chart.transition(
    field,
    FieldDraft.BeginEdit(),
    fieldPropsOf(props),
  )
  return nextField
}

const commitEdited = (state: EditingTag, props: Props): Idle => {
  const trimmed = state.tagField.draft.trim()
  if (trimmed.length === 0) {
    const nextTags = removeAt(state.tags, state.editingIndex)
    const nextHighlight = Array.isReadonlyArrayEmpty(nextTags)
      ? Option.none<number>()
      : Option.some(Math.min(state.editingIndex, nextTags.length - 1))
    return Idle({
      tags: nextTags,
      inputField: state.inputField,
      maybeHighlightedIndex: nextHighlight,
    })
  }
  const existingAtSlot = Option.getOrElse(
    Array.get(state.tags, state.editingIndex),
    () => '',
  )
  if (trimmed === existingAtSlot) {
    return Idle({
      tags: state.tags,
      inputField: state.inputField,
      maybeHighlightedIndex: Option.some(state.editingIndex),
    })
  }
  const otherTags = removeAt(state.tags, state.editingIndex)
  const isDuplicate =
    !allowDuplicatesOf(props) && Array.contains(otherTags, trimmed)
  const isValid =
    !isDuplicate &&
    (props.validateTag === undefined || props.validateTag(trimmed, otherTags))
  const nextTags = isValid
    ? replaceAt(state.tags, state.editingIndex, trimmed)
    : state.tags
  return Idle({
    tags: nextTags,
    inputField: state.inputField,
    maybeHighlightedIndex: Option.some(state.editingIndex),
  })
}

const handleChangeInput = (
  state: Idle,
  rawValue: string,
  props: Props,
): Idle => {
  const delimiter = delimiterOf(props)
  if (delimiter.length > 0 && rawValue.endsWith(delimiter)) {
    const withoutDelimiter = rawValue.slice(
      0,
      rawValue.length - delimiter.length,
    )
    const nextTags = appendCandidates(
      state.tags,
      splitByDelimiter(withoutDelimiter, props),
      props,
    )
    return Idle({
      tags: nextTags,
      inputField: FieldDraft.Editing({ value: '', draft: '' }),
      maybeHighlightedIndex: Option.none(),
    })
  } else {
    return Idle({
      tags: state.tags,
      inputField: changeInputField(state.inputField, rawValue, props),
      maybeHighlightedIndex: Option.none(),
    })
  }
}

const restingInputField = (field: FieldDraft.State): FieldDraft.Idle =>
  FieldDraft.Idle({ value: FieldDraft.draftOf(field) })

const resetToIdle = (props: Props): Idle =>
  Idle({
    tags: props.defaultTags ?? [],
    inputField: FieldDraft.initial,
    maybeHighlightedIndex: Option.none(),
  })

const handleIdleKey = (
  state: Idle,
  message: typeof PressedTagsKey.Type,
  props: Props,
): Option.Option<State> => {
  if (message.isComposing === true || !canEdit(props)) {
    return Option.none()
  }

  const delimiter = delimiterOf(props)
  const isAtStart =
    message.isCaretAtStart ?? FieldDraft.draftOf(state.inputField).length === 0
  const maybeMove = RovingFocus.moveOfKey(message.key, {
    orientation: 'Horizontal',
    direction: directionOf(props),
    pageKeys: false,
  })

  if (Option.isSome(state.maybeHighlightedIndex)) {
    const highlighted = state.maybeHighlightedIndex.value
    if (message.key === 'Escape') {
      return Option.some(
        Idle({
          tags: state.tags,
          inputField: state.inputField,
          maybeHighlightedIndex: Option.none(),
        }),
      )
    } else if (message.key === 'Enter' && isEditableOf(props)) {
      return Option.map(Array.get(state.tags, highlighted), value =>
        EditingTag({
          tags: state.tags,
          inputField: restingInputField(state.inputField),
          editingIndex: highlighted,
          tagField: FieldDraft.Editing({ value, draft: value }),
        }),
      )
    } else if (message.key === 'Backspace') {
      const nextTags = removeAt(state.tags, highlighted)
      const nextHighlight = Array.isReadonlyArrayEmpty(nextTags)
        ? Option.none<number>()
        : Option.some(Math.max(0, highlighted - 1))
      return Option.some(
        Idle({
          tags: nextTags,
          inputField: state.inputField,
          maybeHighlightedIndex: nextHighlight,
        }),
      )
    } else if (message.key === 'Delete') {
      const nextTags = removeAt(state.tags, highlighted)
      const nextHighlight = Array.isReadonlyArrayEmpty(nextTags)
        ? Option.none<number>()
        : Option.some(Math.min(highlighted, nextTags.length - 1))
      return Option.some(
        Idle({
          tags: nextTags,
          inputField: state.inputField,
          maybeHighlightedIndex: nextHighlight,
        }),
      )
    } else if (Option.isSome(maybeMove)) {
      const move = maybeMove.value
      if (move === 'Next' && highlighted >= state.tags.length - 1) {
        return Option.some(
          Idle({
            tags: state.tags,
            inputField: state.inputField,
            maybeHighlightedIndex: Option.none(),
          }),
        )
      }
      const nextHighlight = RovingFocus.stepEnabled({
        count: state.tags.length,
        current: Option.some(highlighted),
        move,
        loop: false,
      })
      return Option.some(
        Idle({
          tags: state.tags,
          inputField: state.inputField,
          maybeHighlightedIndex: nextHighlight,
        }),
      )
    } else {
      return Option.none()
    }
  } else {
    if (
      message.key === 'Enter' ||
      (delimiter.length > 0 && message.key === delimiter)
    ) {
      const candidate = FieldDraft.draftOf(state.inputField).trim()
      if (candidate.length === 0) {
        return Option.none()
      }
      const nextTags = appendCandidates(state.tags, [candidate], props)
      const didAdd = nextTags.length !== state.tags.length
      return Option.some(
        Idle({
          tags: nextTags,
          inputField: didAdd
            ? FieldDraft.Editing({ value: '', draft: '' })
            : state.inputField,
          maybeHighlightedIndex: Option.none(),
        }),
      )
    } else if (
      isAtStart &&
      Array.isReadonlyArrayNonEmpty(state.tags) &&
      (message.key === 'Backspace' || Option.contains(maybeMove, 'Previous'))
    ) {
      return Option.some(
        Idle({
          tags: state.tags,
          inputField: state.inputField,
          maybeHighlightedIndex: RovingFocus.lastEnabled(state.tags.length),
        }),
      )
    } else if (message.key === 'Escape') {
      const [cancelled] = FieldDraft.chart.transition(
        state.inputField,
        FieldDraft.CancelDraft(),
        fieldPropsOf(props),
      )
      return Option.some(
        Idle({
          tags: state.tags,
          inputField: cancelled,
          maybeHighlightedIndex: Option.none(),
        }),
      )
    } else {
      return Option.none()
    }
  }
}

const canEditGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => canEdit(context)

const asIdle = (maybeNext: Option.Option<State>): Option.Option<Idle> =>
  Option.flatMap(maybeNext, next =>
    next._tag === 'Idle' ? Option.some(next) : Option.none(),
  )

const asEditingTag = (
  maybeNext: Option.Option<State>,
): Option.Option<EditingTag> =>
  Option.flatMap(maybeNext, next =>
    next._tag === 'EditingTag' ? Option.some(next) : Option.none(),
  )

// CHART

/**
 * Builds the TagsInput Machine chart starting in `initialState`, composing
 * `FieldDraft` for tag entry and inline editing and `RovingFocus` for tag
 * highlighting and deletion.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          BeginTagInput: [
            when(canEditGuard, 'Idle', ({ state, context }) =>
              Idle({
                tags: state.tags,
                inputField: beginInputField(state.inputField, context),
                maybeHighlightedIndex: Option.none(),
              }),
            ),
            ignore(),
          ],
          ChangeTagInput: [
            when(canEditGuard, 'Idle', ({ state, message, context }) =>
              handleChangeInput(state, message.value, context),
            ),
            ignore(),
          ],
          AddTag: [
            when(canEditGuard, 'Idle', ({ state, message, context }) => {
              const raw = message.value ?? FieldDraft.draftOf(state.inputField)
              const nextTags = appendCandidates(state.tags, [raw], context)
              const shouldClearDraft =
                message.value === undefined &&
                nextTags.length !== state.tags.length
              return Idle({
                tags: nextTags,
                inputField: shouldClearDraft
                  ? FieldDraft.Idle({ value: '' })
                  : state.inputField,
                maybeHighlightedIndex: Option.none(),
              })
            }),
            ignore(),
          ],
          RemoveTag: [
            when(
              (state, message, context) =>
                canEdit(context) && isValidTagIndex(state.tags, message.index),
              'Idle',
              ({ state, message }) => {
                const nextTags = removeAt(state.tags, message.index)
                const nextHighlight = Option.flatMap(
                  state.maybeHighlightedIndex,
                  highlighted => {
                    if (Array.isReadonlyArrayEmpty(nextTags)) {
                      return Option.none<number>()
                    } else if (highlighted === message.index) {
                      return Option.none<number>()
                    } else if (highlighted > message.index) {
                      return Option.some(highlighted - 1)
                    } else {
                      return Option.some(highlighted)
                    }
                  },
                )
                return Idle({
                  tags: nextTags,
                  inputField: state.inputField,
                  maybeHighlightedIndex: nextHighlight,
                })
              },
            ),
            ignore(),
          ],
          HighlightTag: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) &&
                isValidTagIndex(state.tags, message.index),
              'Idle',
              ({ state, message }) =>
                Idle({
                  tags: state.tags,
                  inputField: state.inputField,
                  maybeHighlightedIndex: Option.some(message.index),
                }),
            ),
            ignore(),
          ],
          BeginEditTag: [
            when(
              (state, message, context) => {
                if (!canEdit(context) || !isEditableOf(context)) {
                  return Option.none()
                }
                const maybeIndex = Option.orElse(
                  Option.fromNullishOr(message.index),
                  () => state.maybeHighlightedIndex,
                )
                return Option.flatMap(maybeIndex, index =>
                  Option.map(Array.get(state.tags, index), value => ({
                    index,
                    value,
                  })),
                )
              },
              'EditingTag',
              ({ state, guardValue }) =>
                EditingTag({
                  tags: state.tags,
                  inputField: restingInputField(state.inputField),
                  editingIndex: guardValue.index,
                  tagField: FieldDraft.Editing({
                    value: guardValue.value,
                    draft: guardValue.value,
                  }),
                }),
            ),
            ignore(),
          ],
          ChangeEditedTag: [ignore()],
          CommitEditedTag: [ignore()],
          CancelEditTag: [ignore()],
          PasteTags: [
            when(canEditGuard, 'Idle', ({ state, message, context }) => {
              if (!addOnPasteOf(context)) {
                return Idle({
                  tags: state.tags,
                  inputField: changeInputField(
                    state.inputField,
                    FieldDraft.draftOf(state.inputField) + message.value,
                    context,
                  ),
                  maybeHighlightedIndex: Option.none(),
                })
              } else {
                const candidates = splitByDelimiter(message.value, context)
                const nextTags = appendCandidates(
                  state.tags,
                  candidates,
                  context,
                )
                return Idle({
                  tags: nextTags,
                  inputField: FieldDraft.Idle({ value: '' }),
                  maybeHighlightedIndex: Option.none(),
                })
              }
            }),
            ignore(),
          ],
          ClearTags: [when(canEditGuard, 'Idle', () => initial), ignore()],
          ResetTags: to('Idle', ({ context }) => resetToIdle(context)),
          EndTagInput: to('Idle', ({ state, context }) =>
            M.value(blurBehaviorOf(context)).pipe(
              M.withReturnType<Idle>(),
              M.when('Add', () => {
                const draft = FieldDraft.draftOf(state.inputField)
                const nextTags = appendCandidates(state.tags, [draft], context)
                return Idle({
                  tags: nextTags,
                  inputField: FieldDraft.Idle({ value: '' }),
                  maybeHighlightedIndex: Option.none(),
                })
              }),
              M.when('Clear', () =>
                Idle({
                  tags: state.tags,
                  inputField: FieldDraft.Idle({ value: '' }),
                  maybeHighlightedIndex: Option.none(),
                }),
              ),
              M.when('None', () =>
                Idle({
                  tags: state.tags,
                  inputField: FieldDraft.atRest(state.inputField),
                  maybeHighlightedIndex: Option.none(),
                }),
              ),
              M.exhaustive,
            ),
          ),
          PressedTagsKey: [
            when(
              (state, message, context) =>
                asEditingTag(handleIdleKey(state, message, context)),
              'EditingTag',
              ({ guardValue }) => guardValue,
            ),
            when(
              (state, message, context) =>
                asIdle(handleIdleKey(state, message, context)),
              'Idle',
              ({ guardValue }) => guardValue,
            ),
            ignore(),
          ],
          SetTags: [
            when(canEditGuard, 'Idle', ({ state, message }) =>
              Idle({
                tags: message.tags,
                inputField: state.inputField,
                maybeHighlightedIndex: Option.none(),
              }),
            ),
            ignore(),
          ],
        },
      },
      EditingTag: {
        on: {
          BeginTagInput: [
            when(canEditGuard, 'Idle', ({ state, context }) =>
              Idle({
                tags: state.tags,
                inputField: beginInputField(state.inputField, context),
                maybeHighlightedIndex: Option.none(),
              }),
            ),
            ignore(),
          ],
          ChangeTagInput: [ignore()],
          AddTag: [ignore()],
          RemoveTag: [
            when(
              (state, message, context) =>
                canEdit(context) && isValidTagIndex(state.tags, message.index),
              'Idle',
              ({ state, message }) =>
                Idle({
                  tags: removeAt(state.tags, message.index),
                  inputField: state.inputField,
                  maybeHighlightedIndex: Option.none(),
                }),
            ),
            ignore(),
          ],
          HighlightTag: [
            when(
              (state, message, context) =>
                !isDisabledOf(context) &&
                isValidTagIndex(state.tags, message.index),
              'Idle',
              ({ state, message }) =>
                Idle({
                  tags: state.tags,
                  inputField: state.inputField,
                  maybeHighlightedIndex: Option.some(message.index),
                }),
            ),
            ignore(),
          ],
          BeginEditTag: [ignore()],
          ChangeEditedTag: [
            when(canEditGuard, 'EditingTag', ({ state, message, context }) => {
              const [nextField] = FieldDraft.chart.transition(
                state.tagField,
                FieldDraft.ChangeDraft({ value: message.value }),
                fieldPropsOf(context),
              )
              const editingField =
                nextField._tag === 'Editing'
                  ? nextField
                  : FieldDraft.Editing({
                      value: state.tagField.value,
                      draft: message.value,
                    })
              return EditingTag({
                tags: state.tags,
                inputField: state.inputField,
                editingIndex: state.editingIndex,
                tagField: editingField,
              })
            }),
            ignore(),
          ],
          CommitEditedTag: [
            when(canEditGuard, 'Idle', ({ state, context }) =>
              commitEdited(state, context),
            ),
            ignore(),
          ],
          CancelEditTag: to('Idle', ({ state }) =>
            Idle({
              tags: state.tags,
              inputField: state.inputField,
              maybeHighlightedIndex: Option.some(state.editingIndex),
            }),
          ),
          PasteTags: [ignore()],
          ClearTags: [when(canEditGuard, 'Idle', () => initial), ignore()],
          ResetTags: to('Idle', ({ context }) => resetToIdle(context)),
          EndTagInput: to('Idle', ({ state, context }) => {
            const committed = commitEdited(state, context)
            return Idle({
              tags: committed.tags,
              inputField: committed.inputField,
              maybeHighlightedIndex: Option.none(),
            })
          }),
          PressedTagsKey: [
            when(
              (_state, message, context) =>
                canEdit(context) &&
                message.isComposing !== true &&
                message.key === 'Enter',
              'Idle',
              ({ state, context }) => commitEdited(state, context),
            ),
            when(
              (_state, message) =>
                message.isComposing !== true && message.key === 'Escape',
              'Idle',
              ({ state }) =>
                Idle({
                  tags: state.tags,
                  inputField: state.inputField,
                  maybeHighlightedIndex: Option.some(state.editingIndex),
                }),
            ),
            ignore(),
          ],
          SetTags: [
            when(canEditGuard, 'Idle', ({ state, message }) =>
              Idle({
                tags: message.tags,
                inputField: state.inputField,
                maybeHighlightedIndex: Option.none(),
              }),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** The default TagsInput Machine chart starting empty and idle. */
export const chart = chartOf(initial)

// SYNC

/**
 * Builds the TagsInput sync table using `Pace.Settled({ afterMs })` for
 * `ChangeTagInput` and `ChangeEditedTag`, and `Pace.Synced()` for discrete
 * tag mutations and navigation.
 */
export const syncOf = (
  settleMs: number = defaultSettleMs,
): Readonly<Record<Message['_tag'], Sync>> => ({
  BeginTagInput: Synced(),
  ChangeTagInput: Settled({ afterMs: settleMs }),
  AddTag: Synced(),
  RemoveTag: Synced(),
  HighlightTag: Synced(),
  BeginEditTag: Synced(),
  ChangeEditedTag: Settled({ afterMs: settleMs }),
  CommitEditedTag: Synced(),
  CancelEditTag: Synced(),
  PasteTags: Synced(),
  ClearTags: Synced(),
  ResetTags: Synced(),
  EndTagInput: Synced(),
  PressedTagsKey: Synced(),
  SetTags: Synced(),
})

/** Default synchronization table for TagsInput. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = syncOf()

/** Device-only synchronization table for a TagsInput kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  BeginTagInput: Device({ because }),
  ChangeTagInput: Device({ because }),
  AddTag: Device({ because }),
  RemoveTag: Device({ because }),
  HighlightTag: Device({ because }),
  BeginEditTag: Device({ because }),
  ChangeEditedTag: Device({ because }),
  CommitEditedTag: Device({ because }),
  CancelEditTag: Device({ because }),
  PasteTags: Device({ because }),
  ClearTags: Device({ because }),
  ResetTags: Device({ because }),
  EndTagInput: Device({ because }),
  PressedTagsKey: Device({ because }),
  SetTags: Device({ because }),
})

// SLOTS & PROJECTION

/**
 * The six painted slots of a TagsInput Part:
 * - `Root`: grouping container (`role="group"`).
 * - `Input`: new-tag text input (`role="textbox"`).
 * - `Tag`: one existing tag item keyed by its zero-based index (`role="option"`, `HighlightTag`).
 * - `TagDeleteButton`: remove button for one tag keyed by index (`role="button"`, `RemoveTag`).
 * - `ClearButton`: removes every tag (`role="button"`, `ClearTags`).
 * - `Label`: clickable label linked via `aria-labelledby` (`BeginTagInput`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Input: {
    role: 'TextBox',
    focus: 'None',
    gestures: [],
  },
  Tag: {
    role: 'Option',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'HighlightTag' }],
  },
  TagDeleteButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'RemoveTag' }],
  },
  ClearButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ClearTags' }],
  },
  Label: {
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'BeginTagInput' }],
  },
}

const labelSlotPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else if (props.hasLabel === false) {
    return props.label === undefined ? {} : { label: props.label }
  } else if (props.label !== undefined && props.hasLabel !== true) {
    return { label: props.label }
  } else {
    return { labelledBy: labelId(props.id) }
  }
}

const parseTagChoice = (
  maybeChoice: Option.Option<string>,
): Option.Option<number> =>
  Option.flatMap(maybeChoice, raw => {
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed >= 0
      ? Option.some(parsed)
      : Option.none()
  })

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const isInvalid = isInvalidOf(props) || isOverflowing(state, props)
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      ...labelSlotPropsOf(props),
      ...(props.describedBy === undefined
        ? {}
        : { describedBy: props.describedBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isInvalid ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Input') {
    return {
      id: inputId(props.id),
      tabIndex: isDisabledOf(props) ? -1 : 0,
      inputMode: 'Text',
      enterKeyHint: 'Done',
      ...labelSlotPropsOf(props),
      ...(props.describedBy === undefined
        ? {}
        : { describedBy: props.describedBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(isRequiredOf(props) ? { isRequired: true } : {}),
      ...(isInvalid ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Tag') {
    return Option.match(parseTagChoice(maybeChoice), {
      onNone: () => ({}),
      onSome: index => {
        const tagText = Option.getOrElse(Array.get(state.tags, index), () => '')
        const isHighlighted = Option.contains(highlightedIndexOf(state), index)
        const isEdited = Option.contains(editingIndexOf(state), index)
        return {
          id: tagId(props.id, index),
          label: tagText,
          isCurrent: isHighlighted || isEdited,
          tabIndex: isHighlighted ? 0 : -1,
          ...(isEdited ? { isHidden: true } : {}),
          ...(isDisabledOf(props) ? { isDisabled: true } : {}),
        }
      },
    })
  } else if (slot === 'TagDeleteButton') {
    return Option.match(parseTagChoice(maybeChoice), {
      onNone: () => ({}),
      onSome: index => {
        const tagText = Option.getOrElse(Array.get(state.tags, index), () => '')
        const isDisabled = !canEdit(props)
        return {
          id: tagDeleteButtonId(props.id, index),
          label: `Delete tag ${tagText}`,
          tabIndex: -1,
          ...(isDisabled ? { isDisabled: true } : {}),
        }
      },
    })
  } else if (slot === 'ClearButton') {
    const isHidden = isEmpty(state) || !canEdit(props)
    return {
      id: clearButtonId(props.id),
      controls: inputId(props.id),
      label: 'Clear tags',
      tabIndex: 0,
      ...(isHidden ? { isHidden: true } : {}),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'Label') {
    return {
      id: labelId(props.id),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens a TagsInput on: settles back to `Idle` with any
 * inline tag edit cleared, preserving committed tags and settled input text.
 */
export const atRest = (state: State): State =>
  Idle({
    tags: state.tags,
    inputField: FieldDraft.atRest(state.inputField),
    maybeHighlightedIndex: Option.none(),
  })

// PART FACTORY

/** Options for customizing a TagsInput Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  sync?: 'Synced' | DeviceReason
  settleMs?: number
  defaultTags?: ReadonlyArray<string>
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a TagsInput {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `ChangeTagInput` and `ChangeEditedTag` at `Pace.Settled`).
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> => {
  const settleMs = options.settleMs ?? defaultSettleMs
  const initialState: State =
    options.defaultTags === undefined
      ? initial
      : initialTags(options.defaultTags)
  return Part.define<State, Message, Props>({
    name: options.name ?? 'TagsInput',
    State,
    Message,
    chart: initialState === initial ? chart : chartOf(initialState),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? syncOf(settleMs)
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    configuration: options.configuration ?? {
      base: {
        pace: {
          ...defaultPace,
          typingSettleMs: settleMs,
        },
      },
      presets: {},
    },
  })
}

/** Shorthand for a TagsInput Part whose state stays on the device. */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> => {
  const { because, ...rest } = options
  return make({
    ...rest,
    sync: because ?? 'OwnView',
  })
}

/** The default synced TagsInput Part (`name: 'TagsInput'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
