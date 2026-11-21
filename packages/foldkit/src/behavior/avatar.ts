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

// NOTE: this is the core Avatar Part (Widget #52 of 54, Scribe #2691). It
// manages image loading lifecycle (`Idle | Loading | Loaded | Error`),
// optional `fallbackDelayMs` via `Command.answerAfter` (zero timers inside
// `foldkit/behavior`), deterministic `showImage` / `showFallback` visibility
// readings, and pure `initialsOf(name)` extraction. Synced by default
// (`Domain` category, `Pace.Synced`) with `Avatar.make` and
// `Avatar.deviceOnly()`.

// CONSTANTS

/** Default delay in milliseconds before showing fallback while loading (`0`: immediate). */
export const defaultFallbackDelayMs = 0

/** Default maximum number of characters produced by {@link initialsOf} (`2`). */
export const defaultMaxInitials = 2

// SCHEMAS

/** Standard `data-state` marker for the Avatar image visibility (`'visible' | 'hidden'`). */
export const VisibilityState = S.Literals(['visible', 'hidden'])
/** Standard `data-state` marker for Avatar visibility. */
export type VisibilityState = typeof VisibilityState.Type

/**
 * Read-only configuration supplied to the Avatar chart and projection from
 * the Program's Model.
 */
export const Props = S.Struct({
  id: S.String,
  src: S.optionalKey(S.Option(S.String)),
  name: S.optionalKey(S.String),
  alt: S.optionalKey(S.String),
  fallbackDelayMs: S.optionalKey(S.Number),
})
/** Read-only configuration supplied to the Avatar chart and projection. */
export type Props = typeof Props.Type

// STATE

/** No image is actively loading or displayed; fallback is shown. */
export const Idle = ts('Idle', {
  maybeSrc: S.Option(S.String),
  name: S.String,
  version: S.Number,
})
/** No image is actively loading or displayed. */
export type Idle = typeof Idle.Type

/** An image at `src` is loading. `isFallbackReady` becomes `true` immediately or after `fallbackDelayMs`. */
export const Loading = ts('Loading', {
  src: S.String,
  name: S.String,
  isFallbackReady: S.Boolean,
  version: S.Number,
})
/** An image at `src` is loading. */
export type Loading = typeof Loading.Type

/** The image at `src` loaded successfully and is visible; fallback is hidden. */
export const Loaded = ts('Loaded', {
  src: S.String,
  name: S.String,
  version: S.Number,
})
/** The image at `src` loaded successfully. */
export type Loaded = typeof Loaded.Type

/** Loading the image failed; fallback is visible until a load succeeds or the source changes. */
export const Error = ts('Error', {
  maybeSrc: S.Option(S.String),
  name: S.String,
  version: S.Number,
})
/** Loading the image failed. */
export type Error = typeof Error.Type

/** Where an Avatar Part stands: `Idle`, `Loading`, `Loaded`, or `Error`. Lives in the Model and is JSON-serializable. */
export const State = S.Union([Idle, Loading, Loaded, Error])
/** Where an Avatar Part stands. */
export type State = typeof State.Type

/** Initial Avatar state: idle with no source and version `0`. */
export const initial: State = Idle({
  maybeSrc: Option.none(),
  name: '',
  version: 0,
})

/** Creates an initial idle Avatar state carrying `name` and optional `maybeSrc`. */
export const initialProfile = (
  name: string,
  maybeSrc: Option.Option<string> = Option.none(),
): State =>
  Idle({
    maybeSrc: Option.filter(maybeSrc, candidate => candidate.trim() !== ''),
    name,
    version: 0,
  })

// ACTIONS

/** Sets the avatar image source address; an empty string clears the source back to `Idle`. */
export const SetAvatarSource = Catalog.action('SetAvatarSource', {
  fields: { src: S.String },
  choose: {
    field: 'src',
    noun: 'image source',
    prompt: 'Which image address should the avatar display?',
    token: S.String,
    choicesOf: () => [],
    accepts: () => Catalog.Enabled(),
    nothingToChoose: 'Enter an image address',
  },
  what: 'Sets the image address for the avatar',
  why: 'To load a portrait representing the subject',
  meta: { label: 'Set avatar image', keys: [] },
})

/** Resets the avatar back to its resting `Idle` fallback state. */
export const ResetAvatar = Catalog.action('ResetAvatar', {
  what: 'Clears the avatar image back to its fallback',
  why: 'To restore the resting initials display',
  meta: { label: 'Reset avatar', keys: [] },
})

/** The Catalog Actions an Avatar Part exposes to people and agents. */
export const actions: ReadonlyArray<Catalog.AnyAction> = [
  SetAvatarSource,
  ResetAvatar,
]

// MESSAGES

/** Host notified the chart that image loading began for the current or supplied `src`. */
export const StartedLoadingAvatar = m('StartedLoadingAvatar', {
  src: S.optionalKey(S.String),
  name: S.optionalKey(S.String),
})

/** Host notified the chart that the avatar image loaded cleanly. */
export const LoadedAvatarImage = m('LoadedAvatarImage')

/** Host notified the chart that loading the avatar image failed. */
export const FailedAvatarImage = m('FailedAvatarImage')

/** Scheduled `fallbackDelayMs` timer elapsed for `version` while still `Loading`. */
export const ElapsedAvatarFallbackDelay = m('ElapsedAvatarFallbackDelay', {
  version: S.Number,
})

/** Every Message the Avatar chart handles. */
export const Message = S.Union([
  SetAvatarSource,
  StartedLoadingAvatar,
  LoadedAvatarImage,
  FailedAvatarImage,
  ElapsedAvatarFallbackDelay,
  ResetAvatar,
])
/** Every Message the Avatar chart handles. */
export type Message = typeof Message.Type

/** True for a Message of the Avatar Part. */
export const isMessage = S.is(Message)

// COMMAND

/** Waits `afterMs` milliseconds and answers `ElapsedAvatarFallbackDelay({ version })`. */
export const WaitForAvatarFallbackDelay = Command.define(
  'WaitForAvatarFallbackDelay',
  { version: S.Number, afterMs: S.Number },
  ElapsedAvatarFallbackDelay,
)(({ version, afterMs }) =>
  Command.answerAfter(afterMs, ElapsedAvatarFallbackDelay({ version })),
)

// ELEMENT IDS

/** Derives the root container element id from an Avatar base `id`. */
export const rootId = (id: string): string => `${id}-root`

/** Derives the image element id from an Avatar base `id`. */
export const imageId = (id: string): string => `${id}-image`

/** Derives the fallback initials element id from an Avatar base `id`. */
export const fallbackId = (id: string): string => `${id}-fallback`

// PURE RULES & READINGS

/** Resolved non-negative fallback delay in milliseconds (`0` by default). */
export const fallbackDelayMsOf = (
  props: Pick<Props, 'fallbackDelayMs'> = {},
): number =>
  props.fallbackDelayMs !== undefined &&
  Number.isFinite(props.fallbackDelayMs) &&
  props.fallbackDelayMs > 0
    ? props.fallbackDelayMs
    : defaultFallbackDelayMs

/**
 * Extracts uppercase initials from a person or entity `name`.
 * Single-word names return their first character; multi-word names return the
 * first and last word initials when `maxLength` is `2`, or up to `maxLength`
 * word initials otherwise.
 *
 * @example
 * ```typescript
 * initialsOf('Ada Lovelace') // 'AL'
 * initialsOf('Grace Murray Hopper') // 'GH'
 * initialsOf('Cher') // 'C'
 * initialsOf('   ') // ''
 * ```
 */
export const initialsOf = (
  name: string,
  maxLength: number = defaultMaxInitials,
): string => {
  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return ''
  }
  const words = Array.filter(name.trim().split(/\s+/u), word => word !== '')
  const firstCharOf = (word: string): string =>
    Option.getOrElse(
      Array.head(Array.fromIterable(word)),
      () => '',
    ).toUpperCase()

  return Array.match(words, {
    onEmpty: () => '',
    onNonEmpty: nonEmptyWords => {
      if (nonEmptyWords.length === 1 || maxLength === 1) {
        return firstCharOf(Array.headNonEmpty(nonEmptyWords))
      } else if (maxLength === defaultMaxInitials) {
        return (
          firstCharOf(Array.headNonEmpty(nonEmptyWords)) +
          firstCharOf(Array.lastNonEmpty(nonEmptyWords))
        )
      } else {
        return Array.join(
          Array.map(
            Array.take(nonEmptyWords, Math.floor(maxLength)),
            firstCharOf,
          ),
          '',
        )
      }
    },
  })
}

/** Current active image source as `Option.Option<string>`, falling back to `props.src` when unset in state. */
export const srcOf = (
  state: State,
  props?: Pick<Props, 'src'>,
): Option.Option<string> => {
  const fromState = M.value(state).pipe(
    M.withReturnType<Option.Option<string>>(),
    M.tagsExhaustive({
      Idle: ({ maybeSrc }) => maybeSrc,
      Loading: ({ src }) => Option.some(src),
      Loaded: ({ src }) => Option.some(src),
      Error: ({ maybeSrc }) => maybeSrc,
    }),
  )
  return Option.orElse(fromState, () =>
    Option.filter(
      props?.src ?? Option.none(),
      candidate => candidate.trim() !== '',
    ),
  )
}

/** Resolved display name (prefers `state.name` when non-empty, falling back to `props.name`). */
export const nameOf = (state: State, props?: Pick<Props, 'name'>): string =>
  state.name !== '' ? state.name : (props?.name ?? '')

/** True when the Avatar is in `Idle`. */
export const isIdle = (state: State): boolean => state._tag === 'Idle'

/** True when the Avatar image is currently `Loading`. */
export const isLoading = (state: State): boolean => state._tag === 'Loading'

/** True when the Avatar image is `Loaded`. */
export const isLoaded = (state: State): boolean => state._tag === 'Loaded'

/** True when the Avatar image failed to load (`Error`). */
export const isError = (state: State): boolean => state._tag === 'Error'

/** Deterministic visibility check for the image slot (`true` only when `Loaded`). */
export const showImage = (state: State): boolean => state._tag === 'Loaded'

/**
 * Deterministic visibility check for the fallback slot: `true` in `Idle` and
 * `Error`, `false` in `Loaded`, and `state.isFallbackReady` while `Loading`
 * (honoring `fallbackDelayMs`).
 */
export const showFallback = (state: State): boolean =>
  M.value(state).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      Idle: () => true,
      Loading: ({ isFallbackReady }) => isFallbackReady,
      Loaded: () => false,
      Error: () => true,
    }),
  )

/** Standard `data-state` marker for the image element (`'visible'` or `'hidden'`). */
export const imageVisibilityOf = (state: State): VisibilityState =>
  showImage(state) ? 'visible' : 'hidden'

/** Standard `data-state` marker for the fallback element (`'visible'` or `'hidden'`). */
export const fallbackVisibilityOf = (state: State): VisibilityState =>
  showFallback(state) ? 'visible' : 'hidden'

// INTERNAL TRANSITION HELPERS

const nextVersion = (version: number): number => version + 1

const enterLoading = (
  src: string,
  name: string,
  version: number,
  props: Props,
): Readonly<{
  model: Loading
  commands: ReadonlyArray<Command.Command<Message>>
}> => {
  const delayMs = fallbackDelayMsOf(props)
  const isFallbackReady = delayMs <= 0
  return {
    model: Loading({
      src,
      name,
      isFallbackReady,
      version,
    }),
    commands: isFallbackReady
      ? []
      : [WaitForAvatarFallbackDelay({ version, afterMs: delayMs })],
  }
}

const resolvedStartSrc = (
  state: State,
  messageSrc: string | undefined,
  props: Props,
): Option.Option<string> => {
  if (messageSrc !== undefined) {
    const trimmed = messageSrc.trim()
    return trimmed === '' ? Option.none() : Option.some(trimmed)
  } else {
    return srcOf(state, props)
  }
}

// CHART

/**
 * The Avatar Machine chart: source assignment, image loading with optional
 * `fallbackDelayMs` Command, load completion, error fallback (including
 * recovery on late load), and reset to `Idle`.
 */
export const chart = define({ state: State, message: Message, context: Props })(
  {
    initial,
    states: {
      Idle: {
        on: {
          LoadedAvatarImage: [ignore()],
          FailedAvatarImage: [ignore()],
          ElapsedAvatarFallbackDelay: [ignore()],
        },
      },
      Loading: {
        on: {
          LoadedAvatarImage: to('Loaded', ({ state }) =>
            Loaded({
              src: state.src,
              name: state.name,
              version: nextVersion(state.version),
            }),
          ),
          FailedAvatarImage: to('Error', ({ state }) =>
            Error({
              maybeSrc: Option.some(state.src),
              name: state.name,
              version: nextVersion(state.version),
            }),
          ),
          ElapsedAvatarFallbackDelay: [
            when(
              (state, message) =>
                state.version === message.version && !state.isFallbackReady,
              'Loading',
              ({ state }) =>
                Loading({
                  ...state,
                  isFallbackReady: true,
                }),
            ),
            ignore(),
          ],
        },
      },
      Loaded: {
        on: {
          LoadedAvatarImage: [ignore()],
          FailedAvatarImage: to('Error', ({ state }) =>
            Error({
              maybeSrc: Option.some(state.src),
              name: state.name,
              version: nextVersion(state.version),
            }),
          ),
          ElapsedAvatarFallbackDelay: [ignore()],
        },
      },
      Error: {
        on: {
          LoadedAvatarImage: [
            when(
              (state, _message, context) => srcOf(state, context),
              'Loaded',
              ({ state, guardValue }) =>
                Loaded({
                  src: guardValue,
                  name: state.name,
                  version: nextVersion(state.version),
                }),
            ),
            ignore(),
          ],
          FailedAvatarImage: [ignore()],
          ElapsedAvatarFallbackDelay: [ignore()],
        },
      },
    },
    shared: [
      forStates(['Idle', 'Loading', 'Loaded', 'Error']).on({
        SetAvatarSource: [
          when(
            (_state, message) => message.src.trim() === '',
            'Idle',
            ({ state, context }) =>
              Idle({
                maybeSrc: Option.none(),
                name: nameOf(state, context),
                version: nextVersion(state.version),
              }),
          ),
          when(
            () => true,
            'Loading',
            ({ state, message, context }) =>
              enterLoading(
                message.src.trim(),
                nameOf(state, context),
                nextVersion(state.version),
                context,
              ),
          ),
        ],
        StartedLoadingAvatar: [
          when(
            (state, message, context) =>
              resolvedStartSrc(state, message.src, context),
            'Loading',
            ({ state, message, guardValue, context }) =>
              enterLoading(
                guardValue,
                message.name ?? nameOf(state, context),
                nextVersion(state.version),
                context,
              ),
          ),
          when(
            () => true,
            'Idle',
            ({ state, message, context }) =>
              Idle({
                maybeSrc: Option.none(),
                name: message.name ?? nameOf(state, context),
                version: nextVersion(state.version),
              }),
          ),
        ],
        ResetAvatar: to('Idle', ({ state, context }) =>
          Idle({
            maybeSrc: Option.none(),
            name: context.name ?? '',
            version: nextVersion(state.version),
          }),
        ),
      }),
    ],
  },
)

// SYNC

/** Default Avatar synchronization: all Messages synced immediately. */
export const synced: Readonly<Record<Message['_tag'], Sync>> = {
  SetAvatarSource: Synced(),
  StartedLoadingAvatar: Synced(),
  LoadedAvatarImage: Synced(),
  FailedAvatarImage: Synced(),
  ElapsedAvatarFallbackDelay: Synced(),
  ResetAvatar: Synced(),
}

/** Device-only synchronization table for an Avatar kept local to one device. */
export const deviceSync = (
  because: DeviceReason = 'OwnView',
): Readonly<Record<Message['_tag'], Sync>> => ({
  SetAvatarSource: Device({ because }),
  StartedLoadingAvatar: Device({ because }),
  LoadedAvatarImage: Device({ because }),
  FailedAvatarImage: Device({ because }),
  ElapsedAvatarFallbackDelay: Device({ because }),
  ResetAvatar: Device({ because }),
})

// SLOTS & PROJECTION

/** The three painted slots of an Avatar Part: `Root`, `Image`, and `Fallback`. */
export const slots: Readonly<Record<string, Part.SlotDeclaration>> = {
  Root: {
    role: 'Group',
    focus: 'None',
    gestures: [],
  },
  Image: {
    focus: 'None',
    gestures: [],
  },
  Fallback: {
    focus: 'None',
    gestures: [],
  },
}

const labelOf = (state: State, props: Props): string => {
  if (props.alt !== undefined && props.alt !== '') {
    return props.alt
  } else {
    const displayName = nameOf(state, props)
    return displayName !== '' ? displayName : 'Avatar'
  }
}

const projectSlot = (
  state: State,
  props: Props,
  slot: string,
  _maybeChoice: Option.Option<string>,
): SlotProps => {
  const label = labelOf(state, props)
  if (slot === 'Root') {
    return {
      id: rootId(props.id),
      label,
    }
  } else if (slot === 'Image') {
    return {
      id: imageId(props.id),
      label,
      ...(showImage(state) ? {} : { isHidden: true }),
    }
  } else if (slot === 'Fallback') {
    return {
      id: fallbackId(props.id),
      label,
      ...(showFallback(state) ? {} : { isHidden: true }),
    }
  } else {
    return {}
  }
}

/** What a restart opens an Avatar on: an in-flight `Loading` settles back to `Idle` preserving its source. */
export const atRest = (state: State): State =>
  state._tag === 'Loading'
    ? Idle({
        maybeSrc: Option.some(state.src),
        name: state.name,
        version: nextVersion(state.version),
      })
    : state

// PART FACTORY

/** Options for customizing an Avatar Part instance. */
export type MakeOptions = Readonly<{
  name?: string
  category?: MessageCategory
  /** Defaults to `'Synced'`. Pass a {@link DeviceReason} (for example `'OwnView'`) to keep this Avatar device-only. */
  sync?: 'Synced' | DeviceReason
  configuration?: Part.Configuration<Part.PartSettings>
}>

/**
 * Creates an Avatar {@link Part.Part}. Synced by default (`category: 'Domain'`,
 * `Pace.Synced`); pass `sync: 'OwnView'` (or use {@link deviceOnly}) to keep
 * an Avatar local to one device.
 */
export const make = (
  options: MakeOptions = {},
): Part.Part<State, Message, Props> =>
  Part.define<State, Message, Props>({
    name: options.name ?? 'Avatar',
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
 * Shorthand for an Avatar Part whose state stays on the device and is omitted
 * from the synced log and encoded Model.
 */
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

/** The default synced Avatar Part (`name: 'Avatar'`, `category: 'Domain'`). */
export const part: Part.Part<State, Message, Props> = make()
