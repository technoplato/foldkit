import { Array, Option, Schema as S, String } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import { define, ignore, when } from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'

// NOTE: this is the core FileDrop Part (Widget #23 of 54, Scribe #2662).
// It models a framework-free file dropzone and attachment manager covering
// packages/ui FileDrop and Zag file-upload without touching DOM `File` or
// `foldkit/file`. Its state (`Idle` | `DraggingOver` with a drag nesting depth
// counter preventing child flicker) lives in the Model, synced by default
// (`Domain` category, `Pace.Synced`) with a device-only option, and projects
// reference-stable SlotBindings (`Dropzone`, `Trigger`, `Item`,
// `RemoveButton`, `ClearButton`) rendered by HTML, React, and React Native
// generic hosts with zero FileDrop-specific painter logic.

// SCHEMAS

/** Plain JSON-serializable metadata for one file, with no DOM `File` reference. */
export const FileEntry = S.Struct({
  name: S.String,
  size: S.Number,
  type: S.String,
  lastModified: S.optionalKey(S.Number),
})
/** Plain JSON-serializable metadata for one file. */
export type FileEntry = typeof FileEntry.Type

/** Typed reason a candidate file failed dropzone validation. */
export const RejectionReason = S.Literals([
  'FileInvalidType',
  'FileTooSmall',
  'FileTooLarge',
  'TooManyFiles',
  'FileDuplicate',
])
/** Typed reason a candidate file failed dropzone validation. */
export type RejectionReason = typeof RejectionReason.Type

/** A rejected file paired with every {@link RejectionReason} it violated. */
export const RejectedFile = S.Struct({
  file: FileEntry,
  reasons: S.Array(RejectionReason),
})
/** A rejected file paired with every validation reason it violated. */
export type RejectedFile = typeof RejectedFile.Type

/** Partitioned outcome of validating candidate files against dropzone rules. */
export const ValidationResult = S.Struct({
  accepted: S.Array(FileEntry),
  rejected: S.Array(RejectedFile),
})
/** Partitioned outcome of validating candidate files against dropzone rules. */
export type ValidationResult = typeof ValidationResult.Type

/** Standard `data-state` attribute value for a dropzone (`'idle' | 'dragging'`). */
export const DataState = S.Literals(['idle', 'dragging'])
/** Standard `data-state` attribute value for a dropzone. */
export type DataState = typeof DataState.Type

/**
 * Read-only configuration supplied to the FileDrop chart and projection from
 * the Program's Model. Validation constraints, accept rules, and accessibility
 * linkage stay out of the chart's state.
 */
export const Props = S.Struct({
  id: S.String,
  accept: S.optionalKey(S.Array(S.String)),
  multiple: S.optionalKey(S.Boolean),
  maxFiles: S.optionalKey(S.Number),
  minFileSize: S.optionalKey(S.Number),
  maxFileSize: S.optionalKey(S.Number),
  allowDuplicates: S.optionalKey(S.Boolean),
  isDisabled: S.optionalKey(S.Boolean),
  isReadOnly: S.optionalKey(S.Boolean),
  isRequired: S.optionalKey(S.Boolean),
  isInvalid: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  describedBy: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the FileDrop chart and projection. */
export type Props = typeof Props.Type

// STATE

/** No drag is hovering over the dropzone. */
export const Idle = ts('Idle', {
  acceptedFiles: S.Array(FileEntry),
  rejectedFiles: S.Array(RejectedFile),
  hasNonFileDrop: S.Boolean,
})
/** No drag is hovering over the dropzone. */
export type Idle = typeof Idle.Type

/**
 * A drag is hovering over the dropzone. `dragDepth` tracks nested drag-enter
 * and drag-leave transitions across descendants so moving over child elements
 * does not flicker the drag state off and back on.
 */
export const DraggingOver = ts('DraggingOver', {
  dragDepth: S.Number,
  acceptedFiles: S.Array(FileEntry),
  rejectedFiles: S.Array(RejectedFile),
  hasNonFileDrop: S.Boolean,
})
/** A drag is hovering over the dropzone with nesting depth tracking. */
export type DraggingOver = typeof DraggingOver.Type

/** Where a FileDrop Part stands: `Idle` or `DraggingOver`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, DraggingOver])
/** Where a FileDrop Part stands. */
export type State = typeof State.Type

/** Initial FileDrop state: idle with no accepted or rejected files. */
export const initial: State = Idle({
  acceptedFiles: [],
  rejectedFiles: [],
  hasNonFileDrop: false,
})

/** Creates an initial FileDrop state pre-populated with `files`. */
export const initialWithFiles = (files: ReadonlyArray<FileEntry>): State =>
  Idle({
    acceptedFiles: [...files],
    rejectedFiles: [],
    hasNonFileDrop: false,
  })

// ACTIONS

const chooseFileName: Readonly<{
  field: 'name'
  noun: string
  prompt: string
  token: typeof S.String
  choicesOf: () => ReadonlyArray<never>
  accepts: () => ReturnType<typeof Catalog.Enabled>
  nothingToChoose: string
}> = {
  field: 'name',
  noun: 'file',
  prompt: 'Which file?',
  token: S.String,
  choicesOf: () => [],
  accepts: () => Catalog.Enabled(),
  nothingToChoose: 'No attached file is available',
}

/** Validates and adds files to the dropzone. */
export const AddFiles = Catalog.action('AddFiles', {
  fields: { files: S.Array(FileEntry) },
  what: 'Validates and adds files to the dropzone',
  why: 'To attach candidate files for upload or review',
  meta: { label: 'Add files', keys: [] },
})

/** Removes an attached file matching `name`. */
export const RemoveFile = Catalog.action('RemoveFile', {
  fields: { name: S.String },
  choose: chooseFileName,
  what: 'Removes the chosen file from the attached list',
  why: 'To discard an unwanted attachment before continuing',
  meta: { label: 'Remove file', keys: [] },
})

/** Removes every attached and rejected file and clears non-file drop notices. */
export const ClearFiles = Catalog.action('ClearFiles', {
  what: 'Removes every attached and rejected file from the dropzone',
  why: 'To start over with an empty selection',
  meta: { label: 'Clear files', keys: [] },
})

/** Clears rejected files and non-file drop notices while preserving accepted files. */
export const ClearRejectedFiles = Catalog.action('ClearRejectedFiles', {
  what: 'Clears rejected files and validation notices',
  why: 'To dismiss error messages after reviewing them',
  meta: { label: 'Clear rejected files', keys: [] },
})

/** The Catalog Actions a FileDrop Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  AddFiles,
  RemoveFile,
  ClearFiles,
  ClearRejectedFiles,
]

// MESSAGES

/** A drag entered the dropzone or one of its descendant elements. */
export const EnterDragZone = m('EnterDragZone')

/** A drag left the dropzone or one of its descendant elements. */
export const LeaveDragZone = m('LeaveDragZone')

/** Files were dropped onto the dropzone (empty list counts as a non-file drop). */
export const DropFiles = m('DropFiles', { files: S.Array(FileEntry) })

/** Non-file data (such as text or links) was dropped onto the dropzone. */
export const DropNonFiles = m('DropNonFiles')

/** Replaces the entire file list with validated `files`. */
export const SetFiles = m('SetFiles', { files: S.Array(FileEntry) })

/** Removes a single rejected file matching `name`. */
export const RemoveRejectedFile = m('RemoveRejectedFile', { name: S.String })

/** Every Message the FileDrop chart handles. */
export const Message = S.Union([
  AddFiles,
  RemoveFile,
  ClearFiles,
  ClearRejectedFiles,
  EnterDragZone,
  LeaveDragZone,
  DropFiles,
  DropNonFiles,
  SetFiles,
  RemoveRejectedFile,
])
/** Every Message the FileDrop chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the FileDrop Part. */
export const isMessage = S.is(Message)

// ELEMENT IDS

/** Derives the dropzone region element id from a base `id`. */
export const dropzoneId = (id: string): string => `${id}-dropzone`

/** Derives the file picker trigger button element id from a base `id`. */
export const triggerId = (id: string): string => `${id}-trigger`

/** Derives an attached file row element id from a base `id` and file `name`. */
export const itemId = (id: string, name: string): string => `${id}-item-${name}`

/** Derives a file remove button element id from a base `id` and file `name`. */
export const removeButtonId = (id: string, name: string): string =>
  `${id}-remove-${name}`

/** Derives the clear-all button element id from a base `id`. */
export const clearButtonId = (id: string): string => `${id}-clear`

// CONFIGURATION & PURE RULES

/** True when the dropzone is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** True when the dropzone is read-only (`false` by default). */
export const isReadOnlyOf = (props: Pick<Props, 'isReadOnly'> = {}): boolean =>
  props.isReadOnly === true

/** True when the dropzone accepts drops and mutations (neither disabled nor read-only). */
export const isInteractive = (
  props: Pick<Props, 'isDisabled' | 'isReadOnly'> = {},
): boolean => !isDisabledOf(props) && !isReadOnlyOf(props)

/** Alias of {@link isInteractive}: true when the dropzone accepts drops. */
export const canDrop = isInteractive

/** True when duplicate files are permitted (`false` by default). */
export const allowDuplicatesOf = (
  props: Pick<Props, 'allowDuplicates'> = {},
): boolean => props.allowDuplicates === true

/**
 * True when multiple files may be attached at once. Uses `props.multiple` when
 * set, otherwise `props.maxFiles > 1`, defaulting to `false`.
 */
export const isMultipleOf = (
  props: Pick<Props, 'multiple' | 'maxFiles'> = {},
): boolean => {
  if (props.multiple !== undefined) {
    return props.multiple
  } else if (props.maxFiles !== undefined) {
    return props.maxFiles > 1
  } else {
    return false
  }
}

/**
 * Resolved maximum accepted file count: `Some(maxFiles)` when `props.maxFiles`
 * is specified, `None` (unlimited) when `multiple: true` without `maxFiles`, or
 * `Some(1)` in single-file mode.
 */
export const maxFilesOf = (
  props: Pick<Props, 'multiple' | 'maxFiles'> = {},
): Option.Option<number> => {
  if (props.maxFiles !== undefined) {
    return Option.some(Math.max(0, Math.floor(props.maxFiles)))
  } else if (props.multiple === true) {
    return Option.none()
  } else {
    return Option.some(1)
  }
}

/**
 * Formats an `accept` pattern array into a comma-separated attribute string,
 * trimming whitespace and omitting blank entries. Returns `Option.none()` when
 * empty or omitted. Shared by thin painters such as `@foldkit/ui` `FileDrop`.
 *
 * @example
 * ```typescript
 * formatAcceptAttribute(['application/pdf', '.doc']) // Some('application/pdf,.doc')
 * formatAcceptAttribute([]) // None
 * formatAcceptAttribute(undefined) // None
 * ```
 */
export const formatAcceptAttribute = (
  accept: ReadonlyArray<string> | undefined,
): Option.Option<string> => {
  if (accept === undefined) {
    return Option.none()
  }
  const cleaned = Array.filter(
    Array.map(accept, pattern => String.trim(pattern)),
    pattern => pattern.length > 0,
  )
  return Array.match(cleaned, {
    onEmpty: () => Option.none(),
    onNonEmpty: patterns => Option.some(Array.join(patterns, ',')),
  })
}

/**
 * Computes the next drag nesting depth when a drag enters the dropzone or one
 * of its children (`Math.max(0, depth) + 1`).
 */
export const enterDragDepth = (depth: number): number => Math.max(0, depth) + 1

/**
 * Computes the next drag nesting depth when a drag leaves the dropzone or one
 * of its children (`Math.max(0, depth - 1)`).
 */
export const leaveDragDepth = (depth: number): number => Math.max(0, depth - 1)

/** True when a drag nesting depth indicates the drag is still over the dropzone. */
export const isDraggingDepth = (depth: number): boolean => depth > 0

/**
 * Pure helper computing the next drag-over boolean for simple boolean-tracked
 * painters such as `@foldkit/ui` `FileDrop`.
 */
export const nextDragOver = (
  event: 'Enter' | 'Leave' | 'Drop',
  isDisabled: boolean = false,
): boolean => !isDisabled && event === 'Enter'

/**
 * Stable deterministic identity key for a {@link FileEntry}, used for duplicate
 * detection and equality checks.
 */
export const fileKeyOf = (file: FileEntry): string =>
  `${file.name}:${file.size}:${file.type}:${file.lastModified ?? 0}`

/** True when two {@link FileEntry} values represent the same file. */
export const isSameFile = (first: FileEntry, second: FileEntry): boolean =>
  fileKeyOf(first) === fileKeyOf(second)

/**
 * True when `file` matches a single accept `pattern`:
 * - Empty string, `'*'`, or a universal wildcard MIME matches any file.
 * - `.ext` matches `file.name` case-insensitively by suffix.
 * - `type/*` matches `file.type` case-insensitively by `type/` prefix.
 * - `type/subtype` matches `file.type` case-insensitively by exact equality.
 *
 * @example
 * ```typescript
 * matchesAcceptPattern({ name: 'photo.PNG', type: 'image/png' }, 'image/*') // true
 * matchesAcceptPattern({ name: 'report.pdf', type: 'application/pdf' }, '.pdf') // true
 * matchesAcceptPattern({ name: 'notes.txt', type: 'text/plain' }, 'image/*') // false
 * ```
 */
export const matchesAcceptPattern = (
  file: Pick<FileEntry, 'name' | 'type'>,
  pattern: string,
): boolean => {
  const normalized = String.toLowerCase(String.trim(pattern))
  if (normalized === '' || normalized === '*' || normalized === '*/*') {
    return true
  } else if (normalized.startsWith('.')) {
    return String.toLowerCase(file.name).endsWith(normalized)
  } else if (normalized.endsWith('/*')) {
    const prefix = normalized.slice(0, normalized.length - 1)
    return String.toLowerCase(file.type).startsWith(prefix)
  } else {
    return String.toLowerCase(file.type) === normalized
  }
}

/**
 * True when `file` matches at least one pattern in `accept`, or when `accept`
 * is omitted or contains no non-empty patterns.
 */
export const isFileAccepted = (
  file: Pick<FileEntry, 'name' | 'type'>,
  accept: ReadonlyArray<string> | undefined,
): boolean => {
  if (accept === undefined) {
    return true
  }
  const patterns = Array.filter(
    Array.map(accept, pattern => String.trim(pattern)),
    pattern => pattern.length > 0,
  )
  return (
    Array.isReadonlyArrayEmpty(patterns) ||
    Array.some(patterns, pattern => matchesAcceptPattern(file, pattern))
  )
}

const singleFileReasonsOf = (
  file: FileEntry,
  seenKeys: ReadonlySet<string>,
  props: Pick<
    Props,
    'accept' | 'minFileSize' | 'maxFileSize' | 'allowDuplicates'
  >,
): ReadonlyArray<RejectionReason> => [
  ...(isFileAccepted(file, props.accept)
    ? []
    : (['FileInvalidType'] satisfies ReadonlyArray<RejectionReason>)),
  ...(props.minFileSize !== undefined && file.size < props.minFileSize
    ? (['FileTooSmall'] satisfies ReadonlyArray<RejectionReason>)
    : []),
  ...(props.maxFileSize !== undefined && file.size > props.maxFileSize
    ? (['FileTooLarge'] satisfies ReadonlyArray<RejectionReason>)
    : []),
  ...(!allowDuplicatesOf(props) && seenKeys.has(fileKeyOf(file))
    ? (['FileDuplicate'] satisfies ReadonlyArray<RejectionReason>)
    : []),
]

/**
 * Validates `incoming` files against `props` and `existing` attached files,
 * partitioning them into `accepted` and `rejected` with typed
 * {@link RejectionReason} lists.
 *
 * - Evaluates `accept` (MIME, wildcard, extension), `minFileSize`,
 *   `maxFileSize`, and duplicate detection (unless `allowDuplicates: true`).
 * - Enforces `maxFiles` (or single-file replacement capacity `1` when
 *   `multiple` is false), rejecting overflow files with `'TooManyFiles'`.
 */
export const validateFiles = (
  incoming: ReadonlyArray<FileEntry>,
  existing: ReadonlyArray<FileEntry>,
  props: Pick<
    Props,
    | 'accept'
    | 'multiple'
    | 'maxFiles'
    | 'minFileSize'
    | 'maxFileSize'
    | 'allowDuplicates'
  >,
): ValidationResult => {
  const multiple = isMultipleOf(props)
  const maybeMax = maxFilesOf(props)
  const remainingCapacity = multiple
    ? Option.match(maybeMax, {
        onNone: () => Number.POSITIVE_INFINITY,
        onSome: max => Math.max(0, max - existing.length),
      })
    : Option.match(maybeMax, {
        onNone: () => 1,
        onSome: max => Math.min(1, max),
      })

  const initialAcc: Readonly<{
    accepted: ReadonlyArray<FileEntry>
    rejected: ReadonlyArray<RejectedFile>
    seenKeys: ReadonlySet<string>
  }> = {
    accepted: [],
    rejected: [],
    seenKeys: new Set(Array.map(existing, fileKeyOf)),
  }

  const tooManyReasons: ReadonlyArray<RejectionReason> = ['TooManyFiles']
  const finalAcc = Array.reduce(incoming, initialAcc, (acc, file) => {
    const reasons = singleFileReasonsOf(file, acc.seenKeys, props)
    if (Array.isReadonlyArrayNonEmpty(reasons)) {
      return {
        ...acc,
        rejected: [...acc.rejected, { file, reasons }],
      }
    } else if (acc.accepted.length >= remainingCapacity) {
      return {
        ...acc,
        rejected: [...acc.rejected, { file, reasons: tooManyReasons }],
      }
    } else {
      const nextSeen = new Set(acc.seenKeys)
      nextSeen.add(fileKeyOf(file))
      return {
        accepted: [...acc.accepted, file],
        rejected: acc.rejected,
        seenKeys: nextSeen,
      }
    }
  })

  return {
    accepted: finalAcc.accepted,
    rejected: finalAcc.rejected,
  }
}

// READINGS

/** True when a drag is currently hovering over the dropzone. */
export const isDraggingOver = (state: State): boolean =>
  state._tag === 'DraggingOver'

/** True when no drag is hovering over the dropzone. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** Current drag nesting depth (`0` when `Idle`, `>= 1` when `DraggingOver`). */
export const dragDepthOf = (state: State): number =>
  state._tag === 'DraggingOver' ? state.dragDepth : 0

/** Currently accepted files. */
export const acceptedFilesOf = (state: State): ReadonlyArray<FileEntry> =>
  state.acceptedFiles

/** Most recent rejected files with their typed reasons. */
export const rejectedFilesOf = (state: State): ReadonlyArray<RejectedFile> =>
  state.rejectedFiles

/** True when the most recent drop contained no files. */
export const hasNonFileDrop = (state: State): boolean => state.hasNonFileDrop

/** True when at least one accepted or rejected file is present. */
export const hasAnyFiles = (state: State): boolean =>
  Array.isReadonlyArrayNonEmpty(state.acceptedFiles) ||
  Array.isReadonlyArrayNonEmpty(state.rejectedFiles)

/** True when the dropzone currently carries any validation error (prop, rejected files, or non-file drop). */
export const isInvalidOf = (
  state: State,
  props: Pick<Props, 'isInvalid'> = {},
): boolean =>
  props.isInvalid === true ||
  Array.isReadonlyArrayNonEmpty(state.rejectedFiles) ||
  state.hasNonFileDrop

/** Remaining file slots available under `maxFiles`, or `Option.none()` when unlimited. */
export const remainingSlotsOf = (
  state: State,
  props: Pick<Props, 'multiple' | 'maxFiles'>,
): Option.Option<number> =>
  Option.map(maxFilesOf(props), max =>
    Math.max(0, max - state.acceptedFiles.length),
  )

/** True when the accepted file list has reached `maxFiles`. */
export const isMaxFilesReached = (
  state: State,
  props: Pick<Props, 'multiple' | 'maxFiles'>,
): boolean => Option.exists(remainingSlotsOf(state, props), count => count <= 0)

/** Standard `data-state` attribute value (`'dragging'` or `'idle'`). */
export const dataStateOf = (state: State): DataState =>
  isDraggingOver(state) ? 'dragging' : 'idle'

// INTERNAL TRANSITION HELPERS

const nextAcceptedOf = (
  state: State,
  result: ValidationResult,
  props: Props,
  mode: 'Add' | 'Replace',
): ReadonlyArray<FileEntry> => {
  if (mode === 'Replace') {
    return result.accepted
  } else if (isMultipleOf(props)) {
    return [...state.acceptedFiles, ...result.accepted]
  } else if (Array.isReadonlyArrayNonEmpty(result.accepted)) {
    return result.accepted
  } else {
    return state.acceptedFiles
  }
}

const mergeFiles = (
  state: State,
  incoming: ReadonlyArray<FileEntry>,
  props: Props,
  mode: 'Add' | 'Replace',
): Idle => {
  const baseExisting = mode === 'Replace' ? [] : state.acceptedFiles
  const result = validateFiles(incoming, baseExisting, props)
  return Idle({
    acceptedFiles: nextAcceptedOf(state, result, props, mode),
    rejectedFiles: result.rejected,
    hasNonFileDrop: false,
  })
}

const dropFilesState = (
  state: State,
  files: ReadonlyArray<FileEntry>,
  props: Props,
): Idle =>
  Array.isReadonlyArrayEmpty(files)
    ? Idle({
        acceptedFiles: state.acceptedFiles,
        rejectedFiles: state.rejectedFiles,
        hasNonFileDrop: true,
      })
    : mergeFiles(state, files, props, 'Add')

const removeAcceptedByName = (
  files: ReadonlyArray<FileEntry>,
  name: string,
): Option.Option<ReadonlyArray<FileEntry>> => {
  const next = Array.filter(files, file => file.name !== name)
  return next.length === files.length ? Option.none() : Option.some(next)
}

const removeRejectedByName = (
  files: ReadonlyArray<RejectedFile>,
  name: string,
): Option.Option<ReadonlyArray<RejectedFile>> => {
  const next = Array.filter(files, entry => entry.file.name !== name)
  return next.length === files.length ? Option.none() : Option.some(next)
}

const canInteractGuard = (
  _state: State,
  _message: Message,
  context: Props,
): boolean => isInteractive(context)

// CHART

/**
 * The FileDrop Machine chart: drag nesting depth (`Idle` <-> `DraggingOver`)
 * preventing child flicker, MIME/wildcard/extension + size + count + duplicate
 * validation, add/set/remove/clear actions, non-file drop flag, and
 * disabled/read-only guards.
 */
export const chartOf = (initialState: State) =>
  define({ state: State, message: Message, context: Props })({
    initial: initialState,
    states: {
      Idle: {
        on: {
          EnterDragZone: [
            when(canInteractGuard, 'DraggingOver', ({ state }) =>
              DraggingOver({
                dragDepth: enterDragDepth(0),
                acceptedFiles: state.acceptedFiles,
                rejectedFiles: state.rejectedFiles,
                hasNonFileDrop: state.hasNonFileDrop,
              }),
            ),
            ignore(),
          ],
          LeaveDragZone: [ignore()],
          DropFiles: [
            when(canInteractGuard, 'Idle', ({ state, message, context }) =>
              dropFilesState(state, message.files, context),
            ),
            ignore(),
          ],
          DropNonFiles: [
            when(canInteractGuard, 'Idle', ({ state }) =>
              Idle({
                acceptedFiles: state.acceptedFiles,
                rejectedFiles: state.rejectedFiles,
                hasNonFileDrop: true,
              }),
            ),
            ignore(),
          ],
          AddFiles: [
            when(canInteractGuard, 'Idle', ({ state, message, context }) =>
              mergeFiles(state, message.files, context, 'Add'),
            ),
            ignore(),
          ],
          SetFiles: [
            when(canInteractGuard, 'Idle', ({ state, message, context }) =>
              mergeFiles(state, message.files, context, 'Replace'),
            ),
            ignore(),
          ],
          RemoveFile: [
            when(
              (state, message, context) =>
                isInteractive(context)
                  ? removeAcceptedByName(state.acceptedFiles, message.name)
                  : Option.none(),
              'Idle',
              ({ state, guardValue }) =>
                Idle({
                  acceptedFiles: guardValue,
                  rejectedFiles: state.rejectedFiles,
                  hasNonFileDrop: state.hasNonFileDrop,
                }),
            ),
            ignore(),
          ],
          RemoveRejectedFile: [
            when(
              (state, message, context) =>
                isInteractive(context)
                  ? removeRejectedByName(state.rejectedFiles, message.name)
                  : Option.none(),
              'Idle',
              ({ state, guardValue }) =>
                Idle({
                  acceptedFiles: state.acceptedFiles,
                  rejectedFiles: guardValue,
                  hasNonFileDrop: state.hasNonFileDrop,
                }),
            ),
            ignore(),
          ],
          ClearFiles: [
            when(
              (state, _message, context) =>
                isInteractive(context) &&
                (hasAnyFiles(state) || state.hasNonFileDrop),
              'Idle',
              () =>
                Idle({
                  acceptedFiles: [],
                  rejectedFiles: [],
                  hasNonFileDrop: false,
                }),
            ),
            ignore(),
          ],
          ClearRejectedFiles: [
            when(
              (state, _message, context) =>
                isInteractive(context) &&
                (Array.isReadonlyArrayNonEmpty(state.rejectedFiles) ||
                  state.hasNonFileDrop),
              'Idle',
              ({ state }) =>
                Idle({
                  acceptedFiles: state.acceptedFiles,
                  rejectedFiles: [],
                  hasNonFileDrop: false,
                }),
            ),
            ignore(),
          ],
        },
      },
      DraggingOver: {
        on: {
          EnterDragZone: [
            when(canInteractGuard, 'DraggingOver', ({ state }) =>
              DraggingOver({
                dragDepth: enterDragDepth(state.dragDepth),
                acceptedFiles: state.acceptedFiles,
                rejectedFiles: state.rejectedFiles,
                hasNonFileDrop: state.hasNonFileDrop,
              }),
            ),
            ignore(),
          ],
          LeaveDragZone: [
            when(
              state => isDraggingDepth(leaveDragDepth(state.dragDepth)),
              'DraggingOver',
              ({ state }) =>
                DraggingOver({
                  dragDepth: leaveDragDepth(state.dragDepth),
                  acceptedFiles: state.acceptedFiles,
                  rejectedFiles: state.rejectedFiles,
                  hasNonFileDrop: state.hasNonFileDrop,
                }),
            ),
            when(
              state => !isDraggingDepth(leaveDragDepth(state.dragDepth)),
              'Idle',
              ({ state }) =>
                Idle({
                  acceptedFiles: state.acceptedFiles,
                  rejectedFiles: state.rejectedFiles,
                  hasNonFileDrop: state.hasNonFileDrop,
                }),
            ),
            ignore(),
          ],
          DropFiles: [
            when(canInteractGuard, 'Idle', ({ state, message, context }) =>
              dropFilesState(state, message.files, context),
            ),
            when(
              (_state, _message, context) => !isInteractive(context),
              'Idle',
              ({ state }) =>
                Idle({
                  acceptedFiles: state.acceptedFiles,
                  rejectedFiles: state.rejectedFiles,
                  hasNonFileDrop: state.hasNonFileDrop,
                }),
            ),
            ignore(),
          ],
          DropNonFiles: [
            when(canInteractGuard, 'Idle', ({ state }) =>
              Idle({
                acceptedFiles: state.acceptedFiles,
                rejectedFiles: state.rejectedFiles,
                hasNonFileDrop: true,
              }),
            ),
            when(
              (_state, _message, context) => !isInteractive(context),
              'Idle',
              ({ state }) =>
                Idle({
                  acceptedFiles: state.acceptedFiles,
                  rejectedFiles: state.rejectedFiles,
                  hasNonFileDrop: state.hasNonFileDrop,
                }),
            ),
            ignore(),
          ],
          AddFiles: [
            when(canInteractGuard, 'Idle', ({ state, message, context }) =>
              mergeFiles(state, message.files, context, 'Add'),
            ),
            ignore(),
          ],
          SetFiles: [
            when(canInteractGuard, 'Idle', ({ state, message, context }) =>
              mergeFiles(state, message.files, context, 'Replace'),
            ),
            ignore(),
          ],
          RemoveFile: [
            when(
              (state, message, context) =>
                isInteractive(context)
                  ? removeAcceptedByName(state.acceptedFiles, message.name)
                  : Option.none(),
              'DraggingOver',
              ({ state, guardValue }) =>
                DraggingOver({
                  dragDepth: state.dragDepth,
                  acceptedFiles: guardValue,
                  rejectedFiles: state.rejectedFiles,
                  hasNonFileDrop: state.hasNonFileDrop,
                }),
            ),
            ignore(),
          ],
          RemoveRejectedFile: [
            when(
              (state, message, context) =>
                isInteractive(context)
                  ? removeRejectedByName(state.rejectedFiles, message.name)
                  : Option.none(),
              'DraggingOver',
              ({ state, guardValue }) =>
                DraggingOver({
                  dragDepth: state.dragDepth,
                  acceptedFiles: state.acceptedFiles,
                  rejectedFiles: guardValue,
                  hasNonFileDrop: state.hasNonFileDrop,
                }),
            ),
            ignore(),
          ],
          ClearFiles: [
            when(canInteractGuard, 'Idle', () =>
              Idle({
                acceptedFiles: [],
                rejectedFiles: [],
                hasNonFileDrop: false,
              }),
            ),
            ignore(),
          ],
          ClearRejectedFiles: [
            when(
              (state, _message, context) =>
                isInteractive(context) &&
                (Array.isReadonlyArrayNonEmpty(state.rejectedFiles) ||
                  state.hasNonFileDrop),
              'DraggingOver',
              ({ state }) =>
                DraggingOver({
                  dragDepth: state.dragDepth,
                  acceptedFiles: state.acceptedFiles,
                  rejectedFiles: [],
                  hasNonFileDrop: false,
                }),
            ),
            ignore(),
          ],
        },
      },
    },
  })

/** Default FileDrop Machine chart starting in `Idle`. */
export const chart = chartOf(initial)

// SYNC

const syncTableOf = (pace: Sync): Readonly<Record<Message['_tag'], Sync>> => ({
  AddFiles: pace,
  RemoveFile: pace,
  ClearFiles: pace,
  ClearRejectedFiles: pace,
  EnterDragZone: pace,
  LeaveDragZone: pace,
  DropFiles: pace,
  DropNonFiles: pace,
  SetFiles: pace,
  RemoveRejectedFile: pace,
})

/** Default synchronization: every FileDrop Message syncs. */
export const synced: Readonly<Record<Message['_tag'], Sync>> =
  syncTableOf(Synced())

/** Device-only synchronization table for a FileDrop kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => syncTableOf(Device({ because }))

// SLOTS & PROJECTION

/**
 * The five painted slots of a FileDrop Part:
 * - `Dropzone`: the drop region (`role="region"`, `aria-current` while dragging over, `aria-invalid`, `aria-disabled`, `aria-readonly`).
 * - `Trigger`: the file picker trigger button (`role="button"`).
 * - `Item`: one attached file entry (`role="group"`).
 * - `RemoveButton`: removes one attached file (`role="button"`, `RemoveFile`).
 * - `ClearButton`: clears all attached and rejected files (`role="button"`, `ClearFiles`).
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Dropzone: {
    role: 'Region',
    focus: 'Container',
    gestures: [],
  },
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [],
  },
  Item: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  RemoveButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'RemoveFile' }],
  },
  ClearButton: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'ClearFiles' }],
  },
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const interactive = isInteractive(props)
  if (slot === 'Dropzone') {
    return {
      id: dropzoneId(props.id),
      isCurrent: isDraggingOver(state),
      tabIndex: interactive ? 0 : -1,
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.labelledBy === undefined
        ? {}
        : { labelledBy: props.labelledBy }),
      ...(props.describedBy === undefined
        ? {}
        : { describedBy: props.describedBy }),
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
      ...(props.isRequired === true ? { isRequired: true } : {}),
      ...(isInvalidOf(state, props) ? { isInvalid: true } : {}),
    }
  } else if (slot === 'Trigger') {
    return {
      id: triggerId(props.id),
      tabIndex: interactive ? 0 : -1,
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
      ...(isReadOnlyOf(props) ? { isReadOnly: true } : {}),
    }
  } else if (slot === 'Item') {
    const name = Option.getOrElse(maybeChoice, () => '')
    return {
      id: itemId(props.id, name),
      label: name,
      ...(isDisabledOf(props) ? { isDisabled: true } : {}),
    }
  } else if (slot === 'RemoveButton') {
    const name = Option.getOrElse(maybeChoice, () => '')
    return {
      id: removeButtonId(props.id, name),
      label: `Remove ${name}`,
      tabIndex: interactive ? 0 : -1,
      ...(!interactive ? { isDisabled: true } : {}),
    }
  } else if (slot === 'ClearButton') {
    const canClear = interactive && (hasAnyFiles(state) || state.hasNonFileDrop)
    return {
      id: clearButtonId(props.id),
      tabIndex: canClear ? 0 : -1,
      ...(!canClear ? { isDisabled: true } : {}),
    }
  } else {
    return {}
  }
}

/**
 * What a restart opens FileDrop on: settles transient `DraggingOver` state
 * back to `Idle` while preserving accepted and rejected file metadata.
 */
export const atRest = (state: State): State =>
  Idle({
    acceptedFiles: state.acceptedFiles,
    rejectedFiles: state.rejectedFiles,
    hasNonFileDrop: state.hasNonFileDrop,
  })

// PART FACTORY

/** Options for customizing a FileDrop Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this FileDrop device-only. */
  sync?: 'Synced' | DeviceReason
  /** Initial accepted files pre-populated in the Part's chart. */
  defaultFiles?: ReadonlyArray<FileEntry>
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a FileDrop {@link Part.Part}. Synced by default (`category: 'Domain'`);
 * pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep a Program's
 * FileDrop local to one device.
 *
 * @example
 * ```typescript
 * const ResumeDrop = FileDrop.make({ name: 'ResumeDrop' })
 * const LocalDrop = FileDrop.deviceOnly({ name: 'LocalDrop' })
 * ```
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'FileDrop',
    State,
    Message,
    chart:
      options.defaultFiles === undefined
        ? chart
        : chartOf(initialWithFiles(options.defaultFiles)),
    actions,
    sync:
      options.sync === undefined || options.sync === 'Synced'
        ? synced
        : deviceSync(options.sync),
    category: options.category ?? 'Domain',
    slots,
    atRest,
    project: projectSlot,
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
  })

/**
 * Shorthand for a FileDrop Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> =>
  make({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.category === undefined ? {} : { category: options.category }),
    ...(options.defaultFiles === undefined
      ? {}
      : { defaultFiles: options.defaultFiles }),
    ...(options.configuration === undefined
      ? {}
      : { configuration: options.configuration }),
    sync: options.because ?? 'OwnView',
  })

/** The default synced FileDrop Part (`name: 'FileDrop'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
