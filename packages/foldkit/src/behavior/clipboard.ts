import { Array, Match as M, Option, Schema as S } from 'effect'

import * as Catalog from '../catalog/catalog.js'
import * as Command from '../command/index.js'
import {
  define,
  forStates,
  ignore,
  to,
  when,
} from '../experimental/machine/machine.js'
import { m, ts } from '../schema/index.js'
import type { MessageCategory } from '../synchronization/synchronization.js'
import { Device, type DeviceReason, type Sync, Synced } from './pace.js'
import * as Part from './part.js'
import type { SlotProps } from './slot.js'
import * as TimedHint from './timedHint.js'

// NOTE: this is the core Clipboard Part (Widget #53 of 54, Scribe #2692). It
// composes `TimedHint` into a framework-free Machine and Part over `Idle |
// Copying | Copied | Failed` with zero `navigator.clipboard` or timer access
// inside `foldkit/behavior`. Entering `Copying` exposes `pendingCopyTextOf`
// for any host adapter to perform the platform clipboard write and answer
// `SucceededClipboardCopy` or `FailedClipboardCopy`; `Copied` schedules
// `WaitForClipboardHintElapsed` (`Command.answerAfter`, 3000 ms default) and
// automatically resets to `Idle` when the matching version elapses.

// CONSTANTS

/** Default copied feedback duration in milliseconds (`3000`, matching Zag Clipboard). */
export const defaultTimeoutMs = 3000

/** Default accessible label on the copy trigger while not copied. */
export const defaultCopyLabel = 'Copy to clipboard'

/** Default accessible label on the copy trigger while copied. */
export const defaultCopiedLabel = 'Copied to clipboard'

// SCHEMAS

/** Standard `data-state` marker for Clipboard (`'idle' | 'copying' | 'copied' | 'failed'`). */
export const DataState = S.Literals(['idle', 'copying', 'copied', 'failed'])
/** Standard `data-state` marker for Clipboard. */
export type DataState = typeof DataState.Type

/**
 * Read-only configuration supplied to the Clipboard chart and projection from
 * the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  defaultValue: S.optionalKey(S.String),
  timeoutMs: S.optionalKey(S.Number),
  isDisabled: S.optionalKey(S.Boolean),
  label: S.optionalKey(S.String),
  labelledBy: S.optionalKey(S.String),
  hasLabel: S.optionalKey(S.Boolean),
  copyLabel: S.optionalKey(S.String),
  copiedLabel: S.optionalKey(S.String),
})
/** Read-only configuration supplied to the Clipboard chart and projection. */
export type Props = typeof Props.Type

// STATE

/** Resting clipboard state holding the current text `value` and embedded `TimedHint` state. */
export const Idle = ts('Idle', {
  value: S.String,
  hint: TimedHint.State,
})
/** Resting clipboard state. */
export type Idle = typeof Idle.Type

/** A copy request is awaiting the host adapter's clipboard write of `pendingText`. */
export const Copying = ts('Copying', {
  value: S.String,
  pendingText: S.String,
  hint: TimedHint.State,
})
/** A copy request is awaiting the host adapter's clipboard write. */
export type Copying = typeof Copying.Type

/** The text `copiedText` was copied; `hint` tracks the auto-reset countdown back to `Idle`. */
export const Copied = ts('Copied', {
  value: S.String,
  copiedText: S.String,
  hint: TimedHint.State,
})
/** The text was copied and feedback is active. */
export type Copied = typeof Copied.Type

/** The host clipboard write failed with `reason`. */
export const Failed = ts('Failed', {
  value: S.String,
  reason: S.String,
  hint: TimedHint.State,
})
/** The host clipboard write failed. */
export type Failed = typeof Failed.Type

/** Where a Clipboard Part stands: `Idle`, `Copying`, `Copied`, or `Failed`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Copying, Copied, Failed])
/** Where a Clipboard Part stands. */
export type State = typeof State.Type

/** Initial Clipboard state: idle, empty value, hidden `TimedHint`. */
export const initial: State = Idle({
  value: '',
  hint: TimedHint.initial,
})

/** Creates an initial idle Clipboard state seeded with `value`. */
export const initialValue = (value: string): State =>
  Idle({
    value,
    hint: TimedHint.initial,
  })

// ACTIONS

/** Sets the text value prepared for copying. */
export const SetClipboardValue = Catalog.action('SetClipboardValue', {
  fields: { value: S.String },
  choose: {
    field: 'value',
    noun: 'text',
    prompt: 'Set the text to copy?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter text to copy',
  },
  what: 'Updates the text prepared for copying',
  why: 'To change the content placed on the clipboard',
  meta: { label: 'Set copy text', keys: [] },
})

/** Requests copying the current clipboard value so the host adapter can write it. */
export const CopyClipboard = Catalog.action('CopyClipboard', {
  what: 'Requests copying the current text to the clipboard',
  why: 'To reuse the content elsewhere',
  meta: { label: 'Copy', keys: [] },
})

/** Resets copy feedback and restores the configured default value. */
export const ResetClipboard = Catalog.action('ResetClipboard', {
  what: 'Clears copy feedback and restores the default text',
  why: 'To return the copy control to its idle state',
  meta: { label: 'Reset clipboard', keys: [] },
})

/** The Catalog Actions a Clipboard Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SetClipboardValue,
  CopyClipboard,
  ResetClipboard,
]

// MESSAGES

/** Requests copying the current value or an explicit `text` override. */
export const RequestedClipboardCopy = m('RequestedClipboardCopy', {
  text: S.optionalKey(S.String),
})

/** Host adapter confirmed that the clipboard write succeeded. */
export const SucceededClipboardCopy = m('SucceededClipboardCopy')

/** Host adapter reported that the clipboard write failed with `reason`. */
export const FailedClipboardCopy = m('FailedClipboardCopy', {
  reason: S.String,
})

/** Scheduled copied-feedback `TimedHint` timer elapsed for `version`. */
export const ElapsedClipboardHint = m('ElapsedClipboardHint', {
  version: S.Number,
})

/** Every Message the Clipboard chart handles. */
export const Message = S.Union([
  SetClipboardValue,
  CopyClipboard,
  RequestedClipboardCopy,
  SucceededClipboardCopy,
  FailedClipboardCopy,
  ElapsedClipboardHint,
  ResetClipboard,
])
/** Every Message the Clipboard chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Clipboard Part. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits `afterMs` milliseconds and answers `ElapsedClipboardHint({ version })`. */
export const WaitForClipboardHintElapsed = Command.define(
  'WaitForClipboardHintElapsed',
  { version: S.Number, afterMs: S.Number },
  ElapsedClipboardHint,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedClipboardHint({ version })),
)

// ELEMENT IDS

/** Derives the root container element id from a Clipboard base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the label element id from a Clipboard base `id`. */
export const labelId = (id: string): string => `${id}-label`

/** Derives the control group element id from a Clipboard base `id`. */
export const controlId = (id: string): string => `${id}-control`

/** Derives the read-only input element id from a Clipboard base `id`. */
export const inputId = (id: string): string => `${id}-input`

/** Derives the copy trigger button element id from a Clipboard base `id`. */
export const triggerId = (id: string): string => `${id}-trigger`

/** Derives the copy status indicator element id from a Clipboard base `id`. */
export const indicatorId = (id: string): string => `${id}-indicator`

// PURE RULES & READINGS

/** Resolved auto-reset feedback timeout in milliseconds (`3000` by default; `<= 0` keeps feedback sticky). */
export const timeoutMsOf = (props: Pick<Props, 'timeoutMs'> = {}): number =>
  props.timeoutMs !== undefined && Number.isFinite(props.timeoutMs)
    ? props.timeoutMs
    : defaultTimeoutMs

/** True when the copy trigger is disabled (`false` by default). */
export const isDisabledOf = (props: Pick<Props, 'isDisabled'> = {}): boolean =>
  props.isDisabled === true

/** Current text value (falling back to `props.defaultValue` when `state.value` is empty). */
export const valueOf = (
  state: State,
  props?: Pick<Props, 'defaultValue'>,
): string => (state.value !== '' ? state.value : (props?.defaultValue ?? ''))

/** True while copied confirmation feedback is active (`state._tag === 'Copied'`). */
export const copiedOf = (state: State): boolean => state._tag === 'Copied'

/** True while a host clipboard write is pending (`state._tag === 'Copying'`). */
export const isCopying = (state: State): boolean => state._tag === 'Copying'

/** True when the last clipboard write failed (`state._tag === 'Failed'`). */
export const isFailed = (state: State): boolean => state._tag === 'Failed'

/** True when the Clipboard is at rest (`state._tag === 'Idle'`). */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/**
 * The text waiting to be written by a host adapter while in `Copying`, or
 * `Option.none()` in all other states.
 */
export const pendingCopyTextOf = (state: State): Option.Option<string> =>
  state._tag === 'Copying' ? Option.some(state.pendingText) : Option.none()

/** The text that was most recently copied while in `Copied`, or `Option.none()`. */
export const copiedTextOf = (state: State): Option.Option<string> =>
  state._tag === 'Copied' ? Option.some(state.copiedText) : Option.none()

/** Failure reason reported by the host while in `Failed`, or `Option.none()`. */
export const failureReasonOf = (state: State): Option.Option<string> =>
  state._tag === 'Failed' ? Option.some(state.reason) : Option.none()

/** Standard `data-state` marker (`'idle' | 'copying' | 'copied' | 'failed'`). */
export const dataStateOf = (state: State): DataState =>
  M.value(state).pipe(
    M.withReturnType<DataState>(),
    M.tagsExhaustive({
      Idle: () => 'idle',
      Copying: () => 'copying',
      Copied: () => 'copied',
      Failed: () => 'failed',
    }),
  )

// INTERNAL TRANSITION HELPERS

const dismissHint = (hint: TimedHint.State): TimedHint.State => {
  const [nextHint] = TimedHint.chart.transition(hint, TimedHint.DismissHint())
  return nextHint
}

const mapHintCommands = (
  hint: TimedHint.State,
  hintCommands: ReadonlyArray<Command.Command<TimedHint.Message>>,
): ReadonlyArray<Command.Command<Message>> => {
  if (Array.isReadonlyArrayEmpty(hintCommands)) {
    return []
  } else {
    return Option.match(TimedHint.durationMsOf(hint), {
      onNone: () => [],
      onSome: afterMs => [
        WaitForClipboardHintElapsed({
          version: TimedHint.versionOf(hint),
          afterMs,
        }),
      ],
    })
  }
}

const enterCopied = (
  value: string,
  copiedText: string,
  hint: TimedHint.State,
  props: Props,
): Readonly<{
  model: Copied
  commands: ReadonlyArray<Command.Command<Message>>
}> => {
  const timeoutMs = timeoutMsOf(props)
  const maybeDurationMs =
    timeoutMs > 0 ? Option.some(timeoutMs) : Option.none<number>()
  const [nextHint, hintCommands] = TimedHint.chart.transition(
    hint,
    TimedHint.ShowHint({ maybeDurationMs }),
  )
  return {
    model: Copied({
      value,
      copiedText,
      hint: nextHint,
    }),
    commands: mapHintCommands(nextHint, hintCommands),
  }
}

// CHART

/**
 * The Clipboard Machine chart: value updates, copy requests entering
 * `Copying` with `pendingCopyTextOf`, host success scheduling `TimedHint`
 * auto-reset via `WaitForClipboardHintElapsed`, host failure entering
 * `Failed`, version-guarded `ElapsedClipboardHint` returning to `Idle`, and
 * `ResetClipboard`.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          SetClipboardValue: to('Idle', ({ state, message }) =>
            Idle({
              value: message.value,
              hint: state.hint,
            }),
          ),
          SucceededClipboardCopy: to('Copied', ({ state, context }) =>
            enterCopied(
              state.value,
              valueOf(state, context),
              state.hint,
              context,
            ),
          ),
          FailedClipboardCopy: [ignore()],
          ElapsedClipboardHint: [ignore()],
        },
      },
      Copying: {
        on: {
          SetClipboardValue: to('Copying', ({ state, message }) =>
            Copying({
              ...state,
              value: message.value,
            }),
          ),
          SucceededClipboardCopy: to('Copied', ({ state, context }) =>
            enterCopied(state.value, state.pendingText, state.hint, context),
          ),
          FailedClipboardCopy: to('Failed', ({ state, message }) =>
            Failed({
              value: state.value,
              reason: message.reason,
              hint: dismissHint(state.hint),
            }),
          ),
          ElapsedClipboardHint: [ignore()],
        },
      },
      Copied: {
        on: {
          SetClipboardValue: [
            when(
              (state, message) => message.value !== state.value,
              'Idle',
              ({ state, message }) =>
                Idle({
                  value: message.value,
                  hint: dismissHint(state.hint),
                }),
            ),
            ignore(),
          ],
          SucceededClipboardCopy: to('Copied', ({ state, context }) =>
            enterCopied(state.value, state.copiedText, state.hint, context),
          ),
          FailedClipboardCopy: [ignore()],
          ElapsedClipboardHint: [
            when(
              (state, message) =>
                TimedHint.shouldAcceptElapsed(state.hint, message.version),
              'Idle',
              ({ state, message }) => {
                const [nextHint] = TimedHint.chart.transition(
                  state.hint,
                  TimedHint.ElapsedHint({ version: message.version }),
                )
                return Idle({
                  value: state.value,
                  hint: nextHint,
                })
              },
            ),
            ignore(),
          ],
        },
      },
      Failed: {
        on: {
          SetClipboardValue: to('Idle', ({ state, message }) =>
            Idle({
              value: message.value,
              hint: state.hint,
            }),
          ),
          SucceededClipboardCopy: [ignore()],
          FailedClipboardCopy: [ignore()],
          ElapsedClipboardHint: [ignore()],
        },
      },
    },
    shared: [
      forStates(['Idle', 'Copying', 'Copied', 'Failed']).on({
        CopyClipboard: [
          when(
            (_state, _message, context) => !isDisabledOf(context),
            'Copying',
            ({ state, context }) => {
              const text = valueOf(state, context)
              return Copying({
                value: state.value,
                pendingText: text,
                hint: dismissHint(state.hint),
              })
            },
          ),
          ignore(),
        ],
        RequestedClipboardCopy: [
          when(
            (_state, _message, context) => !isDisabledOf(context),
            'Copying',
            ({ state, message, context }) => {
              const text = message.text ?? valueOf(state, context)
              return Copying({
                value: state.value,
                pendingText: text,
                hint: dismissHint(state.hint),
              })
            },
          ),
          ignore(),
        ],
        ResetClipboard: to('Idle', ({ state, context }) =>
          Idle({
            value: context.defaultValue ?? '',
            hint: dismissHint(state.hint),
          }),
        ),
      }),
    ],
  },
)

// SYNC

/** Default Clipboard synchronization: all Messages synced immediately. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = {
  SetClipboardValue: Synced(),
  CopyClipboard: Synced(),
  RequestedClipboardCopy: Synced(),
  SucceededClipboardCopy: Synced(),
  FailedClipboardCopy: Synced(),
  ElapsedClipboardHint: Synced(),
  ResetClipboard: Synced(),
}

/** Device-only synchronization table for a Clipboard kept local to one device (`'DeviceEffect'` by default). */
export const deviceSync = (
  because: DeviceReason = 'DeviceEffect',
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetClipboardValue: Device({ because }),
  CopyClipboard: Device({ because }),
  RequestedClipboardCopy: Device({ because }),
  SucceededClipboardCopy: Device({ because }),
  FailedClipboardCopy: Device({ because }),
  ElapsedClipboardHint: Device({ because }),
  ResetClipboard: Device({ because }),
})

// SLOTS & PROJECTION

/**
 * The six painted slots of a Clipboard Part: `Root`, `Label`, `Control`,
 * `Input`, `Trigger`, and `Indicator`.
 */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    focus: 'None',
    gestures: [],
  },
  Label: {
    focus: 'None',
    gestures: [],
  },
  Control: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Input: {
    role: 'TextBox',
    focus: 'None',
    gestures: [],
  },
  Trigger: {
    role: 'Button',
    focus: 'None',
    gestures: [{ gesture: 'Pressed', becomes: 'CopyClipboard' }],
  },
  Indicator: {
    role: 'Status',
    focus: 'None',
    gestures: [],
  },
}

const labelPropsOf = (
  props: Props,
): Pick<SlotProps, 'label' | 'labelledBy'> => {
  if (props.labelledBy !== undefined) {
    return { labelledBy: props.labelledBy }
  } else if (props.label !== undefined && props.hasLabel !== true) {
    return { label: props.label }
  } else if (props.hasLabel === false) {
    return props.label === undefined ? {} : { label: props.label }
  } else {
    return { labelledBy: labelId(props.id) }
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  maybeChoice: Option.Option<string>,
): SlotProps => {
  const isCopied = copiedOf(state)
  const isDisabled = isDisabledOf(props)
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
    }
  } else if (slot === 'Label') {
    return {
      id: labelId(props.id),
    }
  } else if (slot === 'Control') {
    return {
      id: controlId(props.id),
      ...labelPropsOf(props),
    }
  } else if (slot === 'Input') {
    return {
      id: inputId(props.id),
      isReadOnly: true,
      ...labelPropsOf(props),
      ...(isDisabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Trigger') {
    return {
      id: triggerId(props.id),
      label: isCopied
        ? (props.copiedLabel ?? defaultCopiedLabel)
        : (props.copyLabel ?? defaultCopyLabel),
      isPressed: isCopied,
      ...(isDisabled ? { isDisabled: true } : {}),
    }
  } else if (slot === 'Indicator') {
    const mode = Option.getOrElse(maybeChoice, () => 'copied')
    const isVisible = mode === 'idle' ? !isCopied : isCopied
    return {
      id: indicatorId(props.id),
      live: 'Polite',
      isAtomic: true,
      ...(isVisible ? {} : { isHidden: true }),
    }
  } else {
    return {}
  }
}

/** What a restart opens a Clipboard on: idle, preserving its value and resting its `TimedHint`. */
export const atRest = (state: State): State =>
  Idle({
    value: state.value,
    hint: TimedHint.atRest(state.hint),
  })

// PART FACTORY

/** Options for customizing a Clipboard Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'DeviceEffect'`) to keep this Clipboard device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates a Clipboard {@link Part.Part}. Synced by default
 * (`category: 'Domain'`, `Pace.Synced`); pass `sync: 'DeviceEffect'` (or use
 * {@link deviceOnly}) to keep copy state local to one device.
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Clipboard',
    State,
    Message,
    chart,
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
 * Shorthand for a Clipboard Part whose state stays on the device and is
 * omitted from the synced log and encoded Model.
 */
export const deviceOnly = (
  options: Omit<MakeOptions, 'sync'> &
    Readonly<{ because?: DeviceReason }> = {},
): Part.Part<State, Message, Props> => {
  const { because, ...rest } = options
  return make({
    ...rest,
    sync: because ?? 'DeviceEffect',
  })
}

/** The default synced Clipboard Part (`name: 'Clipboard'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
