import {
  Array,
  Match as M,
  Option,
  Predicate,
  Record,
  Result,
  Schema as S,
  SchemaAST,
  SchemaIssue,
  String,
  pipe,
} from 'effect'

import { wordsOf } from '../declaration/declaration.js'
import { type ModelPath, segmentsOf } from '../declaration/modelPath.js'
import {
  Box,
  Button,
  Column,
  Row,
  Text,
  TextInput,
} from '../renderers/elements.js'
import type {
  BoxNode,
  ColumnNode,
  TextInputNode,
  UiNode,
} from '../renderers/types.js'
import { m } from '../schema/index.js'
import * as FieldDraft from './fieldDraft.js'
import * as Fieldset from './fieldset.js'
import * as Input from './input.js'
import {
  Device,
  type DeviceReason,
  Settled,
  type Sync,
  Synced,
} from './pace.js'
import type { Part } from './part.js'
import {
  type Autofill,
  type EnterKeyHint,
  type InputMode,
  type SlotBinding,
  type SlotProps,
  autofillNameOf,
  bound,
} from './slot.js'
import * as Textarea from './textarea.js'

// NOTE: this is the core BoundField primitive (Scribe #2656). It binds a typed
// ModelPath (`at.profile.bio`) and an Effect Schema to FieldDraft and Fieldset
// so screens project inputs, textareas, and forms with zero manual value,
// change, blur, or WAI-ARIA prop wiring. All validation, error timing, lens
// reads/writes, and slot projections are pure and framework-free.

// SCHEMAS

/** Supported bound field control kinds (`'Text' | 'Textarea' | 'Secret'`). */
export const FieldKind = S.Literals(['Text', 'Textarea', 'Secret'])
/** Supported bound field control kinds. */
export type FieldKind = typeof FieldKind.Type

/**
 * When client Schema validation errors become visible on a bound field:
 * - `'Blur'`: once the field has been blurred/touched or the form has attempted submit (default).
 * - `'Change'`: as soon as the user edits, touches, or submits the field.
 * - `'Submit'`: only after the enclosing form attempts submission.
 */
export const ValidateOn = S.Literals(['Blur', 'Change', 'Submit'])
/** When client Schema validation errors become visible on a bound field. */
export type ValidateOn = typeof ValidateOn.Type

/**
 * Which error wins when both a server error and a client Schema error exist
 * for the same field:
 * - `'ServerFirst'`: server error takes precedence until cleared (default).
 * - `'ClientFirst'`: live client Schema error takes precedence over server errors.
 */
export const ErrorPriority = S.Literals(['ServerFirst', 'ClientFirst'])
/** Which error wins when both server and client errors exist for a field. */
export type ErrorPriority = typeof ErrorPriority.Type

/** Default validation visibility trigger (`'Blur'`). */
export const defaultValidateOn: ValidateOn = 'Blur'

/** Default typing-pause settle window in milliseconds (`200`), from `FieldDraft`. */
export const defaultSettleMs: number = FieldDraft.defaultSettleMs

// STATE

/**
 * Per-field editing state held in a Program's Model. Composes `FieldDraft.State`
 * with touched/changed flags and password visibility, staying plain JSON data.
 */
export const State = S.Struct({
  draft: FieldDraft.State,
  isTouched: S.Boolean,
  hasChanged: S.Boolean,
  isPasswordVisible: S.Boolean,
})
/** Per-field editing state held in a Program's Model. */
export type State = typeof State.Type

/** Creates an initial idle `BoundField.State` with optional committed `value` (`''` by default). */
export const initial = (value: string = ''): State => ({
  draft: FieldDraft.initialValue(value),
  isTouched: false,
  hasChanged: false,
  isPasswordVisible: false,
})

// MESSAGE

/** Enters edit mode for the bound field (focus). */
export const BeginFieldEdit = m('BeginFieldEdit')

/** Updates the live draft on this device; synced with `Pace.Settled` on typing pauses. */
export const ChangeFieldDraft = m('ChangeFieldDraft', { value: S.String })

/** Commits the current draft (applying optional trim/maxLength) and marks the field touched. */
export const CommitFieldDraft = m('CommitFieldDraft')

/** Discards the active draft and restores the last committed value. */
export const CancelFieldDraft = m('CancelFieldDraft')

/** Clears both committed value and draft to `''`. */
export const ClearFieldDraft = m('ClearFieldDraft')

/** Leaves edit mode (blur): applies `blurBehavior` / `commitOnBlur` and marks the field touched. */
export const BlurField = m('BlurField')

/** Reconciles an external or remote Model value without clobbering a dirty draft unless `force: true`. */
export const SetFieldModelValue = m('SetFieldModelValue', {
  value: S.String,
  force: S.optionalKey(S.Boolean),
})

/** Resets the field to its default value and clears touched/changed/visibility state. */
export const ResetBoundField = m('ResetBoundField')

/** Toggles whether a secret/password bound field reveals characters. */
export const ToggleFieldVisibility = m('ToggleFieldVisibility')

/** Marks the field touched so `'Blur'` validation surfaces without altering the draft. */
export const TouchField = m('TouchField')

/** Every Message handled by a `BoundField`. */
export const Message = S.Union([
  BeginFieldEdit,
  ChangeFieldDraft,
  CommitFieldDraft,
  CancelFieldDraft,
  ClearFieldDraft,
  BlurField,
  SetFieldModelValue,
  ResetBoundField,
  ToggleFieldVisibility,
  TouchField,
])
/** Every Message handled by a `BoundField`. */
export type Message = typeof Message.Type

/** True for a Message belonging to `BoundField`. */
export const isMessage = S.is(Message)

// METADATA

/** Deterministic element IDs derived from a `ModelPath`. */
export type FieldIds = Readonly<{
  field: string
  control: string
  input: string
  textarea: string
  label: string
  description: string
  error: string
  visibilityToggle: string
  clearButton: string
}>

/** Optional policies for defining a `BoundField`. */
export type FieldOptions = Readonly<{
  kind?: FieldKind
  label?: string
  description?: string
  why?: string
  placeholder?: string
  validateOn?: ValidateOn
  settleMs?: number
  sync?: 'Synced' | DeviceReason
  inputType?: Input.InputType
  inputMode?: InputMode
  enterKeyHint?: EnterKeyHint
  autofill?: Autofill
  trimOnCommit?: boolean
  commitOnBlur?: boolean
  blurBehavior?: FieldDraft.BlurBehavior
  defaultValue?: string
  maxLength?: number
  isRequired?: boolean
  isReadOnly?: boolean
  isDisabled?: boolean
  rows?: number
  minRows?: number
  maxRows?: number
  autoGrow?: boolean
  resize?: Textarea.ResizeMode
  submitOnModEnter?: boolean
  cancelOnEscape?: boolean
}>

/** Options accepted by {@link text}. */
export type TextOptions = Omit<
  FieldOptions,
  | 'kind'
  | 'rows'
  | 'minRows'
  | 'maxRows'
  | 'autoGrow'
  | 'resize'
  | 'submitOnModEnter'
  | 'cancelOnEscape'
>

/** Options accepted by {@link textarea}. */
export type TextareaOptions = Omit<FieldOptions, 'kind' | 'inputType'>

/** Options accepted by {@link secret}. */
export type SecretOptions = Omit<
  FieldOptions,
  | 'kind'
  | 'sync'
  | 'inputType'
  | 'rows'
  | 'minRows'
  | 'maxRows'
  | 'autoGrow'
  | 'resize'
  | 'submitOnModEnter'
  | 'cancelOnEscape'
>

/**
 * A Model-bound field declaration combining a typed `ModelPath<string>`, an
 * Effect Schema for validation and metadata derivation, and FieldDraft/Fieldset
 * policies.
 */
export type BoundField<A = string> = Readonly<{
  path: ModelPath<string>
  segments: ReadonlyArray<string>
  name: string
  id: string
  ids: FieldIds
  schema: S.Codec<A, string>
  kind: FieldKind
  label: string
  maybeDescription: Option.Option<string>
  maybeWhy: Option.Option<string>
  placeholder?: string
  inputType: Input.InputType
  inputMode?: InputMode
  enterKeyHint?: EnterKeyHint
  autofill?: Autofill
  validateOn: ValidateOn
  settleMs: number
  sync: 'Synced' | DeviceReason
  pace: Sync
  trimOnCommit: boolean
  commitOnBlur?: boolean
  blurBehavior?: FieldDraft.BlurBehavior
  defaultValue?: string
  maxLength?: number
  isRequired: boolean
  isReadOnly: boolean
  isDisabled: boolean
  rows?: number
  minRows?: number
  maxRows?: number
  autoGrow?: boolean
  resize?: Textarea.ResizeMode
  submitOnModEnter?: boolean
  cancelOnEscape?: boolean
}>

/** Any `BoundField`, whatever its decoded type `A`. */
export type AnyBoundField = BoundField<any>

/** Result of decoding a raw string through a bound field's Effect Schema. */
export type ValidationResult<A> =
  | Readonly<{ _tag: 'Valid'; value: A }>
  | Readonly<{
      _tag: 'Invalid'
      message: string
      issues: ReadonlyArray<string>
    }>

// INSPECTION

const whyKey = 'foldkitWhy'

const resolveStringAnnotation = (
  ast: SchemaAST.AST,
  key: string,
): Option.Option<string> =>
  Option.filter(
    Option.fromNullishOr(SchemaAST.resolveAt<unknown>(key)(ast)),
    (value): value is string =>
      Predicate.isString(value) && !String.isEmpty(value),
  )

const titleCaseWord = (word: string): string =>
  String.isEmpty(word)
    ? word
    : `${String.toUpperCase(word.slice(0, 1))}${word.slice(1)}`

const segmentWordsOf = (segment: string): ReadonlyArray<string> =>
  pipe(
    segment.split('-'),
    Array.flatMap(wordsOf),
    Array.filter(word => !String.isEmpty(word)),
  )

/**
 * Turns a camelCase, kebab-case, or snake_case segment into a human label:
 * `'bio'` -> `'Bio'`, `'displayName'` -> `'Display Name'`, `'first_name'` -> `'First Name'`.
 *
 * @example
 * ```typescript
 * labelFromSegment('displayName') // 'Display Name'
 * labelFromSegment('bio') // 'Bio'
 * ```
 */
export const labelFromSegment = (segment: string): string =>
  pipe(segmentWordsOf(segment), Array.map(titleCaseWord), Array.join(' '))

const kebabSegment = (segment: string): string =>
  Array.join(segmentWordsOf(segment), '-')

const pathNameOf = (segments: ReadonlyArray<string>): string =>
  Array.join(segments, '.')

const pathIdOf = (segments: ReadonlyArray<string>): string =>
  pipe(
    segments,
    Array.map(kebabSegment),
    Array.filter(part => !String.isEmpty(part)),
    Array.join('-'),
  )

const idsFor = (id: string, kind: FieldKind): FieldIds => ({
  field: id,
  control: kind === 'Textarea' ? Textarea.textareaId(id) : Input.inputId(id),
  input: Input.inputId(id),
  textarea: Textarea.textareaId(id),
  label: Input.labelId(id),
  description: Input.descriptionId(id),
  error: Input.errorId(id),
  visibilityToggle: Input.visibilityButtonId(id),
  clearButton: Input.clearButtonId(id),
})

type SchemaConstraints = Readonly<{
  minLength?: number
  maxLength?: number
}>

const mergeConstraints = (
  current: SchemaConstraints,
  next: SchemaConstraints,
): SchemaConstraints => ({
  ...(current.minLength === undefined && next.minLength === undefined
    ? {}
    : {
        minLength: Math.max(current.minLength ?? 0, next.minLength ?? 0),
      }),
  ...(current.maxLength === undefined && next.maxLength === undefined
    ? {}
    : {
        maxLength:
          current.maxLength === undefined
            ? next.maxLength
            : next.maxLength === undefined
              ? current.maxLength
              : Math.min(current.maxLength, next.maxLength),
      }),
})

const emptyConstraints: SchemaConstraints = {}

const constraintsOfCheck = (
  check: SchemaAST.Check<unknown>,
): SchemaConstraints => {
  if (check._tag === 'FilterGroup') {
    return Array.reduce(check.checks, emptyConstraints, (acc, inner) =>
      mergeConstraints(acc, constraintsOfCheck(inner)),
    )
  }
  const meta: unknown = check.annotations?.meta
  if (!Predicate.isObject(meta) || !Predicate.hasProperty(meta, '_tag')) {
    return emptyConstraints
  }
  if (
    meta._tag === 'isMinLength' &&
    Predicate.hasProperty(meta, 'minLength') &&
    Predicate.isNumber(meta.minLength)
  ) {
    return { minLength: meta.minLength }
  } else if (
    meta._tag === 'isMaxLength' &&
    Predicate.hasProperty(meta, 'maxLength') &&
    Predicate.isNumber(meta.maxLength)
  ) {
    return { maxLength: meta.maxLength }
  } else {
    return emptyConstraints
  }
}

const constraintsOfAst = (ast: SchemaAST.AST): SchemaConstraints => {
  const fromSelf =
    ast.checks === undefined
      ? emptyConstraints
      : Array.reduce(ast.checks, emptyConstraints, (acc, check) =>
          mergeConstraints(acc, constraintsOfCheck(check)),
        )
  if (ast.encoding === undefined) {
    return fromSelf
  }
  return Array.reduce(ast.encoding, fromSelf, (acc, link) =>
    mergeConstraints(acc, constraintsOfAst(link.to)),
  )
}

const labelOfSchema = (
  ast: SchemaAST.AST,
  segments: ReadonlyArray<string>,
  explicit?: string,
): string => {
  if (explicit !== undefined && !String.isEmpty(explicit)) {
    return explicit
  }
  const maybeTitle = Option.fromNullishOr(SchemaAST.resolveTitle(ast))
  if (Option.isSome(maybeTitle) && !String.isEmpty(maybeTitle.value)) {
    return maybeTitle.value
  }
  return Option.match(Array.last(segments), {
    onNone: () => 'Field',
    onSome: labelFromSegment,
  })
}

const descriptionOfSchema = (
  ast: SchemaAST.AST,
  explicit?: string,
): Option.Option<string> => {
  if (explicit !== undefined && !String.isEmpty(explicit)) {
    return Option.some(explicit)
  }
  return Option.orElse(
    Option.filter(
      Option.fromNullishOr(SchemaAST.resolveDescription(ast)),
      text => !String.isEmpty(text),
    ),
    () => resolveStringAnnotation(ast, 'what'),
  )
}

const whyOfSchema = (
  ast: SchemaAST.AST,
  explicit?: string,
): Option.Option<string> => {
  if (explicit !== undefined && !String.isEmpty(explicit)) {
    return Option.some(explicit)
  }
  return Option.orElse(resolveStringAnnotation(ast, whyKey), () =>
    resolveStringAnnotation(ast, 'why'),
  )
}

// CONSTRUCTORS

/**
 * Declares a Model-bound field from a typed `ModelPath<string>`, an Effect
 * Schema, and optional field policies. Automatically derives field name,
 * deterministic element IDs, human label/description from Schema annotations
 * (falling back to title-casing the final path segment), requiredness,
 * `maxLength`, and `Pace.Settled` synchronization.
 *
 * @example
 * ```typescript
 * const at = ModelPath.of(Model)
 * const bio = BoundField.define(
 *   at.profile.bio,
 *   S.String.pipe(S.check(S.isMinLength(3))),
 *   { kind: 'Textarea', placeholder: 'Tell us about yourself' },
 * )
 * bio.name // 'profile.bio'
 * bio.ids.textarea // 'profile-bio-textarea'
 * bio.label // 'Bio'
 * ```
 */
export const define = <A>(
  path: ModelPath<string>,
  schema: S.Codec<A, string>,
  options: FieldOptions = {},
): BoundField<A> => {
  const segments = segmentsOf(path)
  const kind: FieldKind = options.kind ?? 'Text'
  const id = pathIdOf(segments)
  const name = pathNameOf(segments)
  const constraints = constraintsOfAst(schema.ast)
  const settleMs = options.settleMs ?? defaultSettleMs
  const sync: 'Synced' | DeviceReason =
    options.sync ?? (kind === 'Secret' ? 'Secret' : 'Synced')
  const pace: Sync =
    sync === 'Synced'
      ? Settled({ afterMs: settleMs })
      : Device({ because: sync })
  const inputType: Input.InputType =
    kind === 'Secret'
      ? 'password'
      : (options.inputType ?? Input.defaultInputType)
  const maxLength = options.maxLength ?? constraints.maxLength
  const isRequired =
    options.isRequired ??
    (constraints.minLength !== undefined && constraints.minLength >= 1)

  return {
    path,
    segments,
    name,
    id,
    ids: idsFor(id, kind),
    schema,
    kind,
    label: labelOfSchema(schema.ast, segments, options.label),
    maybeDescription: descriptionOfSchema(schema.ast, options.description),
    maybeWhy: whyOfSchema(schema.ast, options.why),
    ...(options.placeholder === undefined
      ? {}
      : { placeholder: options.placeholder }),
    inputType,
    ...(options.inputMode === undefined
      ? {}
      : { inputMode: options.inputMode }),
    ...(options.enterKeyHint === undefined
      ? {}
      : { enterKeyHint: options.enterKeyHint }),
    ...(options.autofill === undefined ? {} : { autofill: options.autofill }),
    validateOn: options.validateOn ?? defaultValidateOn,
    settleMs,
    sync,
    pace,
    trimOnCommit: options.trimOnCommit === true,
    ...(options.commitOnBlur === undefined
      ? {}
      : { commitOnBlur: options.commitOnBlur }),
    ...(options.blurBehavior === undefined
      ? {}
      : { blurBehavior: options.blurBehavior }),
    ...(options.defaultValue === undefined
      ? {}
      : { defaultValue: options.defaultValue }),
    ...(maxLength === undefined ? {} : { maxLength }),
    isRequired,
    isReadOnly: options.isReadOnly === true,
    isDisabled: options.isDisabled === true,
    ...(options.rows === undefined ? {} : { rows: options.rows }),
    ...(options.minRows === undefined ? {} : { minRows: options.minRows }),
    ...(options.maxRows === undefined ? {} : { maxRows: options.maxRows }),
    ...(options.autoGrow === undefined ? {} : { autoGrow: options.autoGrow }),
    ...(options.resize === undefined ? {} : { resize: options.resize }),
    ...(options.submitOnModEnter === undefined
      ? {}
      : { submitOnModEnter: options.submitOnModEnter }),
    ...(options.cancelOnEscape === undefined
      ? {}
      : { cancelOnEscape: options.cancelOnEscape }),
  }
}

/**
 * Declares a single-line text `BoundField` backed by `ModelPath<string>` and
 * an Effect Schema.
 *
 * @example
 * ```typescript
 * const email = BoundField.text(at.profile.email, EmailSchema, { inputType: 'email' })
 * ```
 */
export const text = <A>(
  path: ModelPath<string>,
  schema: S.Codec<A, string>,
  options: TextOptions = {},
): BoundField<A> => define(path, schema, { ...options, kind: 'Text' })

/**
 * Declares a multiline textarea `BoundField` backed by `ModelPath<string>` and
 * an Effect Schema.
 *
 * @example
 * ```typescript
 * const bio = BoundField.textarea(at.profile.bio, BioSchema, { minRows: 3, maxRows: 8 })
 * ```
 */
export const textarea = <A>(
  path: ModelPath<string>,
  schema: S.Codec<A, string>,
  options: TextareaOptions = {},
): BoundField<A> => define(path, schema, { ...options, kind: 'Textarea' })

/**
 * Declares a secret/password `BoundField` whose keystrokes stay strictly on
 * the device (`Pace.Device({ because: 'Secret' })`) and never leak raw values
 * into validation error messages or synced logs.
 *
 * @example
 * ```typescript
 * const password = BoundField.secret(at.auth.password, PasswordSchema)
 * ```
 */
export const secret = <A>(
  path: ModelPath<string>,
  schema: S.Codec<A, string>,
  options: SecretOptions = {},
): BoundField<A> =>
  define(path, schema, {
    ...options,
    kind: 'Secret',
    inputType: 'password',
    sync: 'Secret',
  })

// LENS

const isPlainObject = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  Predicate.isObject(value) && !Array.isArray(value)

const readSegmentsRaw = (
  current: unknown,
  segments: ReadonlyArray<string>,
): Option.Option<unknown> =>
  Array.matchLeft(segments, {
    onEmpty: () => Option.some(current),
    onNonEmpty: (head, tail) => {
      if (Option.isOption(current)) {
        return Option.flatMap(current, inner =>
          readSegmentsRaw(inner, segments),
        )
      } else if (isPlainObject(current) && Object.hasOwn(current, head)) {
        return readSegmentsRaw(Reflect.get(current, head), tail)
      } else {
        return Option.none()
      }
    },
  })

const writeSegmentsRaw = (
  current: unknown,
  segments: ReadonlyArray<string>,
  value: unknown,
): unknown =>
  Array.matchLeft(segments, {
    onEmpty: () => value,
    onNonEmpty: (head, tail) => {
      if (Option.isOption(current)) {
        return Option.map(current, inner =>
          writeSegmentsRaw(inner, segments, value),
        )
      } else if (isPlainObject(current) && Object.hasOwn(current, head)) {
        return {
          ...current,
          [head]: writeSegmentsRaw(Reflect.get(current, head), tail, value),
        }
      } else {
        return current
      }
    },
  })

/**
 * Pure immutable lens reader for a `ModelPath`: walks plain nested records and
 * `Option.Some` submodels along `ModelPath.segmentsOf(path)` with zero type
 * assertions. When `schema` is omitted, reads a `string` path; pass a Schema
 * decoder to decode any typed field value.
 *
 * @example
 * ```typescript
 * BoundField.readAt(model, at.profile.bio) // Option.some('Hello')
 * BoundField.readAt(model, at.count, S.Number) // Option.some(3)
 * ```
 */
export function readAt(
  model: unknown,
  path: ModelPath<string>,
): Option.Option<string>
export function readAt<A>(
  model: unknown,
  path: ModelPath<A>,
  schema: S.Decoder<A>,
): Option.Option<A>
export function readAt(
  model: unknown,
  path: ModelPath<unknown>,
  schema?: S.Decoder<unknown>,
): Option.Option<unknown> {
  const maybeRaw = readSegmentsRaw(model, segmentsOf(path))
  if (Option.isNone(maybeRaw)) {
    return Option.none()
  }
  if (schema !== undefined) {
    return S.decodeUnknownOption(schema)(maybeRaw.value)
  } else {
    return Predicate.isString(maybeRaw.value)
      ? Option.some(maybeRaw.value)
      : Option.none()
  }
}

/**
 * Pure immutable lens writer for a `ModelPath`: updates the nested value along
 * `ModelPath.segmentsOf(path)` (including inside `Option.Some` submodels) while
 * leaving all sibling fields untouched and performing zero type assertions.
 *
 * @example
 * ```typescript
 * const next = BoundField.writeAt(model, at.profile.bio, 'New bio')
 * ```
 */
export const writeAt = <Model extends object, A>(
  model: Model,
  path: ModelPath<A>,
  value: A,
): Model => {
  const segments = segmentsOf(path)
  return Array.matchLeft(segments, {
    onEmpty: () => model,
    onNonEmpty: (head, tail) => {
      if (!Object.hasOwn(model, head)) {
        return model
      }
      const nextChild = writeSegmentsRaw(Reflect.get(model, head), tail, value)
      return { ...model, [head]: nextChild }
    },
  })
}

/**
 * Reads the current string value of `field` from `model`, falling back to
 * `field.defaultValue ?? ''` when the path is absent (for example inside `Option.none()`).
 *
 * @example
 * ```typescript
 * BoundField.readField(model, bioField) // 'Writer'
 * ```
 */
export const readField = (model: unknown, field: AnyBoundField): string =>
  Option.getOrElse(readAt(model, field.path), () => field.defaultValue ?? '')

/**
 * Immutably writes `value` to `field.path` inside `model`.
 *
 * @example
 * ```typescript
 * BoundField.writeField(model, bioField, 'Updated bio')
 * ```
 */
export const writeField = <Model extends object>(
  model: Model,
  field: AnyBoundField,
  value: string,
): Model => writeAt(model, field.path, value)

/**
 * Builds an initial `BoundField.State` hydrated from `model` at `field.path`.
 *
 * @example
 * ```typescript
 * const bioState = BoundField.initialFromModel(model, bioField)
 * ```
 */
export const initialFromModel = (model: unknown, field: AnyBoundField): State =>
  initial(readField(model, field))

// VALIDATION

const expectedPattern = /^Expected (.*), got (.*)$/u

const formatRawMessage = (
  raw: string,
  label: string,
  isSecret: boolean,
): string => {
  const firstLine = Option.getOrElse(Array.head(raw.split('\n')), () => raw)
  const matched = expectedPattern.exec(firstLine)
  if (matched === null) {
    return firstLine
  }
  const expected = matched[1] ?? ''
  const actual = matched[2] ?? ''
  if (isSecret) {
    return `${label} must be ${expected}`
  } else {
    return `${label} must be ${expected} (got ${actual})`
  }
}

const formatFilterMeta = (
  meta: unknown,
  label: string,
): Option.Option<string> => {
  if (!Predicate.isObject(meta) || !Predicate.hasProperty(meta, '_tag')) {
    return Option.none()
  }
  if (
    meta._tag === 'isMinLength' &&
    Predicate.hasProperty(meta, 'minLength') &&
    Predicate.isNumber(meta.minLength)
  ) {
    return Option.some(
      meta.minLength <= 1
        ? `${label} is required`
        : `${label} must be at least ${meta.minLength.toString()} characters`,
    )
  } else if (
    meta._tag === 'isMaxLength' &&
    Predicate.hasProperty(meta, 'maxLength') &&
    Predicate.isNumber(meta.maxLength)
  ) {
    return Option.some(
      `${label} must be at most ${meta.maxLength.toString()} characters`,
    )
  } else if (meta._tag === 'isPattern') {
    return Option.some(`${label} does not match the required format`)
  } else {
    return Option.none()
  }
}

const formatIssue = (
  issue: SchemaIssue.Issue,
  label: string,
  isSecret: boolean,
): ReadonlyArray<string> =>
  M.value(issue).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      Filter: filterIssue => {
        const customMessage = SchemaIssue.defaultCheckHook(filterIssue)
        if (customMessage !== undefined) {
          return [customMessage]
        }
        const fromMeta = formatFilterMeta(
          filterIssue.filter.annotations?.meta,
          label,
        )
        if (Option.isSome(fromMeta)) {
          return [fromMeta.value]
        }
        return [formatRawMessage(filterIssue.toString(), label, isSecret)]
      },
      Composite: composite =>
        Array.flatMap(composite.issues, inner =>
          formatIssue(inner, label, isSecret),
        ),
      Encoding: encoding => formatIssue(encoding.issue, label, isSecret),
      Pointer: pointer => formatIssue(pointer.issue, label, isSecret),
      AnyOf: anyOf =>
        Array.isReadonlyArrayNonEmpty(anyOf.issues)
          ? Array.flatMap(anyOf.issues, inner =>
              formatIssue(inner, label, isSecret),
            )
          : [formatRawMessage(anyOf.toString(), label, isSecret)],
      InvalidType: leaf => [formatRawMessage(leaf.toString(), label, isSecret)],
      InvalidValue: leaf => {
        const custom = leaf.annotations?.message
        if (Predicate.isString(custom)) {
          return [custom]
        } else {
          return [formatRawMessage(leaf.toString(), label, isSecret)]
        }
      },
      MissingKey: () => [`${label} is required`],
      UnexpectedKey: leaf => [
        formatRawMessage(leaf.toString(), label, isSecret),
      ],
      Forbidden: leaf => [formatRawMessage(leaf.toString(), label, isSecret)],
      OneOf: leaf => [formatRawMessage(leaf.toString(), label, isSecret)],
    }),
  )

/**
 * Decodes `rawValue` against `field.schema` using Effect Schema (`decodeUnknownResult`)
 * and returns either `{ _tag: 'Valid', value }` or `{ _tag: 'Invalid', message, issues }`
 * with clean human-readable error text.
 *
 * @example
 * ```typescript
 * BoundField.validate(bioField, 'hi')
 * // { _tag: 'Invalid', message: 'Bio must be at least 3 characters', issues: [...] }
 * BoundField.validate(bioField, 'Writer')
 * // { _tag: 'Valid', value: 'Writer' }
 * ```
 */
export const validate = <A>(
  field: BoundField<A>,
  rawValue: string,
): ValidationResult<A> => {
  const isSecret = field.kind === 'Secret'
  const decoded = S.decodeUnknownResult(field.schema)(rawValue, {
    errors: 'all',
  })
  if (Result.isFailure(decoded)) {
    const rawIssues = formatIssue(decoded.failure.issue, field.label, isSecret)
    const issues = Array.isReadonlyArrayNonEmpty(rawIssues)
      ? Array.dedupe(rawIssues)
      : [`${field.label} is invalid`]
    const message = Option.getOrElse(
      Array.head(issues),
      () => `${field.label} is invalid`,
    )
    return { _tag: 'Invalid', message, issues }
  }
  if (field.isRequired && String.isEmpty(String.trim(rawValue))) {
    const message = `${field.label} is required`
    return { _tag: 'Invalid', message, issues: [message] }
  }
  return { _tag: 'Valid', value: decoded.success }
}

/** Validates the live text (`draftOf(state)`) of `field`. */
export const validateState = <A>(
  field: BoundField<A>,
  state: State,
): ValidationResult<A> => validate(field, draftOf(state))

// READINGS

/** The committed string value held by `state`. */
export const valueOf = (state: State): string => FieldDraft.valueOf(state.draft)

/** The live text shown in the control (`draft` while editing, else committed `value`). */
export const draftOf = (state: State): string => FieldDraft.draftOf(state.draft)

/** True while the field is actively being edited. */
export const isEditing = (state: State): boolean =>
  FieldDraft.isEditing(state.draft)

/** True while the field is idle. */
export const isIdle = (state: State): boolean => FieldDraft.isIdle(state.draft)

/** True when editing and the live draft differs from the committed value. */
export const isDirty = (state: State): boolean =>
  FieldDraft.isDirty(state.draft)

/** True once the field has been blurred, committed, or explicitly touched. */
export const isTouched = (state: State): boolean => state.isTouched

/** True once the user has changed or cleared the draft since init or reset. */
export const hasChanged = (state: State): boolean => state.hasChanged

/** True when the displayed text is empty (`''`). */
export const isEmpty = (state: State): boolean =>
  FieldDraft.isEmpty(state.draft)

/** True when the displayed text is empty or whitespace-only. */
export const isBlank = (state: State): boolean =>
  FieldDraft.isBlank(state.draft)

/** True when password visibility is toggled on for a secret field. */
export const isPasswordVisible = (state: State): boolean =>
  state.isPasswordVisible

/** Effective input type (`'text'` when a secret field is revealed, else `field.inputType`). */
export const effectiveInputTypeOf = (
  field: AnyBoundField,
  state: State,
): Input.InputType =>
  field.inputType === 'password' && state.isPasswordVisible
    ? 'text'
    : field.inputType

/** Context supplied when reading or projecting a field inside an optional Fieldset. */
export type FieldContext = Readonly<{
  fieldset?: Fieldset.State
  fieldsetProps?: Pick<Fieldset.Props, 'isDisabled'>
  isDisabled?: boolean
  errorPriority?: ErrorPriority
}>

/**
 * True when the field is disabled either directly, via `context.isDisabled`,
 * or via an enclosing disabled `Fieldset`.
 */
export const isDisabledOf = (
  field: AnyBoundField,
  context: FieldContext = {},
): boolean => {
  const localDisabled = field.isDisabled || context.isDisabled === true
  if (context.fieldset === undefined) {
    return localDisabled || Fieldset.isDisabledOf(context.fieldsetProps)
  } else {
    return Fieldset.isFieldDisabled(
      context.fieldset,
      localDisabled,
      context.fieldsetProps,
    )
  }
}

/**
 * True when client Schema validation should currently surface for `field`,
 * honoring `field.validateOn` (`'Blur' | 'Change' | 'Submit'`) and always
 * showing once the enclosing `Fieldset` has attempted submission.
 */
export const shouldShowError = (
  field: AnyBoundField,
  state: State,
  context: Pick<FieldContext, 'fieldset'> = {},
): boolean => {
  if (
    context.fieldset !== undefined &&
    Fieldset.hasAttemptedSubmit(context.fieldset)
  ) {
    return true
  }
  return M.value(field.validateOn).pipe(
    M.withReturnType<boolean>(),
    M.when(
      'Change',
      () => state.hasChanged || state.isTouched || isDirty(state),
    ),
    M.when('Blur', () => state.isTouched),
    M.when('Submit', () => false),
    M.exhaustive,
  )
}

/**
 * Resolves the active visible error message for `field`, cleanly merging live
 * Schema validation errors (gated by `validateOn`), `Fieldset.fieldErrors`,
 * and `Fieldset.serverErrors`. Defaults to `'ServerFirst'` so server errors
 * take precedence until cleared; pass `errorPriority: 'ClientFirst'` to prefer
 * live client validation first.
 *
 * @example
 * ```typescript
 * BoundField.errorOf(bioField, blurredState, { fieldset })
 * // Option.some('Bio must be at least 3 characters')
 * ```
 */
export const errorOf = (
  field: AnyBoundField,
  state: State,
  context: Pick<FieldContext, 'fieldset' | 'errorPriority'> = {},
): Option.Option<string> => {
  const maybeSchemaError: Option.Option<string> = shouldShowError(
    field,
    state,
    context,
  )
    ? (() => {
        const result = validateState(field, state)
        return result._tag === 'Invalid'
          ? Option.some(result.message)
          : Option.none()
      })()
    : Option.none()

  const maybeFieldsetClientError =
    context.fieldset === undefined
      ? Option.none<string>()
      : Record.get(context.fieldset.fieldErrors, field.name)

  const maybeServerError =
    context.fieldset === undefined
      ? Option.none<string>()
      : Record.get(context.fieldset.serverErrors, field.name)

  const priority: ErrorPriority = context.errorPriority ?? 'ServerFirst'
  return M.value(priority).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.when('ServerFirst', () =>
      Option.orElse(maybeServerError, () =>
        Option.orElse(maybeSchemaError, () => maybeFieldsetClientError),
      ),
    ),
    M.when('ClientFirst', () =>
      Option.orElse(maybeSchemaError, () =>
        Option.orElse(maybeFieldsetClientError, () => maybeServerError),
      ),
    ),
    M.exhaustive,
  )
}

/** True when `field` currently has a visible client or server error. */
export const isInvalidOf = (
  field: AnyBoundField,
  state: State,
  context: Pick<FieldContext, 'fieldset' | 'errorPriority'> = {},
): boolean => Option.isSome(errorOf(field, state, context))

/** True when `field.schema` accepts the current draft and no server error is active. */
export const isValidOf = (
  field: AnyBoundField,
  state: State,
  context: Pick<FieldContext, 'fieldset'> = {},
): boolean =>
  validateState(field, state)._tag === 'Valid' &&
  (context.fieldset === undefined ||
    !Fieldset.isFieldServerInvalidOf(context.fieldset, field.name))

// TRANSITIONS

const fieldDraftPropsOf = (
  field: AnyBoundField,
  context: FieldContext = {},
): FieldDraft.Props => ({
  isDisabled: isDisabledOf(field, context),
  isReadOnly: field.isReadOnly,
  trimOnCommit: field.trimOnCommit,
  settleMs: field.settleMs,
  ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
  ...(field.commitOnBlur === undefined
    ? {}
    : { commitOnBlur: field.commitOnBlur }),
  ...(field.blurBehavior === undefined
    ? {}
    : { blurBehavior: field.blurBehavior }),
  ...(field.defaultValue === undefined
    ? {}
    : { defaultValue: field.defaultValue }),
})

/**
 * Synchronization table for a `BoundField`'s Messages: `ChangeFieldDraft` uses
 * `Pace.Settled({ afterMs: field.settleMs })` (200 ms default) for synced
 * fields, or `Pace.Device({ because })` for `secret` / device-only fields.
 */
export const syncOf = (
  field: AnyBoundField,
): Readonly<Record<Message['_tag'], Sync>> => {
  if (field.sync !== 'Synced') {
    const local = Device({ because: field.sync })
    return {
      BeginFieldEdit: local,
      ChangeFieldDraft: local,
      CommitFieldDraft: local,
      CancelFieldDraft: local,
      ClearFieldDraft: local,
      BlurField: local,
      SetFieldModelValue: local,
      ResetBoundField: local,
      ToggleFieldVisibility: local,
      TouchField: local,
    }
  }
  return {
    BeginFieldEdit: Synced(),
    ChangeFieldDraft: Settled({ afterMs: field.settleMs }),
    CommitFieldDraft: Synced(),
    CancelFieldDraft: Synced(),
    ClearFieldDraft: Synced(),
    BlurField: Synced(),
    SetFieldModelValue: Synced(),
    ResetBoundField: Synced(),
    ToggleFieldVisibility: Synced(),
    TouchField: Synced(),
  }
}

/** Returns the {@link Sync} pace for one `BoundField.Message`. */
export const paceOf = (field: AnyBoundField, message: Message): Sync =>
  syncOf(field)[message._tag]

/**
 * What a restart opens a `BoundField` on: settles `draft` to `Idle` preserving
 * the latest settled text and masks any revealed secret.
 */
export const atRest = (state: State): State => ({
  ...state,
  draft: FieldDraft.atRest(state.draft),
  isPasswordVisible: false,
})

/**
 * Pure state transition for one `BoundField.Message`, delegating draft editing
 * to `FieldDraft.chart` while enforcing disabled/read-only guards from both
 * the field and any enclosing `Fieldset`.
 *
 * @example
 * ```typescript
 * const next = BoundField.transition(bioField, state, BoundField.ChangeFieldDraft({ value: 'Hi' }))
 * ```
 */
export const transition = (
  field: AnyBoundField,
  state: State,
  message: Message,
  context: FieldContext = {},
): State => {
  const draftProps = fieldDraftPropsOf(field, context)
  const stepDraft = (draftMessage: FieldDraft.Message): FieldDraft.State =>
    FieldDraft.chart.transition(state.draft, draftMessage, draftProps)[0]

  return M.value(message).pipe(
    M.withReturnType<State>(),
    M.tagsExhaustive({
      BeginFieldEdit: () => ({
        ...state,
        draft: stepDraft(FieldDraft.BeginEdit()),
      }),
      ChangeFieldDraft: ({ value }) => {
        if (!FieldDraft.canEdit(draftProps)) {
          return state
        }
        return {
          ...state,
          draft: stepDraft(FieldDraft.ChangeDraft({ value })),
          hasChanged: true,
        }
      },
      CommitFieldDraft: () => ({
        ...state,
        draft: stepDraft(FieldDraft.CommitDraft()),
        isTouched: true,
      }),
      CancelFieldDraft: () => ({
        ...state,
        draft: stepDraft(FieldDraft.CancelDraft()),
      }),
      ClearFieldDraft: () => {
        if (!FieldDraft.canEdit(draftProps)) {
          return state
        }
        return {
          ...state,
          draft: stepDraft(FieldDraft.ClearDraft()),
          hasChanged: true,
        }
      },
      BlurField: () => ({
        ...state,
        draft: stepDraft(FieldDraft.EndEdit()),
        isTouched: true,
      }),
      SetFieldModelValue: ({ value, force }) => ({
        ...state,
        draft: stepDraft(
          FieldDraft.SetFieldValue({
            value,
            ...(force === undefined ? {} : { force }),
          }),
        ),
      }),
      ResetBoundField: () => ({
        draft: stepDraft(FieldDraft.ResetField()),
        isTouched: false,
        hasChanged: false,
        isPasswordVisible: false,
      }),
      ToggleFieldVisibility: () => {
        if (field.inputType !== 'password' || !FieldDraft.canEdit(draftProps)) {
          return state
        }
        return {
          ...state,
          isPasswordVisible: !state.isPasswordVisible,
        }
      },
      TouchField: () => ({
        ...state,
        isTouched: true,
      }),
    }),
  )
}

/**
 * Reconciles an external or remote `Model` update into `state` via
 * `FieldDraft.SetFieldValue`, preserving a dirty local draft unless `force: true`.
 */
export const syncFromModel = (
  field: AnyBoundField,
  model: unknown,
  state: State,
  options: Readonly<{ force?: boolean }> = {},
): State =>
  transition(
    field,
    state,
    SetFieldModelValue({
      value: readField(model, field),
      ...(options.force === undefined ? {} : { force: options.force }),
    }),
  )

/** Result of applying a `BoundField.Message` across `model`, `state`, and optional `fieldset`. */
export type ModelApplyResult<Model> = Readonly<{
  model: Model
  state: State
  fieldset?: Fieldset.State
}>

/**
 * Transitions `state` for `message`, writes any newly committed value back
 * into `model` at `field.path` immutably, and keeps an enclosing `Fieldset`'s
 * per-field validation errors in sync when supplied.
 *
 * @example
 * ```typescript
 * const { model: nextModel, state: nextState } = BoundField.applyToModel(
 *   bioField,
 *   model,
 *   bioState,
 *   BoundField.BlurField(),
 * )
 * ```
 */
export const applyToModel = <Model extends object>(
  field: AnyBoundField,
  model: Model,
  state: State,
  message: Message,
  context: FieldContext = {},
): ModelApplyResult<Model> => {
  const nextState = transition(field, state, message, context)
  const committedBefore = valueOf(state)
  const committedAfter = valueOf(nextState)
  const nextModel =
    committedAfter !== committedBefore
      ? writeField(model, field, committedAfter)
      : model

  if (context.fieldset === undefined) {
    return { model: nextModel, state: nextState }
  }
  const fieldsetProps: Fieldset.Props = {
    id: field.id,
    ...(context.fieldsetProps?.isDisabled === undefined
      ? {}
      : { isDisabled: context.fieldsetProps.isDisabled }),
  }
  const shouldSyncError = shouldShowError(field, nextState, {
    fieldset: context.fieldset,
  })
  const validation = validateState(field, nextState)
  const fieldsetMessage: Fieldset.Message =
    shouldSyncError && validation._tag === 'Invalid'
      ? Fieldset.SetFieldError({
          field: field.name,
          message: validation.message,
        })
      : Fieldset.ClearFieldError({ field: field.name })
  const [nextFieldset] = Fieldset.chart.transition(
    context.fieldset,
    fieldsetMessage,
    fieldsetProps,
  )
  return { model: nextModel, state: nextState, fieldset: nextFieldset }
}

// PROJECTION

/** The complete set of WAI-ARIA `SlotBinding`s derived for a `BoundField`. */
export type BoundFieldSlots = Readonly<{
  control: SlotBinding
  label: SlotBinding
  description: SlotBinding
  error: SlotBinding
  visibilityToggle: SlotBinding
  clearButton: SlotBinding
}>

/** Options for projecting a `BoundField` to `Input.Props`, `Textarea.Props`, slots, or `UiNode`s. */
export type ProjectOptions = FieldContext &
  Readonly<{
    actionPrefix?: string
    focused?: boolean
    width?: number
    showClearButton?: boolean
    showVisibilityToggle?: boolean
    showDescription?: boolean
  }>

const tokenPrefixOf = (
  field: AnyBoundField,
  options: ProjectOptions = {},
): string => options.actionPrefix ?? `${field.name}:`

const describedByOf = (
  field: AnyBoundField,
  isInvalid: boolean,
  showDescription: boolean,
): Option.Option<string> => {
  const ids: ReadonlyArray<string> = [
    ...(showDescription && Option.isSome(field.maybeDescription)
      ? [field.ids.description]
      : []),
    ...(isInvalid ? [field.ids.error] : []),
  ]
  return Array.isReadonlyArrayEmpty(ids)
    ? Option.none()
    : Option.some(Array.join(ids, ' '))
}

/**
 * Projects `field` and `state` onto {@link Input.Props} with zero manual ID,
 * label, description, error, disabled, or ARIA wiring.
 */
export const toInputProps = (
  field: AnyBoundField,
  state: State,
  options: ProjectOptions = {},
): Input.Props => {
  const isDisabled = isDisabledOf(field, options)
  const isInvalid = isInvalidOf(field, state, options)
  const hasDescription =
    options.showDescription !== false && Option.isSome(field.maybeDescription)
  return {
    id: field.id,
    name: field.name,
    type: field.inputType,
    label: field.label,
    hasLabel: true,
    hasDescription,
    hasError: true,
    isDisabled,
    isReadOnly: field.isReadOnly,
    isRequired: field.isRequired,
    isInvalid,
    trimOnCommit: field.trimOnCommit,
    settleMs: field.settleMs,
    ...(field.placeholder === undefined
      ? {}
      : { placeholder: field.placeholder }),
    ...(field.autofill === undefined
      ? {}
      : { autoComplete: autofillNameOf(field.autofill) }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    ...(field.commitOnBlur === undefined
      ? {}
      : { commitOnBlur: field.commitOnBlur }),
    ...(field.blurBehavior === undefined
      ? {}
      : { blurBehavior: field.blurBehavior }),
    ...(field.defaultValue === undefined
      ? {}
      : { defaultValue: field.defaultValue }),
  }
}

/**
 * Projects `field` and `state` onto {@link Textarea.Props} with zero manual ID,
 * label, description, error, row bounds, disabled, or ARIA wiring.
 */
export const toTextareaProps = (
  field: AnyBoundField,
  state: State,
  options: ProjectOptions = {},
): Textarea.Props => {
  const isDisabled = isDisabledOf(field, options)
  const isInvalid = isInvalidOf(field, state, options)
  const hasDescription =
    options.showDescription !== false && Option.isSome(field.maybeDescription)
  return {
    id: field.id,
    name: field.name,
    label: field.label,
    hasLabel: true,
    hasDescription,
    hasError: true,
    isDisabled,
    isReadOnly: field.isReadOnly,
    isRequired: field.isRequired,
    isInvalid,
    trimOnCommit: field.trimOnCommit,
    settleMs: field.settleMs,
    ...(field.placeholder === undefined
      ? {}
      : { placeholder: field.placeholder }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    ...(field.commitOnBlur === undefined
      ? {}
      : { commitOnBlur: field.commitOnBlur }),
    ...(field.blurBehavior === undefined
      ? {}
      : { blurBehavior: field.blurBehavior }),
    ...(field.defaultValue === undefined
      ? {}
      : { defaultValue: field.defaultValue }),
    ...(field.rows === undefined ? {} : { rows: field.rows }),
    ...(field.minRows === undefined ? {} : { minRows: field.minRows }),
    ...(field.maxRows === undefined ? {} : { maxRows: field.maxRows }),
    ...(field.autoGrow === undefined ? {} : { autoGrow: field.autoGrow }),
    ...(field.resize === undefined ? {} : { resize: field.resize }),
    ...(field.submitOnModEnter === undefined
      ? {}
      : { submitOnModEnter: field.submitOnModEnter }),
    ...(field.cancelOnEscape === undefined
      ? {}
      : { cancelOnEscape: field.cancelOnEscape }),
  }
}

/**
 * Derives every WAI-ARIA `SlotBinding` (`control`, `label`, `description`,
 * `error`, `visibilityToggle`, `clearButton`) directly from `field` + `state`
 * + optional `Fieldset`, with zero manual ARIA wiring.
 *
 * @example
 * ```typescript
 * const slots = BoundField.toSlots(bioField, bioState, { fieldset })
 * slots.control.role // 'TextBox'
 * slots.control.isInvalid // true when invalid and touched/submitted
 * ```
 */
export const toSlots = (
  field: AnyBoundField,
  state: State,
  options: ProjectOptions = {},
): BoundFieldSlots => {
  const prefix = tokenPrefixOf(field, options)
  const isDisabled = isDisabledOf(field, options)
  const isInvalid = isInvalidOf(field, state, options)
  const isInteractive = !isDisabled && !field.isReadOnly
  const showDescription = options.showDescription !== false
  const maybeDescribedBy = describedByOf(field, isInvalid, showDescription)
  const isMultiline = field.kind === 'Textarea'
  const isPassword = field.inputType === 'password'
  const derivedInputMode: InputMode | undefined =
    field.inputMode !== undefined
      ? field.inputMode
      : field.inputType === 'email'
        ? 'Email'
        : field.inputType === 'tel'
          ? 'Tel'
          : field.inputType === 'url'
            ? 'Url'
            : field.inputType === 'search'
              ? 'Search'
              : undefined

  const controlProps: SlotProps = {
    role: 'TextBox',
    id: field.ids.control,
    label: field.label,
    labelledBy: field.ids.label,
    tabIndex: isDisabled ? -1 : 0,
    ...(derivedInputMode === undefined ? {} : { inputMode: derivedInputMode }),
    ...(field.enterKeyHint === undefined
      ? {}
      : { enterKeyHint: field.enterKeyHint }),
    ...(field.autofill === undefined ? {} : { autofill: field.autofill }),
    ...(Option.isSome(maybeDescribedBy)
      ? { describedBy: maybeDescribedBy.value }
      : {}),
    ...(isMultiline ? { isMultiline: true } : {}),
    ...(isDisabled ? { isDisabled: true } : {}),
    ...(field.isReadOnly ? { isReadOnly: true } : {}),
    ...(field.isRequired ? { isRequired: true } : {}),
    ...(isInvalid ? { isInvalid: true } : {}),
  }

  return {
    control: bound([], controlProps),
    label: bound([{ gesture: 'Pressed', press: `${prefix}BeginFieldEdit` }], {
      id: field.ids.label,
      ...(isDisabled ? { isDisabled: true } : {}),
    }),
    description: bound([], {
      id: field.ids.description,
      ...(Option.isNone(field.maybeDescription) || !showDescription
        ? { isHidden: true }
        : {}),
    }),
    error: bound([], {
      role: 'Alert',
      id: field.ids.error,
      live: 'Polite',
      isAtomic: true,
      ...(!isInvalid ? { isHidden: true } : {}),
    }),
    visibilityToggle: bound(
      [{ gesture: 'Pressed', press: `${prefix}ToggleFieldVisibility` }],
      {
        role: 'Button',
        id: field.ids.visibilityToggle,
        controls: field.ids.control,
        isPressed: state.isPasswordVisible,
        label: state.isPasswordVisible ? 'Hide password' : 'Show password',
        tabIndex: 0,
        ...(!isPassword ? { isHidden: true } : {}),
        ...(isDisabled ? { isDisabled: true } : {}),
        ...(field.isReadOnly ? { isReadOnly: true } : {}),
      },
    ),
    clearButton: bound(
      [{ gesture: 'Pressed', press: `${prefix}ClearFieldDraft` }],
      {
        role: 'Button',
        id: field.ids.clearButton,
        controls: field.ids.control,
        label: `Clear ${field.label}`,
        tabIndex: 0,
        ...(isEmpty(state) || !isInteractive ? { isHidden: true } : {}),
        ...(isDisabled ? { isDisabled: true } : {}),
        ...(field.isReadOnly ? { isReadOnly: true } : {}),
      },
    ),
  }
}

const displayedControlValue = (field: AnyBoundField, state: State): string => {
  const raw = draftOf(state)
  if (field.inputType === 'password' && !state.isPasswordVisible) {
    return '•'.repeat(raw.length)
  } else {
    return raw
  }
}

const controlNodeOf = (
  field: AnyBoundField,
  state: State,
  slots: BoundFieldSlots,
  options: ProjectOptions,
  forceMultiline: boolean,
): TextInputNode => {
  const prefix = tokenPrefixOf(field, options)
  const slot: SlotBinding = forceMultiline
    ? { ...slots.control, id: field.ids.textarea, isMultiline: true }
    : slots.control

  return TextInput({
    value: displayedControlValue(field, state),
    label: field.label,
    token: `${prefix}ChangeFieldDraft:`,
    action: `${prefix}CommitFieldDraft`,
    clearAction: `${prefix}ClearFieldDraft`,
    focusToken: `${prefix}BeginFieldEdit`,
    blurToken: `${prefix}BlurField`,
    slot,
    ...(field.placeholder === undefined
      ? {}
      : { placeholder: field.placeholder }),
    ...(options.focused === undefined ? {} : { focused: options.focused }),
    ...(options.width === undefined ? {} : { width: options.width }),
  })
}

/**
 * Projects a `BoundField` directly to a ready-to-paint `TextInputNode` with
 * zero manual `value`, change/blur/commit tokens, or ARIA wiring.
 *
 * @example
 * ```typescript
 * BoundField.toTextInput(emailField, emailState, { fieldset })
 * ```
 */
export const toTextInput = (
  field: AnyBoundField,
  state: State,
  options: ProjectOptions = {},
): TextInputNode => {
  const slots = toSlots(field, state, options)
  return controlNodeOf(field, state, slots, options, field.kind === 'Textarea')
}

/**
 * Projects a `BoundField` directly to a ready-to-paint multiline `TextInputNode`
 * (`slot.isMultiline: true`, `id: field.ids.textarea`) with zero manual wiring.
 *
 * @example
 * ```typescript
 * BoundField.toTextarea(bioField, bioState, { fieldset })
 * ```
 */
export const toTextarea = (
  field: AnyBoundField,
  state: State,
  options: ProjectOptions = {},
): TextInputNode => {
  const slots = toSlots(field, state, options)
  return controlNodeOf(field, state, slots, options, true)
}

/**
 * Projects a complete field composition (Label + TextInput/Textarea + optional
 * VisibilityToggle/ClearButton + Description + Error Alert) as a `ColumnNode`
 * with every `SlotBinding` wired automatically.
 *
 * @example
 * ```typescript
 * BoundField.toField(bioField, bioState, { fieldset })
 * ```
 */
export const toField = (
  field: AnyBoundField,
  state: State,
  options: ProjectOptions = {},
): ColumnNode => {
  const prefix = tokenPrefixOf(field, options)
  const slots = toSlots(field, state, options)
  const isDisabled = isDisabledOf(field, options)
  const isInteractive = !isDisabled && !field.isReadOnly
  const maybeError = errorOf(field, state, options)
  const control = controlNodeOf(
    field,
    state,
    slots,
    options,
    field.kind === 'Textarea',
  )
  const labelText = field.isRequired ? `${field.label} *` : field.label
  const showVisibility =
    options.showVisibilityToggle !== false && field.inputType === 'password'
  const showClear =
    options.showClearButton === true && !isEmpty(state) && isInteractive

  const controlRow: UiNode =
    showVisibility || showClear
      ? Row(
          { gap: 1 },
          control,
          ...(showVisibility
            ? [
                Button({
                  label: state.isPasswordVisible ? 'Hide' : 'Show',
                  action: `${prefix}ToggleFieldVisibility`,
                  disabled: !isInteractive,
                  slot: slots.visibilityToggle,
                }),
              ]
            : []),
          ...(showClear
            ? [
                Button({
                  label: 'Clear',
                  action: `${prefix}ClearFieldDraft`,
                  disabled: !isInteractive,
                  slot: slots.clearButton,
                }),
              ]
            : []),
        )
      : control

  return Column(
    { gap: 0 },
    Box(
      { padding: 0, slot: slots.label },
      Text(labelText, { dim: isDisabled }),
    ),
    controlRow,
    ...(options.showDescription !== false &&
    Option.isSome(field.maybeDescription)
      ? [
          Box(
            { padding: 0, slot: slots.description },
            Text(field.maybeDescription.value, { dim: true }),
          ),
        ]
      : []),
    ...(Option.isSome(maybeError)
      ? [Box({ padding: 0, slot: slots.error }, Text(maybeError.value))]
      : [Box({ padding: 0, slot: slots.error }, Text(''))]),
  )
}

/**
 * Derives a core `Input` or `Textarea` `Part` matching this `BoundField`'s
 * kind, default value, typing-pause `settleMs`, and sync policy (`Secret`
 * becomes `Input.secret`, `Textarea` becomes `Textarea.make`).
 */
export const toPart = (
  field: AnyBoundField,
):
  | Part<Input.State, Input.Message, Input.Props>
  | Part<Textarea.State, Textarea.Message, Textarea.Props> => {
  if (field.kind === 'Textarea') {
    return Textarea.make({
      name: field.id,
      settleMs: field.settleMs,
      sync: field.sync,
      ...(field.defaultValue === undefined
        ? {}
        : { defaultValue: field.defaultValue }),
    })
  } else if (field.kind === 'Secret') {
    return Input.secret({
      name: field.id,
      settleMs: field.settleMs,
      ...(field.defaultValue === undefined
        ? {}
        : { defaultValue: field.defaultValue }),
    })
  } else {
    return Input.make({
      name: field.id,
      settleMs: field.settleMs,
      sync: field.sync,
      ...(field.defaultValue === undefined
        ? {}
        : { defaultValue: field.defaultValue }),
    })
  }
}

// FORM

/** A keyed record of `BoundField` declarations composing one form. */
export type FieldRecord = Readonly<Record<string, AnyBoundField>>

/** Decoded values map for a {@link FieldRecord}. */
export type DecodedOf<Fields extends FieldRecord> = {
  readonly [Key in keyof Fields]: Fields[Key] extends BoundField<infer A>
    ? A
    : never
}

/** Per-field `BoundField.State` map for a {@link FieldRecord}. */
export type FormStates<Fields extends FieldRecord> = {
  readonly [Key in keyof Fields]: State
}

/** Options for {@link form}. */
export type FormOptions = Readonly<{
  label?: string
  description?: string
  isDisabled?: boolean
}>

/** A group of `BoundField`s coordinated with `Fieldset`. */
export type BoundForm<Fields extends FieldRecord = FieldRecord> = Readonly<{
  id: string
  fields: Fields
  fieldList: ReadonlyArray<AnyBoundField>
  fieldOrder: ReadonlyArray<string>
  label?: string
  description?: string
  isDisabled: boolean
}>

/**
 * Groups multiple `BoundField` declarations under one form `id` so validation,
 * `Fieldset.Props`, `firstInvalidFieldOf`, and form projection all derive from
 * the single declaration.
 *
 * @example
 * ```typescript
 * const profileForm = BoundField.form('profile', { name: nameField, bio: bioField }, { label: 'Profile' })
 * ```
 */
export const form = <Fields extends FieldRecord>(
  id: string,
  fields: Fields,
  options: FormOptions = {},
): BoundForm<Fields> => {
  const fieldList: ReadonlyArray<AnyBoundField> = Record.values(fields)
  const fieldOrder = Array.map(fieldList, field => field.name)
  return {
    id,
    fields,
    fieldList,
    fieldOrder,
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.description === undefined
      ? {}
      : { description: options.description }),
    isDisabled: options.isDisabled === true,
  }
}

/** Derives `Fieldset.Props` for a `BoundForm` with deterministic `fieldOrder`. */
export const toFieldsetProps = <Fields extends FieldRecord>(
  boundForm: BoundForm<Fields>,
  overrides: Partial<Pick<Fieldset.Props, 'isDisabled' | 'label'>> = {},
): Fieldset.Props => ({
  id: boundForm.id,
  fieldOrder: boundForm.fieldOrder,
  isDisabled: overrides.isDisabled ?? boundForm.isDisabled,
  hasLegend: overrides.label !== undefined || boundForm.label !== undefined,
  hasDescription: boundForm.description !== undefined,
  hasError: true,
  ...(overrides.label !== undefined
    ? { label: overrides.label }
    : boundForm.label === undefined
      ? {}
      : { label: boundForm.label }),
})

/** Builds initial `BoundField.State` entries for every field in `boundForm` from `model`. */
export const initialFormStates = <Fields extends FieldRecord>(
  boundForm: BoundForm<Fields>,
  model: unknown,
): Readonly<Record<string, State>> =>
  Record.map(boundForm.fields, field => initialFromModel(model, field))

/** Result of validating an entire {@link BoundForm}. */
export type FormValidationResult =
  | Readonly<{
      _tag: 'Valid'
      values: Readonly<Record<string, unknown>>
      fieldErrors: Fieldset.ErrorMap
      errors: Fieldset.ErrorMap
      maybeFirstInvalidField: Option.Option<string>
    }>
  | Readonly<{
      _tag: 'Invalid'
      fieldErrors: Fieldset.ErrorMap
      errors: Fieldset.ErrorMap
      maybeFirstInvalidField: Option.Option<string>
    }>

const rawValueForFormField = (
  field: AnyBoundField,
  key: string,
  source: Readonly<Record<string, State>> | object,
): string => {
  if (isPlainObject(source) && Object.hasOwn(source, key)) {
    const candidate = Reflect.get(source, key)
    if (
      isPlainObject(candidate) &&
      Object.hasOwn(candidate, 'draft') &&
      S.is(State)(candidate)
    ) {
      return draftOf(candidate)
    }
  }
  return readField(source, field)
}

/**
 * Validates every field in `boundForm` against its Effect Schema using either
 * a `FormStates` map or the `Model` directly, merging cleanly with any active
 * `Fieldset` server errors and computing `maybeFirstInvalidField` in field
 * declaration order.
 *
 * @example
 * ```typescript
 * const result = BoundField.validateForm(profileForm, states, { fieldset })
 * ```
 */
export const validateForm = <Fields extends FieldRecord>(
  boundForm: BoundForm<Fields>,
  source: FormStates<Fields> | Readonly<Record<string, State>> | object,
  options: Readonly<{
    fieldset?: Fieldset.State
    includeServerErrors?: boolean
    errorPriority?: ErrorPriority
  }> = {},
): FormValidationResult => {
  const entries = Record.toEntries(boundForm.fields)
  const initialChecked: Readonly<{
    fieldErrors: Readonly<Record<string, string>>
    decodedValues: Readonly<Record<string, unknown>>
  }> = {
    fieldErrors: {},
    decodedValues: {},
  }
  const checked = Array.reduce(entries, initialChecked, (acc, [key, field]) => {
    const raw = rawValueForFormField(field, key, source)
    const result = validate(field, raw)
    if (result._tag === 'Invalid') {
      return {
        fieldErrors: { ...acc.fieldErrors, [field.name]: result.message },
        decodedValues: acc.decodedValues,
      }
    } else {
      return {
        fieldErrors: acc.fieldErrors,
        decodedValues: { ...acc.decodedValues, [key]: result.value },
      }
    }
  })

  const serverErrors: Fieldset.ErrorMap =
    options.includeServerErrors === true && options.fieldset !== undefined
      ? options.fieldset.serverErrors
      : {}

  const priority: ErrorPriority = options.errorPriority ?? 'ServerFirst'
  const mergedErrors: Fieldset.ErrorMap =
    priority === 'ServerFirst'
      ? { ...checked.fieldErrors, ...serverErrors }
      : { ...serverErrors, ...checked.fieldErrors }

  const maybeFirstInvalidField = Array.findFirst(boundForm.fieldOrder, name =>
    Object.hasOwn(mergedErrors, name),
  )

  if (Record.isEmptyRecord(mergedErrors)) {
    return {
      _tag: 'Valid',
      values: checked.decodedValues,
      fieldErrors: checked.fieldErrors,
      errors: mergedErrors,
      maybeFirstInvalidField: Option.none(),
    }
  } else {
    return {
      _tag: 'Invalid',
      fieldErrors: checked.fieldErrors,
      errors: mergedErrors,
      maybeFirstInvalidField,
    }
  }
}

/**
 * Returns the first invalid field name in `boundForm`'s declaration order,
 * checking `Fieldset` state when provided or validating `source` directly.
 *
 * @example
 * ```typescript
 * BoundField.firstInvalidFieldOf(profileForm, states, { fieldset })
 * // Option.some('profile.bio')
 * ```
 */
export const firstInvalidFieldOf = <Fields extends FieldRecord>(
  boundForm: BoundForm<Fields>,
  source: FormStates<Fields> | Readonly<Record<string, State>> | object,
  options: Readonly<{
    fieldset?: Fieldset.State
    includeServerErrors?: boolean
    errorPriority?: ErrorPriority
  }> = {},
): Option.Option<string> =>
  validateForm(boundForm, source, {
    includeServerErrors: options.includeServerErrors ?? true,
    ...(options.fieldset === undefined ? {} : { fieldset: options.fieldset }),
    ...(options.errorPriority === undefined
      ? {}
      : { errorPriority: options.errorPriority }),
  }).maybeFirstInvalidField

/**
 * Runs form-wide Schema validation and feeds every field's result plus
 * `Fieldset.AttemptSubmit()` into `fieldset`, transitioning to `Submitting`
 * when every field is valid and enabled or staying in `Idle` with all errors
 * recorded and `submitAttemptCount` incremented when invalid.
 */
export const applyFormValidation = <Fields extends FieldRecord>(
  boundForm: BoundForm<Fields>,
  source: FormStates<Fields> | Readonly<Record<string, State>> | object,
  fieldset: Fieldset.State,
): Readonly<{
  validation: FormValidationResult
  fieldset: Fieldset.State
}> => {
  const validation = validateForm(boundForm, source)
  const fieldsetProps = toFieldsetProps(boundForm)
  const withErrors = Array.reduce(
    boundForm.fieldList,
    fieldset,
    (current, field) => {
      const maybeError = Record.get(validation.fieldErrors, field.name)
      const message = Option.match(maybeError, {
        onNone: () => Fieldset.ClearFieldError({ field: field.name }),
        onSome: text =>
          Fieldset.SetFieldError({ field: field.name, message: text }),
      })
      return Fieldset.chart.transition(current, message, fieldsetProps)[0]
    },
  )
  const [nextFieldset] = Fieldset.chart.transition(
    withErrors,
    Fieldset.AttemptSubmit(),
    fieldsetProps,
  )
  return { validation, fieldset: nextFieldset }
}

/**
 * Projects a complete `BoundForm` as a `BoxNode` with `role: 'Group'`, legend,
 * description, every `BoundField` via {@link toField}, and form-level error
 * alert when present.
 *
 * @example
 * ```typescript
 * BoundField.toForm(profileForm, states, { fieldset })
 * ```
 */
export const toForm = <Fields extends FieldRecord>(
  boundForm: BoundForm<Fields>,
  states: FormStates<Fields> | Readonly<Record<string, State>>,
  options: Readonly<{
    fieldset?: Fieldset.State
    fieldsetProps?: Pick<Fieldset.Props, 'isDisabled'>
    errorPriority?: ErrorPriority
    submitLabel?: string
    resetLabel?: string
  }> = {},
): BoxNode => {
  const fieldsetState = options.fieldset ?? Fieldset.initial
  const isGroupDisabled = Fieldset.isDisabled(fieldsetState, {
    isDisabled:
      options.fieldsetProps?.isDisabled === true || boundForm.isDisabled,
  })
  const entries = Record.toEntries(boundForm.fields)
  const maybeFormError = Fieldset.maybeFormErrorOf(fieldsetState)
  const hasAnyInvalidField = Array.some(entries, ([key, field]) => {
    const fieldState = Option.getOrElse(Record.get(states, key), () =>
      initial(field.defaultValue ?? ''),
    )
    return isInvalidOf(field, fieldState, {
      fieldset: fieldsetState,
      ...(options.errorPriority === undefined
        ? {}
        : { errorPriority: options.errorPriority }),
    })
  })
  const groupSlot = bound([], {
    role: 'Group',
    id: Fieldset.fieldsetId(boundForm.id),
    ...(boundForm.label === undefined
      ? {}
      : {
          label: boundForm.label,
          labelledBy: Fieldset.legendId(boundForm.id),
        }),
    ...(boundForm.description === undefined
      ? {}
      : { describedBy: Fieldset.descriptionId(boundForm.id) }),
    ...(isGroupDisabled ? { isDisabled: true } : {}),
    ...(hasAnyInvalidField || Option.isSome(maybeFormError)
      ? { isInvalid: true }
      : {}),
  })

  const fieldNodes = Array.map(entries, ([key, field]) => {
    const fieldState = Option.getOrElse(Record.get(states, key), () =>
      initial(field.defaultValue ?? ''),
    )
    return toField(field, fieldState, {
      fieldset: fieldsetState,
      fieldsetProps: { isDisabled: isGroupDisabled },
      ...(options.errorPriority === undefined
        ? {}
        : { errorPriority: options.errorPriority }),
    })
  })

  return Box(
    { padding: 1, slot: groupSlot },
    Column(
      { gap: 1 },
      ...(boundForm.label === undefined
        ? []
        : [
            Box(
              {
                padding: 0,
                slot: bound([], {
                  id: Fieldset.legendId(boundForm.id),
                  ...(isGroupDisabled ? { isDisabled: true } : {}),
                }),
              },
              Text(boundForm.label, { emphasis: 'Headline' }),
            ),
          ]),
      ...(boundForm.description === undefined
        ? []
        : [
            Box(
              {
                padding: 0,
                slot: bound([], { id: Fieldset.descriptionId(boundForm.id) }),
              },
              Text(boundForm.description, { dim: true }),
            ),
          ]),
      ...fieldNodes,
      ...(Option.isSome(maybeFormError)
        ? [
            Box(
              {
                padding: 0,
                slot: bound([], {
                  role: 'Alert',
                  id: Fieldset.errorId(boundForm.id),
                  live: 'Polite',
                  isAtomic: true,
                }),
              },
              Text(maybeFormError.value),
            ),
          ]
        : []),
      ...(options.submitLabel === undefined && options.resetLabel === undefined
        ? []
        : [
            Row(
              { gap: 1 },
              ...(options.submitLabel === undefined
                ? []
                : [
                    Button({
                      label: options.submitLabel,
                      action: Fieldset.AttemptSubmit.tag,
                      disabled:
                        isGroupDisabled || Fieldset.isSubmitting(fieldsetState),
                      slot: bound(
                        [
                          {
                            gesture: 'Pressed',
                            press: Fieldset.AttemptSubmit.tag,
                          },
                        ],
                        {
                          role: 'Button',
                          id: Fieldset.submitButtonId(boundForm.id),
                          controls: Fieldset.fieldsetId(boundForm.id),
                          ...(isGroupDisabled ||
                          Fieldset.isSubmitting(fieldsetState)
                            ? { isDisabled: true }
                            : {}),
                        },
                      ),
                    }),
                  ]),
              ...(options.resetLabel === undefined
                ? []
                : [
                    Button({
                      label: options.resetLabel,
                      action: Fieldset.ResetFieldset.tag,
                      disabled: isGroupDisabled,
                      slot: bound(
                        [
                          {
                            gesture: 'Pressed',
                            press: Fieldset.ResetFieldset.tag,
                          },
                        ],
                        {
                          role: 'Button',
                          id: Fieldset.resetButtonId(boundForm.id),
                          controls: Fieldset.fieldsetId(boundForm.id),
                          ...(isGroupDisabled ? { isDisabled: true } : {}),
                        },
                      ),
                    }),
                  ]),
            ),
          ]),
    ),
  )
}
