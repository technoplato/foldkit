import {
  Array,
  Cause,
  Context,
  Duration,
  Effect,
  Exit,
  Fiber,
  Function,
  Layer,
  Match,
  Option,
  Predicate,
  Record,
  Scheduler,
  Schema,
  Scope,
  SubscriptionRef,
  pipe,
} from 'effect'

import { BrowserRuntime } from '@effect/platform-browser'

import { createProgramDevToolsStore } from '../devTools/programStore.js'
import { type DevToolsStore, type MountRecord } from '../devTools/store.js'
import { startWebSocketBridge } from '../devTools/webSocketBridge.js'
import {
  Document,
  Html,
  __beginRender as beginHtmlRender,
  __beginReplayRender as beginReplayHtmlRender,
  __clearRuntime as clearHtmlRuntime,
  __createBoundaryRegistry as createHtmlBoundaryRegistry,
  __endReplayRender as endReplayHtmlRender,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import type { ManagedResources } from '../managedResource/index.js'
import { MountTracker } from '../mount/index.js'
import { UrlRequest } from '../navigation/urlRequest.js'
import {
  type PortHandleBinding,
  type PortHandles,
  type Ports,
  makePortHandleBridge,
} from '../port/index.js'
import {
  type Program,
  type ProgramCommand,
  make as makeProgram,
} from '../program/program.js'
import type { Subscriptions } from '../subscription/subscription.js'
import { Url, fromString as urlFromString } from '../url/index.js'
import { VNode, __patchVNode } from '../vdom.js'
import {
  addBfcacheRestoreListener,
  addNavigationEventListeners,
} from './browserListeners.js'
import { defaultCrashView, noOpDispatch } from './crashUI.js'
import { deepFreeze } from './deepFreeze.js'
import {
  PreserveModelMessage,
  RequestModelMessage,
  RestoreModelMessage,
} from './hmrProtocol.js'
import {
  preserveScrollPosition,
  restorePreservedScrollPosition,
} from './hmrScroll.js'
import { makePreserveScheduler } from './preserveScheduler.js'
import type { TransitionSource } from './programJournal.js'
import {
  type ProgramRuntimeJournalConfig,
  type ProgramRuntimeScheduling,
  type ProgramStart,
  fromModel,
  makeProgramRuntime,
} from './programRuntime.js'

export type {
  InboundPortHandle,
  InboundPortHandles,
  OutboundPortHandle,
  OutboundPortHandles,
  PortHandles,
} from '../port/runtime.js'

/** Position of the DevTools badge and panel on screen. */
export type DevToolsPosition =
  | 'BottomRight'
  | 'BottomLeft'
  | 'TopRight'
  | 'TopLeft'

/** Controls when a feature is shown. */
export type Visibility = 'Development' | 'Always'

/** Controls DevTools interaction mode.
 *
 * - `'Inspect'`: Messages stream in and clicking a row shows its state snapshot without pausing the app.
 * - `'TimeTravel'`: Clicking a row pauses the app at that historical state. Resume to continue.
 */
export type DevToolsMode = 'Inspect' | 'TimeTravel'

/** Mode value for the DevTools panel. Either a single mode used in every
 *  environment, or an object selecting different modes for development and
 *  production. Use the object form to keep `'TimeTravel'` for local debugging
 *  while shipping the safer `'Inspect'` mode to users. `'TimeTravel'` in
 *  production pauses the user's app when a history row is clicked. */
export type DevToolsModeConfig =
  | DevToolsMode
  | Readonly<{ development: DevToolsMode; production: DevToolsMode }>

/**
 * Factory that mounts the in-browser DevTools overlay against a recording
 * store. The runtime keeps the store and the WebSocket bridge (so external
 * tooling like the DevTools MCP server works without an overlay); the visual
 * overlay is injected so it can live in `@foldkit/devtools` and pull in
 * `@foldkit/ui` without coupling the core runtime to either.
 *
 * Pass `overlay` from `@foldkit/devtools` as `DevToolsConfig.overlay`.
 */
export type DevToolsOverlay = (
  store: DevToolsStore,
  position: DevToolsPosition,
  mode: DevToolsMode,
  maybeBanner: Option.Option<string>,
) => Effect.Effect<void, never, Scope.Scope>

/**
 * DevTools configuration.
 *
 * Pass `false` to disable DevTools entirely.
 *
 * - `show`: `'Development'` (default) enables in dev mode only, `'Always'` enables in all environments including production.
 * - `position`: Where the badge and panel appear. Defaults to `'BottomRight'`.
 * - `mode`: `'TimeTravel'` (default) enables full time-travel debugging. `'Inspect'` allows browsing state snapshots without pausing the app. Pass `{ development, production }` to use different modes per environment. Useful when DevTools is shown in production (`show: 'Always'`) and you want `'TimeTravel'` only in local development.
 * - `banner`: Optional text shown as a banner at the top of the panel.
 * - `overlay`: The in-browser overlay factory from `@foldkit/devtools`. Without it, DevTools still records history and serves the WebSocket bridge (so the DevTools MCP server works), but no visual overlay is mounted. Pass `DevTools.overlay` to show the panel.
 * - `excludeFromHistory`: Message `_tag` values hidden from the DevTools presentation. The authoritative Program journal and exported replay tape still include them. Use this for high-frequency Messages that would flood the panel without adding useful inspection points.
 * - `maxEntries`: Maximum number of Program transitions presented in DevTools before the oldest visible row is evicted. Defaults to 100 and is clamped to 20-500. This bounds the overlay and transport window without creating a second reconstruction journal.
 */
export type DevToolsConfig =
  | false
  | Readonly<{
      show?: Visibility
      position?: DevToolsPosition
      mode?: DevToolsModeConfig
      banner?: string
      overlay?: DevToolsOverlay
      excludeFromHistory?: ReadonlyArray<string>
      maxEntries?: number
      /**
       * The application's `Message` Schema. When provided and the running app
       * is connected to the Foldkit DevTools MCP server, AI agents can dispatch
       * Messages into the runtime. The Schema decodes inbound dispatch payloads
       * at the bridge boundary and returns a clean error on mismatch.
       *
       * Without this field, `RequestDispatchMessage` is rejected with an
       * informative error.
       */
      Message?: Schema.Codec<any, any, unknown, unknown>
    }>

const DEFAULT_DEV_TOOLS_SHOW: Visibility = 'Development'
const DEFAULT_DEV_TOOLS_POSITION: DevToolsPosition = 'BottomRight'
const DEFAULT_DEV_TOOLS_MODE: DevToolsMode = 'TimeTravel'

const resolveDevToolsMode = (config: DevToolsModeConfig): DevToolsMode => {
  if (typeof config === 'string') {
    return config
  } else {
    return import.meta.hot ? config.development : config.production
  }
}
const DEV_TOOLS_MAX_ENTRIES_MIN = 20
const DEV_TOOLS_MAX_ENTRIES_MAX = 500

/** Context provided when view construction exceeds its configured time budget. */
export type SlowViewContext<Model, Message> = Readonly<{
  _tag: 'View'
  model: Model
  message: Option.Option<Message>
  durationMs: number
  thresholdMs: number
}>

/** Context provided when update exceeds its configured time budget. */
export type SlowUpdateContext<Model, Message> = Readonly<{
  _tag: 'Update'
  previousModel: Model
  nextModel: Model
  message: Message
  durationMs: number
  thresholdMs: number
}>

/** Context provided when DOM patching exceeds its configured time budget. */
export type SlowPatchContext<Model, Message> = Readonly<{
  _tag: 'Patch'
  model: Model
  message: Option.Option<Message>
  durationMs: number
  thresholdMs: number
}>

/** Context provided when subscription dependency extraction exceeds its configured time budget. */
export type SlowSubscriptionDependenciesContext<Model> = Readonly<{
  _tag: 'SubscriptionDependencies'
  subscriptionKey: string
  model: Model
  durationMs: number
  thresholdMs: number
}>

/** Tagged union of every slow-phase context passed to `slow.onSlow`. */
export type SlowContext<Model, Message> =
  | SlowViewContext<Model, Message>
  | SlowUpdateContext<Model, Message>
  | SlowPatchContext<Model, Message>
  | SlowSubscriptionDependenciesContext<Model>

/** Phase names measured by the slow warning runtime option. */
export const SlowPhase = Schema.Literals([
  'Update',
  'View',
  'Patch',
  'SubscriptionDependencies',
])
export type SlowPhase = typeof SlowPhase.Type

/** Budget overrides for slow warning phases. Omitted fields use Foldkit defaults. */
export type SlowThresholdOverrides = Readonly<{
  Update?: number
  View?: number
  Patch?: number
  SubscriptionDependencies?: number
}>

type ResolvedSlowPhaseConfig<Context> = Readonly<{
  thresholdMs: number
  onSlow: (context: Context) => void
}>

type ResolvedSlowConfig<Model, Message> = Readonly<{
  view: Option.Option<ResolvedSlowPhaseConfig<SlowViewContext<Model, Message>>>
  update: Option.Option<
    ResolvedSlowPhaseConfig<SlowUpdateContext<Model, Message>>
  >
  patch: Option.Option<
    ResolvedSlowPhaseConfig<SlowPatchContext<Model, Message>>
  >
  subscriptionDependencies: Option.Option<
    ResolvedSlowPhaseConfig<SlowSubscriptionDependenciesContext<Model>>
  >
}>

/**
 * Slow-phase warning configuration.
 *
 * By default, all phases are enabled in development with Foldkit's default
 * thresholds. Pass `false` to disable warnings entirely. Pass an object to
 * refine those defaults.
 *
 * - `show`: `'Development'` (default) enables warnings only when Vite HMR is active. `'Always'` enables them in every environment.
 * - `measuredPhases`: Phases to measure. Defaults to every slow warning phase.
 * - `thresholdOverrides`: Per-phase budget overrides. Omitted fields keep defaults; overrides for unmeasured phases are ignored.
 * - `onSlow`: Callback for every measured phase that exceeds its budget. Replaces Foldkit's default `console.warn`; Foldkit will not also warn for tags your callback ignores.
 */
export type SlowConfig<Model, Message> =
  | false
  | Readonly<{
      show?: Visibility
      measuredPhases?: ReadonlyArray<SlowPhase>
      thresholdOverrides?: SlowThresholdOverrides
      onSlow?: (context: SlowContext<Model, Message>) => void
    }>

const DEFAULT_SLOW_SHOW: Visibility = 'Development'
const DEFAULT_SLOW_VIEW_THRESHOLD_MS = 16
const DEFAULT_SLOW_UPDATE_THRESHOLD_MS = 4
const DEFAULT_SLOW_PATCH_THRESHOLD_MS = 8
const DEFAULT_SLOW_SUBSCRIPTION_DEPENDENCIES_THRESHOLD_MS = 2

const ALL_SLOW_PHASES: ReadonlyArray<SlowPhase> = [
  'Update',
  'View',
  'Patch',
  'SubscriptionDependencies',
]

const resolveSlowPhase = <Context>(
  isMeasured: boolean,
  thresholdMs: number,
  onSlow: (context: Context) => void,
): Option.Option<ResolvedSlowPhaseConfig<Context>> =>
  Option.liftPredicate(
    {
      thresholdMs,
      onSlow,
    },
    () => isMeasured,
  )

export const __resolveSlowConfig = <Model, Message>(
  slow: SlowConfig<Model, Message> | undefined,
  isSlowVisible: (show: Visibility) => boolean,
): Option.Option<ResolvedSlowConfig<Model, Message>> => {
  const maybeSlowConfig = Match.value(slow).pipe(
    Match.withReturnType<
      Option.Option<Exclude<SlowConfig<Model, Message>, false>>
    >(),
    Match.when(false, () => Option.none()),
    Match.when(Predicate.isUndefined, () =>
      Option.some<Exclude<SlowConfig<Model, Message>, false>>({}),
    ),
    Match.orElse(config => Option.some(config)),
  )

  return pipe(
    maybeSlowConfig,
    Option.filter(config => isSlowVisible(config.show ?? DEFAULT_SLOW_SHOW)),
    Option.map(config => {
      const onSlow = config.onSlow ?? defaultSlowCallback
      const measuredPhases = config.measuredPhases ?? ALL_SLOW_PHASES
      const isPhaseMeasured = (phase: SlowPhase): boolean =>
        Array.contains(measuredPhases, phase)

      return {
        view: resolveSlowPhase(
          isPhaseMeasured('View'),
          config.thresholdOverrides?.View ?? DEFAULT_SLOW_VIEW_THRESHOLD_MS,
          onSlow,
        ),
        update: resolveSlowPhase(
          isPhaseMeasured('Update'),
          config.thresholdOverrides?.Update ?? DEFAULT_SLOW_UPDATE_THRESHOLD_MS,
          onSlow,
        ),
        patch: resolveSlowPhase(
          isPhaseMeasured('Patch'),
          config.thresholdOverrides?.Patch ?? DEFAULT_SLOW_PATCH_THRESHOLD_MS,
          onSlow,
        ),
        subscriptionDependencies: resolveSlowPhase(
          isPhaseMeasured('SubscriptionDependencies'),
          config.thresholdOverrides?.SubscriptionDependencies ??
            DEFAULT_SLOW_SUBSCRIPTION_DEPENDENCIES_THRESHOLD_MS,
          onSlow,
        ),
      }
    }),
  )
}

const measureSlowPhase = <Context, Result>(
  maybeConfig: Option.Option<ResolvedSlowPhaseConfig<Context>>,
  run: () => Result,
): readonly [Result, Option.Option<number>] => {
  if (Option.isSome(maybeConfig)) {
    const start = performance.now()
    const result = run()

    return [result, Option.some(performance.now() - start)]
  } else {
    return [run(), Option.none()]
  }
}

const reportSlowPhase = <Context>(
  maybeConfig: Option.Option<ResolvedSlowPhaseConfig<Context>>,
  maybeDurationMs: Option.Option<number>,
  makeContext: (durationMs: number, thresholdMs: number) => Context,
): void => {
  if (Option.isSome(maybeConfig)) {
    const { thresholdMs, onSlow } = maybeConfig.value
    const maybeExceededDuration = Option.filter(
      maybeDurationMs,
      durationMs => durationMs > thresholdMs,
    )

    if (Option.isSome(maybeExceededDuration)) {
      onSlow(makeContext(maybeExceededDuration.value, thresholdMs))
    }
  }
}

const messageTag = (rawMessage: unknown): string =>
  pipe(
    rawMessage,
    Option.liftPredicate(Predicate.isObject),
    Option.flatMap(Record.get('_tag')),
    Option.match({
      onNone: () => 'unknown',
      onSome: String,
    }),
  )

const optionMessageTrigger = (maybeMessage: Option.Option<unknown>): string =>
  Option.match(maybeMessage, {
    onNone: () => 'init',
    onSome: messageTag,
  })

const TUNING_HINT =
  'Set slow.thresholdOverrides to change budgets or pass slow: false to disable warnings.'

export const defaultSlowCallback = (
  context: SlowContext<unknown, unknown>,
): void => {
  const { durationMs, thresholdMs: budget } = context
  const duration = durationMs.toFixed(1)

  const summary = Match.value(context).pipe(
    Match.tagsExhaustive({
      View: ({ message }) =>
        `Slow view: ${duration}ms (budget: ${budget}ms), triggered by ${optionMessageTrigger(message)}. Keep render-only work in the view path and memoize expensive subtrees with createLazy or createKeyedLazy.`,
      Update: ({ message }) =>
        `Slow update: ${duration}ms (budget: ${budget}ms), triggered by ${messageTag(message)}. Inspect the triggering Message branch; move render-only derivations to memoized views and keep update focused on state transitions.`,
      Patch: ({ message }) =>
        `Slow patch: ${duration}ms (budget: ${budget}ms), triggered by ${optionMessageTrigger(message)}. Key mapped lists by stable ids, split large views, or memoize stable subtrees with createLazy.`,
      SubscriptionDependencies: ({ subscriptionKey }) =>
        `Slow subscription dependencies: ${duration}ms (budget: ${budget}ms) for subscription "${subscriptionKey}". Keep modelToDependencies a cheap projection from modeled fields; avoid scans, sorting, serialization, and large dependency objects.`,
    }),
  )

  const maybeRawMessage: Option.Option<unknown> = Match.value(context).pipe(
    Match.withReturnType<Option.Option<unknown>>(),
    Match.tagsExhaustive({
      Update: ({ message }) => Option.some<unknown>(message),
      View: ({ message }) => message,
      Patch: ({ message }) => message,
      SubscriptionDependencies: () => Option.none(),
    }),
  )

  console.warn(
    `[foldkit] ${summary} ${TUNING_HINT}`,
    context,
    ...Option.toArray(maybeRawMessage),
  )
}

/** Dev-only scan for duplicate DOM ids within the Foldkit-rendered root.
 *
 *  Duplicate ids are invalid HTML but browsers do not report them, so
 *  `getElementById` / `querySelector` silently resolve to the first match and
 *  focus or ARIA labelling can target the wrong element with no error. The
 *  scan is scoped to `root` (not the whole document) so unrelated page ids do
 *  not trigger it, warns rather than throws, and dedupes through `warnedIds`
 *  so the same collision is reported at most once instead of every render. */
const warnDuplicateIds = (
  root: Node | undefined,
  warnedIds: Set<string>,
): void => {
  if (!(root instanceof Element)) {
    return
  }

  const seenIds = new Set<string>()
  const duplicateIds = new Set<string>()

  const elementsWithId = Array.fromIterable(root.querySelectorAll('[id]'))
  if (root.id !== '') {
    elementsWithId.unshift(root)
  }

  for (const element of elementsWithId) {
    const { id } = element
    if (seenIds.has(id)) {
      duplicateIds.add(id)
    } else {
      seenIds.add(id)
    }
  }

  for (const id of duplicateIds) {
    if (!warnedIds.has(id)) {
      warnedIds.add(id)
      console.warn(
        `[foldkit] Duplicate DOM id "${id}" in the rendered tree. Ids must be ` +
          'unique within the document; otherwise focus and ARIA labelling can ' +
          'silently target the wrong element. Give each element a unique id.',
      )
    }
  }
}

const DUPLICATE_ID_SCAN_INTERVAL_MS = 1000

type DuplicateIdScanner = Readonly<{
  schedule: (root: Node | undefined) => void
  cancel: () => void
}>

/** Coalesces `warnDuplicateIds` scans so rapid successive renders trigger at
 *  most one full-tree scan per `DUPLICATE_ID_SCAN_INTERVAL_MS`, bounding the
 *  cost under high-frequency dev rendering such as animationFrame subscriptions
 *  or per-keystroke input. A real duplicate id persists across renders, so
 *  scanning the latest tree on a trailing timer never misses a genuine
 *  collision, and the retained `warnedIds` keeps each id to a single warning.
 *  Dev-only: the runtime both creates the scanner and calls `schedule` behind
 *  `import.meta.hot`, so the scanner and its DOM scan tree-shake out of
 *  production builds. */
const createDuplicateIdScanner = (): DuplicateIdScanner => {
  const warnedIds = new Set<string>()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let latestRoot: Node | undefined

  const schedule = (root: Node | undefined): void => {
    latestRoot = root
    if (timeoutHandle !== undefined) {
      return
    }
    timeoutHandle = setTimeout(() => {
      timeoutHandle = undefined
      warnDuplicateIds(latestRoot, warnedIds)
    }, DUPLICATE_ID_SCAN_INTERVAL_MS)
  }

  const cancel = (): void => {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle)
      timeoutHandle = undefined
    }
    latestRoot = undefined
  }

  return { schedule, cancel }
}

/** Effect service tag that provides message dispatching to the view layer. */
export class Dispatch extends Context.Service<
  Dispatch,
  {
    readonly dispatchAsync: (message: unknown) => Effect.Effect<void>
    readonly dispatchSync: (message: unknown, source?: TransitionSource) => void
  }
>()('@foldkit/Dispatch') {}

export type { Command } from '../command/index.js'

/** Configuration for URL routing with handlers for URL requests and URL changes. */
export type RoutingConfig<Message> = Readonly<{
  onUrlRequest: (request: UrlRequest) => Message
  onUrlChange: (url: Url) => Message
}>

/** Context provided to crash.view and crash.report when the runtime encounters
 *  an unrecoverable error. `message` is the Message being processed when the
 *  crash occurred, present as an `Option` because a crash during the initial
 *  render has no triggering Message. */
export type CrashContext<Model, Message> = Readonly<{
  error: Error
  model: Model
  message: Option.Option<Message>
}>

/** Configuration for crash handling, with custom crash UI and/or crash reporting. */
export type CrashConfig<Model, Message> = Readonly<{
  view?: (context: CrashContext<Model, Message>) => Document
  report?: (context: CrashContext<Model, Message>) => void
}>

/** Full runtime configuration including model schema, flags, init, update, view, and optional routing/stream config. */
type BaseApplicationConfig<
  Model,
  Message,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = Readonly<{
  Model: Schema.Codec<Model, unknown, never, never>
  Message: Schema.Codec<Message, unknown, never, never>
  update: (
    model: Model,
    message: Message,
  ) => readonly [
    Model,
    ReadonlyArray<ProgramCommand<Message, Resources | ManagedResourceServices>>,
  ]
  view: (model: Model) => Document
  subscriptions?: Subscriptions<
    Model,
    Message,
    Resources | ManagedResourceServices
  >
  container: HTMLElement | null
  ports?: P
  crash?: CrashConfig<Model, Message>
  slow?: SlowConfig<Model, Message>
  freezeModel?: boolean
  preserveScroll?: boolean
  resources?: Layer.Layer<Resources>
  managedResources?: ManagedResources<Model, Message, ManagedResourceServices>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
  devTools?: DevToolsConfig
}>

/** Configuration for `makeApplication` with flags and URL routing. */
export type RoutingApplicationConfigWithFlags<
  Model,
  Message,
  Flags,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = BaseApplicationConfig<
  Model,
  Message,
  Resources,
  ManagedResourceServices,
  P
> &
  Readonly<{
    Flags: Schema.Codec<Flags, any, unknown, unknown>
    flags: Effect.Effect<Flags>
    routing: RoutingConfig<Message>
    init: (
      flags: Flags,
      url: Url,
    ) => readonly [
      Model,
      ReadonlyArray<
        ProgramCommand<Message, Resources | ManagedResourceServices>
      >,
    ]
  }>

/** Configuration for `makeApplication` with URL routing but no flags. */
export type RoutingApplicationConfig<
  Model,
  Message,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = BaseApplicationConfig<
  Model,
  Message,
  Resources,
  ManagedResourceServices,
  P
> &
  Readonly<{
    routing: RoutingConfig<Message>
    init: (
      url: Url,
    ) => readonly [
      Model,
      ReadonlyArray<
        ProgramCommand<Message, Resources | ManagedResourceServices>
      >,
    ]
  }>

/** Configuration for `makeApplication` with flags but no URL routing. */
export type ApplicationConfigWithFlags<
  Model,
  Message,
  Flags,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = BaseApplicationConfig<
  Model,
  Message,
  Resources,
  ManagedResourceServices,
  P
> &
  Readonly<{
    Flags: Schema.Codec<Flags, any, unknown, unknown>
    flags: Effect.Effect<Flags>
    init: (
      flags: Flags,
    ) => readonly [
      Model,
      ReadonlyArray<
        ProgramCommand<Message, Resources | ManagedResourceServices>
      >,
    ]
  }>

/** Configuration for `makeApplication` without flags or URL routing. */
export type ApplicationConfig<
  Model,
  Message,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = BaseApplicationConfig<
  Model,
  Message,
  Resources,
  ManagedResourceServices,
  P
> &
  Readonly<{
    init: () => readonly [
      Model,
      ReadonlyArray<
        ProgramCommand<Message, Resources | ManagedResourceServices>
      >,
    ]
  }>

/** Configuration for crash handling in a `makeElement` app. The crash view
 *  returns `Html`, not a `Document`, because a scoped app never owns the
 *  document `<head>`. */
export type ElementCrashConfig<Model, Message> = Readonly<{
  view?: (context: CrashContext<Model, Message>) => Html
  report?: (context: CrashContext<Model, Message>) => void
}>

type BaseElementConfig<
  Model,
  Message,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = Readonly<{
  Model: Schema.Codec<Model, unknown, never, never>
  Message: Schema.Codec<Message, unknown, never, never>
  update: (
    model: Model,
    message: Message,
  ) => readonly [
    Model,
    ReadonlyArray<ProgramCommand<Message, Resources | ManagedResourceServices>>,
  ]
  view: (model: Model) => Html
  subscriptions?: Subscriptions<
    Model,
    Message,
    Resources | ManagedResourceServices
  >
  container: HTMLElement | null
  ports?: P
  crash?: ElementCrashConfig<Model, Message>
  slow?: SlowConfig<Model, Message>
  freezeModel?: boolean
  resources?: Layer.Layer<Resources>
  managedResources?: ManagedResources<Model, Message, ManagedResourceServices>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
  devTools?: DevToolsConfig
}>

/** Configuration for `makeElement` with flags. */
export type ElementConfigWithFlags<
  Model,
  Message,
  Flags,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = BaseElementConfig<Model, Message, Resources, ManagedResourceServices, P> &
  Readonly<{
    Flags: Schema.Codec<Flags, any, unknown, unknown>
    flags: Effect.Effect<Flags>
    init: (
      flags: Flags,
    ) => readonly [
      Model,
      ReadonlyArray<
        ProgramCommand<Message, Resources | ManagedResourceServices>
      >,
    ]
  }>

/** Configuration for `makeElement` without flags. */
export type ElementConfig<
  Model,
  Message,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = BaseElementConfig<Model, Message, Resources, ManagedResourceServices, P> &
  Readonly<{
    init: () => readonly [
      Model,
      ReadonlyArray<
        ProgramCommand<Message, Resources | ManagedResourceServices>
      >,
    ]
  }>

/** The `init` function type for a `makeApplication` app without URL routing. */
export type ApplicationInit<
  Model,
  Message,
  Flags = void,
  Resources = never,
  ManagedResourceServices = never,
> = Flags extends void
  ? () => readonly [
      Model,
      ReadonlyArray<
        ProgramCommand<Message, Resources | ManagedResourceServices>
      >,
    ]
  : (
      flags: Flags,
    ) => readonly [
      Model,
      ReadonlyArray<
        ProgramCommand<Message, Resources | ManagedResourceServices>
      >,
    ]

/** The `init` function type for a `makeApplication` app with URL routing, receives the current URL and optional flags. */
export type RoutingApplicationInit<
  Model,
  Message,
  Flags = void,
  Resources = never,
  ManagedResourceServices = never,
> = Flags extends void
  ? (
      url: Url,
    ) => readonly [
      Model,
      ReadonlyArray<
        ProgramCommand<Message, Resources | ManagedResourceServices>
      >,
    ]
  : (
      flags: Flags,
      url: Url,
    ) => readonly [
      Model,
      ReadonlyArray<
        ProgramCommand<Message, Resources | ManagedResourceServices>
      >,
    ]

/** The `init` function type for a `makeElement` app. A scoped app never owns
 *  the URL, so its `init` has the same shape as a non-routing
 *  `ApplicationInit`: argless, or receiving flags when `Flags` is set. */
export type ElementInit<
  Model,
  Message,
  Flags = void,
  Resources = never,
  ManagedResourceServices = never,
> = ApplicationInit<Model, Message, Flags, Resources, ManagedResourceServices>

/** A configured Foldkit runtime returned by `makeApplication` or `makeElement`.
 *  Pass it to `run` to start a page-owning app, or to `embed` to start it under
 *  a host-controlled lifecycle handle. `ports` is the Ports record from the
 *  config (or `undefined` when the config declared none); it types the
 *  `EmbedHandle` that `embed` returns. */
export type MakeRuntimeReturn<P extends Ports | undefined = undefined> =
  Readonly<{
    runtimeId: string
    start: (hmrModel?: unknown) => Effect.Effect<void>
    ports: P
  }>

/**
 * The handle returned by `embed`. The host talks to the embedded app only
 * through it: `ports.<name>.send` pushes values in, `ports.<name>.subscribe`
 * listens to values the app emits, and `dispose` shuts the runtime down.
 *
 * `dispose` is idempotent. It interrupts the runtime and runs all cleanup:
 * Subscriptions, ManagedResources, Mounts, listeners, and in-flight Commands
 * stop, and the rendered DOM is removed with the container element restored
 * empty in its place, ready for a fresh `embed`.
 */
export type EmbedHandle<P extends Ports | undefined = undefined> = Readonly<{
  ports: PortHandles<P>
  dispose: () => void
}>

type ProgramRendererInternals = {
  startWith: (
    maybePortHandleBridge: Option.Option<PortHandleBinding>,
    hmrModel: unknown,
    isEmbedded: boolean,
  ) => Effect.Effect<void>
  isEmbedActive: boolean
  maybeActiveFiber: Option.Option<Fiber.Fiber<void>>
}

const programRendererInternals = new WeakMap<
  MakeRuntimeReturn<any>,
  ProgramRendererInternals
>()

/** Mutable holder for the vnode tree currently mounted in the container.
 *  The render frame writes it after every patch; the dispose finalizer, the
 *  replay render, and {@link renderCrashView} read it. A plain object rather
 *  than a Ref because every reader runs synchronously on the main thread. */
type VNodeSlot = {
  maybeCurrentVNode: Option.Option<VNode>
}

const currentLocationUrl = (): string => {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}`
}

type DocumentMetadataElements = {
  canonical?: HTMLLinkElement
  ogUrl?: HTMLMetaElement
}

const documentMetadataElements = new WeakMap<
  globalThis.Document,
  DocumentMetadataElements
>()

const metadataElementsForDocument = (): Readonly<{
  canonical: HTMLLinkElement
  ogUrl: HTMLMetaElement
}> => {
  let elements = documentMetadataElements.get(document)
  if (elements === undefined) {
    elements = {}
    documentMetadataElements.set(document, elements)
  }

  let canonical = elements.canonical
  if (canonical === undefined || canonical.parentNode !== document.head) {
    canonical =
      document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ??
      document.head.appendChild(document.createElement('link'))
    elements.canonical = canonical
  }

  let ogUrl = elements.ogUrl
  if (ogUrl === undefined || ogUrl.parentNode !== document.head) {
    ogUrl =
      document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]') ??
      document.head.appendChild(document.createElement('meta'))
    elements.ogUrl = ogUrl
  }

  return { canonical, ogUrl }
}

const applyDocumentMetadata = (
  nextDocument: Document,
  mountedRoot: Node | undefined,
): void => {
  if (!mountedRoot || !document.body.contains(mountedRoot)) {
    return
  }

  if (document.title !== nextDocument.title) {
    document.title = nextDocument.title
  }

  const canonical = nextDocument.canonical ?? currentLocationUrl()
  const ogUrl = nextDocument.ogUrl ?? canonical
  const metadataElements = metadataElementsForDocument()

  if (metadataElements.canonical.getAttribute('rel') !== 'canonical') {
    metadataElements.canonical.setAttribute('rel', 'canonical')
  }
  if (metadataElements.canonical.getAttribute('href') !== canonical) {
    metadataElements.canonical.setAttribute('href', canonical)
  }
  if (metadataElements.ogUrl.getAttribute('property') !== 'og:url') {
    metadataElements.ogUrl.setAttribute('property', 'og:url')
  }
  if (metadataElements.ogUrl.getAttribute('content') !== ogUrl) {
    metadataElements.ogUrl.setAttribute('content', ogUrl)
  }
}

const renderCrashView = <Model, Message>(
  context: CrashContext<Model, Message>,
  crash: CrashConfig<Model, Message> | undefined,
  container: HTMLElement,
  vnodeSlot: VNodeSlot,
  manageDocument: boolean,
): void => {
  console.error('[foldkit] Application crash:', context.error)

  if (crash?.report) {
    try {
      crash.report(context)
    } catch (reportError) {
      console.error('[foldkit] crash.report failed:', reportError)
    }
  }

  const crashContext = Context.make(Dispatch, noOpDispatch).pipe(
    Context.add(MountTracker, {
      started: () => {},
      ended: () => {},
    }),
  )

  try {
    setHtmlRuntime(noOpDispatch.dispatchSync, crashContext)
    let crashDocument: Document
    try {
      crashDocument = crash?.view
        ? crash.view(context)
        : defaultCrashView(context)
    } finally {
      clearHtmlRuntime()
    }

    const patchedVNode = __patchVNode(
      vnodeSlot.maybeCurrentVNode,
      crashDocument.body,
      container,
    )
    vnodeSlot.maybeCurrentVNode = Option.some(patchedVNode)
    if (manageDocument) {
      applyDocumentMetadata(crashDocument, patchedVNode.elm)
    }
  } catch (viewError) {
    console.error('[foldkit] crash.view failed:', viewError)

    const fallbackViewError =
      viewError instanceof Error ? viewError : new Error(String(viewError))

    setHtmlRuntime(noOpDispatch.dispatchSync, crashContext)
    let fallbackDocument: Document
    try {
      fallbackDocument = defaultCrashView(context, fallbackViewError)
    } finally {
      clearHtmlRuntime()
    }

    const patchedVNode = __patchVNode(
      vnodeSlot.maybeCurrentVNode,
      fallbackDocument.body,
      container,
    )
    vnodeSlot.maybeCurrentVNode = Option.some(patchedVNode)
    if (manageDocument) {
      applyDocumentMetadata(fallbackDocument, patchedVNode.elm)
    }
  }
}

/** Creates a Foldkit application that owns the page and returns a runtime that
 *  can be passed to `run`. The `view` returns a `Document`, so the runtime
 *  manages `document.title` and the canonical / og:url tags. Add a `routing`
 *  config for URL routing. To mount an app scoped to a node without touching the
 *  document `<head>`, use `makeElement`. */
export function makeApplication<
  Model,
  Message extends { _tag: string },
  Flags,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config: RoutingApplicationConfigWithFlags<
    Model,
    Message,
    Flags,
    Resources,
    ManagedResourceServices,
    P
  >,
): MakeRuntimeReturn<P>

export function makeApplication<
  Model,
  Message extends { _tag: string },
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config: RoutingApplicationConfig<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  >,
): MakeRuntimeReturn<P>

export function makeApplication<
  Model,
  Message extends { _tag: string },
  Flags,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config: ApplicationConfigWithFlags<
    Model,
    Message,
    Flags,
    Resources,
    ManagedResourceServices,
    P
  >,
): MakeRuntimeReturn<P>

export function makeApplication<
  Model,
  Message extends { _tag: string },
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config: ApplicationConfig<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  >,
): MakeRuntimeReturn<P>

export function makeApplication<
  Model,
  Message extends { _tag: string },
  Flags,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config:
    | RoutingApplicationConfigWithFlags<
        Model,
        Message,
        Flags,
        Resources,
        ManagedResourceServices,
        P
      >
    | RoutingApplicationConfig<
        Model,
        Message,
        Resources,
        ManagedResourceServices,
        P
      >
    | ApplicationConfigWithFlags<
        Model,
        Message,
        Flags,
        Resources,
        ManagedResourceServices,
        P
      >
    | ApplicationConfig<Model, Message, Resources, ManagedResourceServices, P>,
): MakeRuntimeReturn<P> {
  const { container } = config
  if (container === null) {
    throw new Error(
      '[foldkit] Container is null. Make sure the element exists in the DOM ' +
        'before calling makeApplication (e.g. that your <div id="root"></div> has ' +
        'rendered, and your script runs after it).',
    )
  }

  const hasRouting = 'routing' in config
  const hasFlags = 'Flags' in config
  const runtimeId = container.id
  const currentUrl = (): Url =>
    Option.getOrThrow(urlFromString(window.location.href))
  type ApplicationProgram = Program<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  >
  const buildProgram = (init: ApplicationProgram['init']): ApplicationProgram =>
    makeProgram({
      id: runtimeId,
      version: 1,
      Model: config.Model,
      Message: config.Message,
      init,
      update: config.update,
      ...(config.subscriptions === undefined
        ? {}
        : { subscriptions: config.subscriptions }),
      ...(config.managedResources === undefined
        ? {}
        : { managedResources: config.managedResources }),
      ...(config.ports === undefined ? {} : { ports: config.ports }),
    })

  /* eslint-disable @typescript-eslint/consistent-type-assertions */
  const programEffect: Effect.Effect<ApplicationProgram> = hasFlags
    ? Effect.map(config.flags, flags => {
        if (hasRouting) {
          const routingConfig = config as RoutingApplicationConfigWithFlags<
            Model,
            Message,
            Flags,
            Resources,
            ManagedResourceServices,
            P
          >
          return buildProgram(() => routingConfig.init(flags, currentUrl()))
        }
        const flagsConfig = config as ApplicationConfigWithFlags<
          Model,
          Message,
          Flags,
          Resources,
          ManagedResourceServices,
          P
        >
        return buildProgram(() => flagsConfig.init(flags))
      })
    : Effect.sync(() => {
        if (hasRouting) {
          const routingConfig = config as RoutingApplicationConfig<
            Model,
            Message,
            Resources,
            ManagedResourceServices,
            P
          >
          return buildProgram(() => routingConfig.init(currentUrl()))
        }
        const applicationConfig = config as ApplicationConfig<
          Model,
          Message,
          Resources,
          ManagedResourceServices,
          P
        >
        return buildProgram(applicationConfig.init)
      })
  /* eslint-enable @typescript-eslint/consistent-type-assertions */

  const startWith = (
    maybePortHandleBridge: Option.Option<PortHandleBinding>,
    hmrModel: unknown,
    isEmbedded: boolean,
  ): Effect.Effect<void> =>
    Effect.flatMap(programEffect, program => {
      const application = makeFoldkitApplication<
        Model,
        Message,
        Resources,
        ManagedResourceServices,
        P
      >({
        program,
        resources: resolveResources(config.resources),
        container,
        view: config.view,
        ...(hasRouting ? { routing: config.routing } : {}),
        ...(config.crash === undefined ? {} : { crash: config.crash }),
        ...(config.devTools === undefined ? {} : { devTools: config.devTools }),
        ...(config.journal === undefined ? {} : { journal: config.journal }),
        ...(config.slow === undefined ? {} : { slow: config.slow }),
        ...(config.freezeModel === undefined
          ? {}
          : { freezeModel: config.freezeModel }),
        ...(config.preserveScroll === undefined
          ? {}
          : { preserveScroll: config.preserveScroll }),
      })
      const maybeInternals = Option.fromNullishOr(
        programRendererInternals.get(application),
      )
      return Option.match(maybeInternals, {
        onNone: () =>
          Effect.die(
            new Error(
              '[foldkit] The Foldkit renderer did not register its runtime internals.',
            ),
          ),
        onSome: internals =>
          internals.startWith(maybePortHandleBridge, hmrModel, isEmbedded),
      })
    })

  const start = (hmrModel?: unknown): Effect.Effect<void> =>
    startWith(Option.none(), hmrModel, false)
  const application: MakeRuntimeReturn<P> = {
    runtimeId,
    start,
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    ports: config.ports as P,
  }
  programRendererInternals.set(application, {
    startWith,
    isEmbedActive: false,
    maybeActiveFiber: Option.none(),
  })
  return application
}

const instrumentProgram = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices,
  P extends Ports | undefined,
>(
  program: Program<Model, Message, Resources, ManagedResourceServices, P>,
  maybeFreezeModel: (model: Model) => Model,
  maybeSlowUpdate: Option.Option<
    ResolvedSlowPhaseConfig<SlowUpdateContext<Model, Message>>
  >,
  maybeSlowSubscriptionDependencies: Option.Option<
    ResolvedSlowPhaseConfig<SlowSubscriptionDependenciesContext<Model>>
  >,
): Program<Model, Message, Resources, ManagedResourceServices, P> => {
  const subscriptions =
    program.subscriptions === undefined
      ? undefined
      : Record.map(program.subscriptions, (subscription, subscriptionKey) => ({
          ...subscription,
          modelToDependencies: (model: Model) => {
            const [dependencies, maybeDuration] = measureSlowPhase(
              maybeSlowSubscriptionDependencies,
              () => subscription.modelToDependencies(model),
            )
            reportSlowPhase<SlowSubscriptionDependenciesContext<Model>>(
              maybeSlowSubscriptionDependencies,
              maybeDuration,
              (durationMs, thresholdMs) => ({
                _tag: 'SubscriptionDependencies',
                subscriptionKey,
                model,
                durationMs,
                thresholdMs,
              }),
            )
            return dependencies
          },
        }))

  return {
    ...program,
    init: () => {
      const [model, commands] = program.init()
      return [maybeFreezeModel(model), commands]
    },
    restore: model => {
      const [nextModel, commands] = program.restore?.(model) ?? [model, []]
      return [maybeFreezeModel(nextModel), commands]
    },
    update: (model, message) => {
      const [[nextModelRaw, commands], maybeDuration] = measureSlowPhase(
        maybeSlowUpdate,
        () => program.update(model, message),
      )
      const nextModel = maybeFreezeModel(nextModelRaw)
      reportSlowPhase<SlowUpdateContext<Model, Message>>(
        maybeSlowUpdate,
        maybeDuration,
        (durationMs, thresholdMs) => ({
          _tag: 'Update',
          previousModel: model,
          nextModel,
          message,
          durationMs,
          thresholdMs,
        }),
      )
      return [nextModel, commands]
    },
    ...(subscriptions === undefined ? {} : { subscriptions }),
  }
}

const browserProgramRuntimeScheduling: ProgramRuntimeScheduling = {
  now: () => performance.now(),
  defer: resume => {
    const channel = new MessageChannel()
    let isActive = true
    const close = (): void => {
      isActive = false
      channel.port1.close()
      channel.port2.close()
    }
    channel.port2.onmessage = () => {
      if (!isActive) {
        return
      }
      close()
      resume()
    }
    channel.port1.postMessage(null)
    return close
  },
}

/** Configuration for a Foldkit renderer attached to one shared Program. */
export type FoldkitApplicationConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
> = Readonly<{
  program: Program<Model, Message, Resources, ManagedResourceServices, P>
  resources: Layer.Layer<Resources>
  start?: ProgramStart<Model, Message>
  journal?: ProgramRuntimeJournalConfig<Model, Message>
  routing?: RoutingConfig<Message>
  view: (model: Model) => Document
  container: HTMLElement | null
  crash?: CrashConfig<Model, Message>
  devTools?: DevToolsConfig
  slow?: SlowConfig<Model, Message>
  freezeModel?: boolean
  preserveScroll?: boolean
  /** Receives the initial Model and each changed Model for host-level synchronization. */
  onModel?: (model: Model) => void
}>

type ProgramRendererConfig<
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources,
  ManagedResourceServices,
  P extends Ports | undefined,
> = FoldkitApplicationConfig<
  Model,
  Message,
  Resources,
  ManagedResourceServices,
  P
> &
  Readonly<{
    manageDocument: boolean
  }>

const resolveResources = <Resources>(
  resources: Layer.Layer<Resources> | undefined,
): Layer.Layer<Resources> =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  (resources ?? Layer.empty) as Layer.Layer<Resources>

/**
 * Creates a Foldkit-rendered client over the shared Program runtime.
 *
 * The Program runtime owns Message ordering, update, Commands, Subscriptions,
 * Resources, history, replay tapes, and portable URI parsing. This adapter
 * only observes Models and schedules Foldkit view commits.
 */
const makeProgramRenderer = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config: ProgramRendererConfig<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  >,
): MakeRuntimeReturn<P> => {
  const { container } = config
  if (container === null) {
    throw new Error(
      '[foldkit] Container is null. Make sure the element exists in the DOM ' +
        'before calling makeFoldkitApplication.',
    )
  }

  const runtimeId = container.id
  if (runtimeId === '') {
    throw new Error(
      '[foldkit] Runtime container must have an `id` for HMR model preservation.',
    )
  }

  const isSlowVisible = (show: Visibility): boolean =>
    Match.value(show).pipe(
      Match.when('Always', () => true),
      Match.when('Development', () => !!import.meta.hot),
      Match.exhaustive,
    )
  const resolvedSlow = __resolveSlowConfig(config.slow, isSlowVisible)
  const resolvedSlowView = Option.flatMap(resolvedSlow, ({ view }) => view)
  const resolvedSlowUpdate = Option.flatMap(
    resolvedSlow,
    ({ update }) => update,
  )
  const resolvedSlowPatch = Option.flatMap(resolvedSlow, ({ patch }) => patch)
  const resolvedSlowSubscriptionDependencies = Option.flatMap(
    resolvedSlow,
    ({ subscriptionDependencies }) => subscriptionDependencies,
  )
  const isFreezeModelActive = config.freezeModel !== false && !!import.meta.hot
  const isPreserveScrollActive =
    config.manageDocument &&
    config.preserveScroll !== false &&
    !!import.meta.hot
  const duplicateIdScanner = import.meta.hot
    ? createDuplicateIdScanner()
    : undefined
  const maybeFreezeModel = (model: Model): Model =>
    isFreezeModelActive ? deepFreeze(model) : model
  const program = instrumentProgram(
    config.program,
    maybeFreezeModel,
    resolvedSlowUpdate,
    resolvedSlowSubscriptionDependencies,
  )

  const startWith = (
    maybePortHandleBridge: Option.Option<PortHandleBinding>,
    hmrModel: unknown,
    isEmbedded: boolean,
  ): Effect.Effect<void> =>
    Effect.scoped(
      Effect.gen(function* () {
        const ModelJsonCodec = Schema.toCodecJson(program.Model)
        const decodedHmrModel = Predicate.isNotUndefined(hmrModel)
          ? Schema.decodeUnknownOption(ModelJsonCodec)(hmrModel)
          : Option.none<Model>()
        const activeProgram: Program<
          Model,
          Message,
          Resources,
          ManagedResourceServices,
          P
        > = Option.isSome(decodedHmrModel)
          ? {
              ...program,
              restore: model => [maybeFreezeModel(model), []],
            }
          : program
        const programStart = Option.match(decodedHmrModel, {
          onNone: () => config.start,
          onSome: fromModel,
        })
        const runtime = yield* makeProgramRuntime({
          program: activeProgram,
          resources: config.resources,
          scheduling: browserProgramRuntimeScheduling,
          ...(programStart === undefined ? {} : { start: programStart }),
          ...(config.journal === undefined ? {} : { journal: config.journal }),
        }).pipe(Effect.orDie)
        yield* Option.match(maybePortHandleBridge, {
          onNone: () => Effect.void,
          onSome: bridge =>
            Effect.acquireRelease(
              Effect.sync(() => bridge.bind(runtime.ports)),
              () => Effect.sync(bridge.unbind),
            ),
        })
        const decodeModel = Schema.decodeUnknownSync(
          Schema.toType(program.Model),
        )
        const decodeMessage = Schema.decodeUnknownSync(program.Message)
        const encodeHmrModel = Schema.encodeUnknownSync(ModelJsonCodec)
        const preserveScheduler = yield* makePreserveScheduler<Model>(
          {
            onDebounce: model =>
              Effect.sync(() =>
                preserveModel(runtimeId, encodeHmrModel(model), false),
              ),
            onFlush: model =>
              Effect.sync(() =>
                preserveModel(runtimeId, encodeHmrModel(model), true),
              ),
          },
          Duration.millis(200),
        )
        const hot = import.meta.hot
        if (hot) {
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const handler = (): void => {
                Effect.runSync(preserveScheduler.flush)
              }
              hot.on('vite:beforeFullReload', handler)
              return handler
            }),
            handler =>
              Effect.sync(() => hot.off('vite:beforeFullReload', handler)),
          )
          yield* Effect.addFinalizer(() => preserveScheduler.cancel)
        }
        if (hot && isPreserveScrollActive) {
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const handler = (): void => preserveScrollPosition(runtimeId)
              hot.on('vite:beforeFullReload', handler)
              return handler
            }),
            handler =>
              Effect.sync(() => hot.off('vite:beforeFullReload', handler)),
          )
        }
        if (hot) {
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => duplicateIdScanner?.cancel()),
          )
        }
        const runtimeContext = yield* Effect.context<never>()
        const boundaryRegistry = createHtmlBoundaryRegistry()
        const vnodeSlot: VNodeSlot = { maybeCurrentVNode: Option.none() }
        yield* Effect.addFinalizer(exit => {
          if (!Exit.hasInterrupts(exit)) {
            return Effect.void
          }
          return Option.match(vnodeSlot.maybeCurrentVNode, {
            onNone: () => Effect.void,
            onSome: currentVNode =>
              Effect.sync(() => {
                const placeholderNode = __patchVNode(
                  Option.some(currentVNode),
                  null,
                  container,
                ).elm
                if (placeholderNode?.parentNode) {
                  placeholderNode.parentNode.replaceChild(
                    container,
                    placeholderNode,
                  )
                }
                container.replaceChildren()
              }),
          })
        })
        const mountStartBuffer: Array<MountRecord> = []
        const mountEndBuffer: Array<MountRecord> = []
        let devToolsStore: DevToolsStore | null = null
        let maybeLastMessage = Option.none<Message>()
        let isRenderScheduled = false
        let isDisposed = false
        let isCrashed = false
        let isRenderingFrame = false
        let pendingRenderMessages: Array<
          Readonly<{
            message: Message
            maybeSource: Option.Option<TransitionSource>
          }>
        > = []
        const isInIframe = window.self !== window.top
        const resolvedDevTools = pipe(
          config.devTools ?? {},
          Option.liftPredicate(devToolsConfig => devToolsConfig !== false),
          Option.filter(devToolsConfig =>
            Match.value(devToolsConfig.show ?? DEFAULT_DEV_TOOLS_SHOW).pipe(
              Match.when('Always', () => true),
              Match.when('Development', () => !!import.meta.hot && !isInIframe),
              Match.exhaustive,
            ),
          ),
        )
        const isDevToolsEnabled = Option.isSome(resolvedDevTools)

        const mountTracker: typeof MountTracker.Service = {
          started: (name, args) => {
            if (isDevToolsEnabled) {
              mountStartBuffer.push(
                args === undefined ? { name } : { name, args },
              )
            }
          },
          ended: (name, args) => {
            if (isDevToolsEnabled) {
              mountEndBuffer.push(
                args === undefined ? { name } : { name, args },
              )
            }
          },
        }
        const drainMountEvents = (): Readonly<{
          starts: ReadonlyArray<MountRecord>
          ends: ReadonlyArray<MountRecord>
        }> => {
          const starts = mountStartBuffer.slice()
          const ends = mountEndBuffer.slice()
          mountStartBuffer.length = 0
          mountEndBuffer.length = 0
          return { starts, ends }
        }
        const sendToRuntime = (
          message: Message,
          source?: TransitionSource,
        ): void => {
          if (isDisposed || isCrashed) {
            return
          }
          if (isRenderingFrame) {
            pendingRenderMessages.push({
              message,
              maybeSource: Option.fromNullishOr(source),
            })
            return
          }
          runtime.send(message, source === undefined ? {} : { source })
        }
        const drainRenderMessages = (): void => {
          if (isRenderingFrame || isDisposed || isCrashed) {
            return
          }
          while (Array.isReadonlyArrayNonEmpty(pendingRenderMessages)) {
            const messages = pendingRenderMessages
            pendingRenderMessages = []
            Array.forEach(messages, ({ message, maybeSource }) =>
              runtime.send(
                message,
                Option.match(maybeSource, {
                  onNone: () => ({}),
                  onSome: source => ({ source }),
                }),
              ),
            )
          }
        }
        const dispatch: typeof Dispatch.Service = {
          dispatchAsync: message =>
            Effect.sync(() => sendToRuntime(decodeMessage(message))),
          dispatchSync: (message, source) =>
            sendToRuntime(decodeMessage(message), source),
        }
        const routing = config.routing
        if (routing !== undefined) {
          yield* Effect.acquireRelease(
            Effect.sync(() =>
              addNavigationEventListeners(
                (message, source) =>
                  sendToRuntime(decodeMessage(message), source),
                routing,
              ),
            ),
            removeNavigationEventListeners =>
              Effect.sync(removeNavigationEventListeners),
          )
        }
        const liveRenderContext = Context.add(
          Context.add(runtimeContext, Dispatch, dispatch),
          MountTracker,
          mountTracker,
        )
        const inspectingRenderContext = Context.add(
          Context.add(runtimeContext, Dispatch, noOpDispatch),
          MountTracker,
          mountTracker,
        )

        const crashWith = (
          cause: Cause.Cause<never>,
          maybeMessage: Option.Option<Message>,
        ): Effect.Effect<void> =>
          Effect.sync(() => {
            if (isDisposed || isCrashed) {
              return
            }
            isCrashed = true
            pendingRenderMessages = []
            const squashed = Cause.squash(cause)
            renderCrashView(
              {
                error:
                  squashed instanceof Error
                    ? squashed
                    : new Error(String(squashed)),
                model: runtime.readModel(),
                message: maybeMessage,
              },
              config.crash,
              container,
              vnodeSlot,
              config.manageDocument,
            )
          })

        const render = (
          model: Model,
          mode: 'Live' | 'Inspecting',
        ): Effect.Effect<void> =>
          Effect.sync(() => {
            if (isDisposed || isCrashed) {
              return
            }
            const isInspecting = mode === 'Inspecting'
            const maybeLiveSlowView = isInspecting
              ? Option.none<
                  ResolvedSlowPhaseConfig<SlowViewContext<Model, Message>>
                >()
              : resolvedSlowView
            const maybeLiveSlowPatch = isInspecting
              ? Option.none<
                  ResolvedSlowPhaseConfig<SlowPatchContext<Model, Message>>
                >()
              : resolvedSlowPatch
            isRenderingFrame = true
            if (isInspecting) {
              beginReplayHtmlRender()
            }
            try {
              const [nextDocument, maybeViewDuration] = measureSlowPhase(
                maybeLiveSlowView,
                () => {
                  beginHtmlRender(boundaryRegistry)
                  setHtmlRuntime(
                    isInspecting
                      ? noOpDispatch.dispatchSync
                      : dispatch.dispatchSync,
                    isInspecting ? inspectingRenderContext : liveRenderContext,
                    boundaryRegistry,
                  )
                  try {
                    return config.view(model)
                  } finally {
                    clearHtmlRuntime()
                  }
                },
              )
              reportSlowPhase<SlowViewContext<Model, Message>>(
                maybeLiveSlowView,
                maybeViewDuration,
                (durationMs, thresholdMs) => ({
                  _tag: 'View',
                  model,
                  message: maybeLastMessage,
                  durationMs,
                  thresholdMs,
                }),
              )
              const [patchedVNode, maybePatchDuration] = measureSlowPhase(
                maybeLiveSlowPatch,
                () =>
                  __patchVNode(
                    vnodeSlot.maybeCurrentVNode,
                    nextDocument.body,
                    container,
                    boundaryRegistry.dedupeSeen,
                  ),
              )
              vnodeSlot.maybeCurrentVNode = Option.some(patchedVNode)
              reportSlowPhase<SlowPatchContext<Model, Message>>(
                maybeLiveSlowPatch,
                maybePatchDuration,
                (durationMs, thresholdMs) => ({
                  _tag: 'Patch',
                  model,
                  message: maybeLastMessage,
                  durationMs,
                  thresholdMs,
                }),
              )
              if (config.manageDocument) {
                applyDocumentMetadata(nextDocument, patchedVNode.elm)
              }
              if (hot) {
                duplicateIdScanner?.schedule(patchedVNode.elm)
              }
            } finally {
              isRenderingFrame = false
              if (isInspecting) {
                endReplayHtmlRender()
              }
            }
          })

        const renderLive = (): Effect.Effect<void> =>
          render(runtime.readModel(), 'Live')

        const renderFrame = (): void => {
          isRenderScheduled = false
          if (
            isDisposed ||
            isCrashed ||
            (devToolsStore !== null &&
              SubscriptionRef.getUnsafe(devToolsStore.stateRef).isPaused)
          ) {
            return
          }
          Effect.runForkWith(runtimeContext)(
            renderLive().pipe(
              Effect.tap(() => {
                if (devToolsStore === null) {
                  return Effect.void
                }
                const mounts = drainMountEvents()
                return devToolsStore.attachRenderedMounts(
                  mounts.starts,
                  mounts.ends,
                )
              }),
              Effect.tap(() => Effect.sync(drainRenderMessages)),
              Effect.catchCause(cause => crashWith(cause, maybeLastMessage)),
            ),
          )
        }

        const scheduleRender = (): void => {
          if (!isRenderScheduled && !isDisposed && !isCrashed) {
            isRenderScheduled = true
            requestAnimationFrame(renderFrame)
          }
        }

        const notifyHostModel = (model: Model): void => {
          if (config.onModel === undefined) {
            return
          }
          try {
            config.onModel(model)
          } catch (error) {
            console.error(
              '[foldkit] A Foldkit host Model observer threw:',
              error,
            )
          }
        }
        const stopObservingModel = runtime.observeModel(model => {
          notifyHostModel(model)
          if (hot) {
            Effect.runSync(preserveScheduler.schedule(model))
          }
          scheduleRender()
        })
        const stopObservingJournalForMessage = runtime.journal.observe(
          transition => {
            maybeLastMessage = Option.some(transition.message)
          },
        )
        const stopObservingFailures = runtime.observeFailures(failure => {
          Effect.runSync(crashWith(failure.cause, failure.message))
        })
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            isDisposed = true
            pendingRenderMessages = []
            stopObservingModel()
            stopObservingJournalForMessage()
            stopObservingFailures()
          }),
        )

        notifyHostModel(runtime.readModel())
        const initialRenderExit = yield* Effect.exit(renderLive())
        if (Exit.isFailure(initialRenderExit)) {
          yield* crashWith(initialRenderExit.cause, Option.none())
          yield* runtime.shutdown
          return yield* Effect.never
        }
        if (Option.isSome(resolvedDevTools)) {
          const devToolsConfig = resolvedDevTools.value
          const initialMounts = drainMountEvents()
          const store = yield* createProgramDevToolsStore({
            runtime,
            bridge: {
              render: model => render(decodeModel(model), 'Inspecting'),
              markRenderPending: Effect.sync(scheduleRender),
            },
            excludeFromHistory: devToolsConfig.excludeFromHistory ?? [],
            ...(devToolsConfig.maxEntries === undefined
              ? {}
              : {
                  maxEntries: Math.max(
                    DEV_TOOLS_MAX_ENTRIES_MIN,
                    Math.min(
                      DEV_TOOLS_MAX_ENTRIES_MAX,
                      devToolsConfig.maxEntries,
                    ),
                  ),
                }),
            initialMountStarts: initialMounts.starts,
          })
          devToolsStore = store

          const maybeOverlay = Option.fromNullishOr(devToolsConfig.overlay)
          yield* Option.match(maybeOverlay, {
            onNone: () => Effect.void,
            onSome: overlay =>
              overlay(
                store,
                devToolsConfig.position ?? DEFAULT_DEV_TOOLS_POSITION,
                resolveDevToolsMode(
                  devToolsConfig.mode ?? DEFAULT_DEV_TOOLS_MODE,
                ),
                Option.fromNullishOr(devToolsConfig.banner),
              ),
          })
          if (import.meta.hot) {
            yield* startWebSocketBridge(
              store,
              import.meta.hot,
              message =>
                Effect.sync(() =>
                  sendToRuntime(decodeMessage(message), {
                    _tag: 'DevTools',
                  }),
                ),
              Option.some(program.Message),
            )
          }
        }

        if (isPreserveScrollActive) {
          yield* restorePreservedScrollPosition(runtimeId)
        }
        yield* Effect.sync(drainRenderMessages)
        if (config.manageDocument && !isEmbedded) {
          yield* Effect.sync(() => addBfcacheRestoreListener())
        }

        const initializationExit = yield* Effect.exit(runtime.initialization)
        if (Exit.isFailure(initializationExit)) {
          yield* crashWith(initializationExit.cause, Option.none())
        }
        return yield* Effect.never
      }),
    )

  const start = (hmrModel?: unknown): Effect.Effect<void> =>
    startWith(Option.none(), hmrModel, false)
  const renderer: MakeRuntimeReturn<P> = {
    runtimeId,
    start,
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    ports: config.program.ports as P,
  }
  programRendererInternals.set(renderer, {
    startWith,
    isEmbedActive: false,
    maybeActiveFiber: Option.none(),
  })
  return renderer
}

/**
 * Creates a Foldkit-rendered client over one shared Program runtime.
 */
export const makeFoldkitApplication = <
  Model,
  Message extends Readonly<{ _tag: string }>,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config: FoldkitApplicationConfig<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  >,
): MakeRuntimeReturn<P> =>
  makeProgramRenderer({ ...config, manageDocument: true })

const toCrashConfig = <Model, Message>(
  crash: ElementCrashConfig<Model, Message> | undefined,
): CrashConfig<Model, Message> | undefined => {
  if (Predicate.isUndefined(crash)) {
    return undefined
  }

  const elementCrashView = crash.view

  return {
    ...(Predicate.isNotUndefined(elementCrashView) && {
      view: (context: CrashContext<Model, Message>): Document => ({
        title: '',
        body: elementCrashView(context),
      }),
    }),
    ...(Predicate.isNotUndefined(crash.report) && {
      report: crash.report,
    }),
  }
}

/**
 * Creates a Foldkit app scoped to its container and returns a runtime that
 * can be passed to `run`.
 *
 * Unlike `makeApplication`, the `view` returns `Html` directly rather than a
 * `Document`, and the runtime never touches the document `<head>`. This lets a
 * Foldkit app be embedded at a node (a widget on a page it does not own)
 * without clobbering the host page's `title`, `canonical`, or `og:url`. Use
 * `makeApplication` when the app owns the page and should manage those tags, and
 * `makeElement` when it is one component among others on a page it does not
 * control. Embedded apps do not own the URL bar, so `makeElement` has no
 * `routing` config.
 */
export function makeElement<
  Model,
  Message extends { _tag: string },
  Flags,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config: ElementConfigWithFlags<
    Model,
    Message,
    Flags,
    Resources,
    ManagedResourceServices,
    P
  >,
): MakeRuntimeReturn<P>

export function makeElement<
  Model,
  Message extends { _tag: string },
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config: ElementConfig<Model, Message, Resources, ManagedResourceServices, P>,
): MakeRuntimeReturn<P>

export function makeElement<
  Model,
  Message extends { _tag: string },
  Flags,
  Resources = never,
  ManagedResourceServices = never,
  P extends Ports | undefined = undefined,
>(
  config:
    | ElementConfigWithFlags<
        Model,
        Message,
        Flags,
        Resources,
        ManagedResourceServices,
        P
      >
    | ElementConfig<Model, Message, Resources, ManagedResourceServices, P>,
): MakeRuntimeReturn<P> {
  const { container } = config
  if (container === null) {
    throw new Error(
      '[foldkit] Container is null. Make sure the element exists in the DOM ' +
        'before calling makeElement (e.g. that your <div id="root"></div> has ' +
        'rendered, and your script runs after it).',
    )
  }

  const hasFlags = 'Flags' in config

  const elementView = config.view
  const view = (model: Model): Document => ({
    title: '',
    body: elementView(model),
  })

  const crash = toCrashConfig(config.crash)
  const runtimeId = container.id
  type ElementProgram = Program<
    Model,
    Message,
    Resources,
    ManagedResourceServices,
    P
  >
  const buildProgram = (init: ElementProgram['init']): ElementProgram =>
    makeProgram({
      id: runtimeId,
      version: 1,
      Model: config.Model,
      Message: config.Message,
      init,
      update: config.update,
      ...(config.subscriptions === undefined
        ? {}
        : { subscriptions: config.subscriptions }),
      ...(config.managedResources === undefined
        ? {}
        : { managedResources: config.managedResources }),
      ...(config.ports === undefined ? {} : { ports: config.ports }),
    })

  let programEffect: Effect.Effect<ElementProgram>
  /* eslint-disable @typescript-eslint/consistent-type-assertions */
  if (hasFlags) {
    const flagsConfig = config as ElementConfigWithFlags<
      Model,
      Message,
      Flags,
      Resources,
      ManagedResourceServices,
      P
    >
    programEffect = Effect.map(flagsConfig.flags, flags =>
      buildProgram(() => flagsConfig.init(flags)),
    )
  } else {
    const elementConfig = config as ElementConfig<
      Model,
      Message,
      Resources,
      ManagedResourceServices,
      P
    >
    programEffect = Effect.sync(() => buildProgram(elementConfig.init))
  }
  /* eslint-enable @typescript-eslint/consistent-type-assertions */

  const startWith = (
    maybePortHandleBridge: Option.Option<PortHandleBinding>,
    hmrModel: unknown,
    isEmbedded: boolean,
  ): Effect.Effect<void> =>
    Effect.flatMap(programEffect, program => {
      const renderer = makeProgramRenderer<
        Model,
        Message,
        Resources,
        ManagedResourceServices,
        P
      >({
        program,
        resources: resolveResources(config.resources),
        container,
        view,
        manageDocument: false,
        ...(crash === undefined ? {} : { crash }),
        ...(config.devTools === undefined ? {} : { devTools: config.devTools }),
        ...(config.journal === undefined ? {} : { journal: config.journal }),
        ...(config.slow === undefined ? {} : { slow: config.slow }),
        ...(config.freezeModel === undefined
          ? {}
          : { freezeModel: config.freezeModel }),
      })
      const maybeInternals = Option.fromNullishOr(
        programRendererInternals.get(renderer),
      )
      return Option.match(maybeInternals, {
        onNone: () =>
          Effect.die(
            new Error(
              '[foldkit] The Foldkit renderer did not register its runtime internals.',
            ),
          ),
        onSome: internals =>
          internals.startWith(maybePortHandleBridge, hmrModel, isEmbedded),
      })
    })

  const start = (hmrModel?: unknown): Effect.Effect<void> =>
    startWith(Option.none(), hmrModel, false)
  const element: MakeRuntimeReturn<P> = {
    runtimeId,
    start,
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    ports: config.ports as P,
  }
  programRendererInternals.set(element, {
    startWith,
    isEmbedActive: false,
    maybeActiveFiber: Option.none(),
  })
  return element
}

const encodePreserveModelMessage =
  Schema.encodeUnknownSync(PreserveModelMessage)
const encodeRequestModelMessage = Schema.encodeUnknownSync(RequestModelMessage)
const decodeRestoreModelMessage = Schema.decodeUnknownExit(RestoreModelMessage)

const preserveModel = (
  id: string,
  encodedModel: unknown,
  isHmrReload: boolean,
): void => {
  if (import.meta.hot) {
    import.meta.hot.send(
      'foldkit:preserve-model',
      encodePreserveModelMessage(
        PreserveModelMessage.make({ id, model: encodedModel, isHmrReload }),
      ),
    )
  }
}

const PLUGIN_RESPONSE_TIMEOUT_MS = 500

// NOTE: scheduling fix for browser performance. Effect needs to defer work
// onto a future tick of the event loop. The default browser scheduler picks
// `setTimeout(f, 0)`, but browsers clamp `setTimeout` to a minimum of 4ms.
// `queueMicrotask` runs on the very next tick (sub-millisecond). Dispatch no
// longer routes through the Effect scheduler, but Command and Subscription
// fibers still do; without this override every fiber yield (for example, an
// op-budget suspension, or a Stream step) would take an extra 4-16ms
// round-trip before
// its result Message lands.
const microtaskSetImmediate = (callback: () => void): (() => void) => {
  let cancelled = false
  queueMicrotask(() => {
    if (!cancelled) callback()
  })
  return () => {
    cancelled = true
  }
}

const browserScheduler = new Scheduler.MixedScheduler(
  'async',
  microtaskSetImmediate,
)

const provideBrowserScheduler = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.provide(effect, Layer.succeed(Scheduler.Scheduler, browserScheduler))

// NOTE: asks @foldkit/vite-plugin for a model preserved across the last HMR
// reload. The plugin only serves a model whose preservation was flushed by a
// reload, so a host-driven dispose-then-embed remount initializes fresh while
// a code reload restores state.
const resolveHmrModel = (runtimeId: string): Effect.Effect<unknown> => {
  const hot = import.meta.hot
  if (!hot) {
    return Effect.succeed(undefined)
  }

  return pipe(
    Effect.callback<unknown>(resume => {
      const handler = (message: unknown): void => {
        Exit.match(decodeRestoreModelMessage(message), {
          onFailure: Function.constVoid,
          onSuccess: ({ id, model }) => {
            if (id === runtimeId) {
              hot.off('foldkit:restore-model', handler)
              resume(Effect.succeed(model))
            }
          },
        })
      }
      hot.on('foldkit:restore-model', handler)
      hot.send(
        'foldkit:request-model',
        encodeRequestModelMessage(RequestModelMessage.make({ id: runtimeId })),
      )
      return Effect.sync(() => hot.off('foldkit:restore-model', handler))
    }),
    Effect.timeout(PLUGIN_RESPONSE_TIMEOUT_MS),
    Effect.catchTag('TimeoutError', () => {
      console.warn(
        '[foldkit] No response from @foldkit/vite-plugin. Add it to your vite.config.ts for HMR model preservation:\n\n' +
          "  import { foldkit } from '@foldkit/vite-plugin'\n\n" +
          '  export default defineConfig({ plugins: [foldkit()] })\n\n' +
          'Starting without HMR support.',
      )
      return Effect.succeed(undefined)
    }),
  )
}

/** Starts a Foldkit runtime that owns the page for the page's whole lifetime,
 *  with HMR support for development. To start a runtime under a
 *  host-controlled lifecycle instead, use `embed`. */
export const run = (program: MakeRuntimeReturn<Ports | undefined>): void => {
  BrowserRuntime.runMain(
    provideBrowserScheduler(
      Effect.flatMap(resolveHmrModel(program.runtimeId), program.start),
    ),
  )
}

/**
 * Starts a Foldkit runtime under a host-controlled lifecycle and returns an
 * `EmbedHandle`. This is the entry point for embedding a Foldkit app inside
 * another application: the host pushes values in through the handle's inbound
 * Ports, listens to outbound Ports, and calls `dispose` when it unmounts the
 * app. The host never touches the Model or dispatches Messages directly; the
 * Schema-typed Ports are the whole boundary.
 *
 * Works with programs from both `makeApplication` and `makeElement`; for a
 * widget on a page the host owns, `makeElement` is the natural fit.
 *
 * A program can be embedded once at a time (it owns one container). After
 * `dispose`, the same container can be embedded again with a fresh program.
 *
 * ```ts
 * const handle = Runtime.embed(element)
 *
 * handle.ports.stepChanged.send(5)
 * const unsubscribe = handle.ports.countChanged.subscribe(count => {
 *   console.log(count)
 * })
 *
 * handle.dispose()
 * ```
 */
export const embed = <P extends Ports | undefined = undefined>(
  program: MakeRuntimeReturn<P>,
): EmbedHandle<P> => {
  const rendererInternals = programRendererInternals.get(program)
  if (Predicate.isUndefined(rendererInternals)) {
    throw new Error(
      '[foldkit] embed expects a program created by makeApplication or makeElement.',
    )
  }

  if (rendererInternals.isEmbedActive) {
    throw new Error(
      '[foldkit] This program is already embedded. Dispose the existing ' +
        'handle first, or create a separate program: each program owns one ' +
        'container.',
    )
  }
  rendererInternals.isEmbedActive = true
  const bridge = makePortHandleBridge(program.ports)
  const startEffect = pipe(
    Option.match(rendererInternals.maybeActiveFiber, {
      onNone: () => Effect.void,
      onSome: previousFiber => Effect.asVoid(Fiber.await(previousFiber)),
    }),
    Effect.andThen(resolveHmrModel(program.runtimeId)),
    Effect.flatMap(hmrModel =>
      rendererInternals.startWith(Option.some(bridge), hmrModel, true),
    ),
  )

  const fiber = Effect.runFork(provideBrowserScheduler(startEffect))
  rendererInternals.maybeActiveFiber = Option.some(fiber)

  let isHandleDisposed = false
  const dispose = (): void => {
    if (isHandleDisposed) {
      return
    }
    isHandleDisposed = true
    bridge.dispose()
    rendererInternals.isEmbedActive = false
    Effect.runFork(Fiber.interrupt(fiber))
  }

  return { ports: bridge.handles, dispose }
}
