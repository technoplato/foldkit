import {
  type Model,
  type NavInstruction,
  type Navigation,
  navigatorInstructions,
  navigationTargetToPath,
} from 'counters-core-example'
import { Match as M, Option } from 'effect'
import {
  createNavigationAdapter,
  type NativeCall,
  push as pushEntry,
  type PresentationStyle,
  reactRouterPlugin,
  type RouterPlugin,
  tanstackRouterPlugin,
  type StackInstruction,
} from 'foldkit/navigation'

// INSTRUCTION BRIDGE
//
// The Program speaks app-level NavInstruction transitions. Routers speak
// StackInstructions over printed paths. This module is the only place
// that translation lives, so every web surface shares one policy.

/** Presents the counter-fact alert as a centered dialog. */
const factAlertStyle: PresentationStyle = { _tag: 'Dialog' }
/** Presents the delete confirmation as a centered dialog. */
const deleteConfirmationStyle: PresentationStyle = { _tag: 'Dialog' }

const instructionPath = (instruction: NavInstruction): string =>
  M.value(instruction).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      PushCounterDetail: ({ counterId }) =>
        navigationTargetToPath({ _tag: 'CounterDetailTarget', counterId }),
      PresentCounterFactAlert: ({ counterId }) =>
        navigationTargetToPath({ _tag: 'CounterFactTarget', counterId }),
      PresentDeleteConfirmation: ({ counterId }) =>
        navigationTargetToPath({ _tag: 'DeleteCounterTarget', counterId }),
      PopCounterDetail: () => '',
      DismissCounterFactAlert: () => '',
      DismissDeleteConfirmation: () => '',
    }),
  )

/**
 * Projects one app Navigation transition into ordered StackInstructions
 * whose destinations are canonical counter paths.
 */
export const navInstructionsToStack = (
  previous: Navigation,
  next: Navigation,
): ReadonlyArray<StackInstruction<string>> =>
  navigatorInstructions(previous, next).map(
    (instruction): StackInstruction<string> =>
      M.value(instruction).pipe(
        M.withReturnType<StackInstruction<string>>(),
        M.tagsExhaustive({
          PushCounterDetail: () =>
            pushEntry(instructionPath(instruction), { _tag: 'Push' }),
          PopCounterDetail: () => ({ _tag: 'Pop' }),
          PresentCounterFactAlert: () =>
            pushEntry(instructionPath(instruction), factAlertStyle),
          // The stack vocabulary has no Dismiss: a presented entry sits
          // on top, so dismissing it is popping it. Web plugins translate
          // each Pop onto one history back.
          DismissCounterFactAlert: () => ({ _tag: 'Pop' }),
          PresentDeleteConfirmation: () =>
            pushEntry(instructionPath(instruction), deleteConfirmationStyle),
          DismissDeleteConfirmation: () => ({ _tag: 'Pop' }),
        }),
      ),
  )

// ROUTER PORTS
//
// A WebRouterPort performs one NativeCall on a concrete router object.
// Ports are the only impure seam; tests substitute recorders.

/** The imperative surface any web router must expose to this bridge. */
export interface WebRouterPort {
  readonly pushPath: (path: string) => void
  readonly back: () => void
  readonly presentPath: (path: string, style: PresentationStyle) => void
  readonly replacePath: (path: string) => void
  readonly dismiss: () => void
}

/** Performs calls in order on the given port. */
export const performNativeCalls = (
  calls: ReadonlyArray<NativeCall>,
  port: WebRouterPort,
): void => {
  for (const call of calls) {
    switch (call._tag) {
      case 'PushPath': {
        port.pushPath(call.path)
        break
      }
      case 'Back': {
        port.back()
        break
      }
      case 'PresentPath': {
        port.presentPath(call.path, call.style)
        break
      }
      case 'ReplacePath': {
        port.replacePath(call.path)
        break
      }
      case 'Dismiss': {
        port.dismiss()
        break
      }
      // Web plugins never emit named-route calls; react-navigation owns them.
      case 'NamedPush':
      case 'NamedPresent': {
        break
      }
    }
  }
}

// ADAPTER FACTORY

/** The configured bridge one host installs: feed it each transition. */
export interface NavigationBridge {
  readonly apply: (previous: Navigation, next: Navigation) => void
}

/**
 * Builds the navigation bridge for one web router family. Pure until
 * the port performs; the plugin decides call shape, the port decides
 * platform mechanics. Callers own previous state and feed every observed
 * transition — use {@link observeNavigation} or seed by skipping the
 * first diff yourself.
 */
export const navigationBridgeFor = (
  plugin: RouterPlugin<string>,
  port: WebRouterPort,
): NavigationBridge => {
  const adapter = createNavigationAdapter<string>(
    plugin,
    (path: string) => path,
    (call: NativeCall) => performNativeCalls([call], port),
  )
  return {
    apply: (previous, next) => {
      adapter.apply(navInstructionsToStack(previous, next))
    },
  }
}

/** TanStack Router bridge. Sheets and dialogs are routes. */
export const tanstackNavigationBridge = (
  port: WebRouterPort,
): NavigationBridge => navigationBridgeFor(tanstackRouterPlugin<string>(), port)

/** React Router bridge. Same web policy today; versioned separately. */
export const reactRouterNavigationBridge = (
  port: WebRouterPort,
): NavigationBridge => navigationBridgeFor(reactRouterPlugin<string>(), port)

// LIVE OBSERVER

/** The slice of the window runtime this observer needs. */
export interface NavigationSource {
  readonly readModel: () => Model
  readonly subscribe: (
    listener: (model: Model) => void,
  ) => (() => void) | void
}

/**
 * Feeds every observed Program navigation change through the bridge.
 * Returns the stop function so React effects can clean up. The first
 * observation seeds previous state; every later change performs calls
 * on the port, so deep links and in-app taps cannot disagree.
 */
export const observeNavigation = (
  source: NavigationSource,
  bridge: NavigationBridge,
): (() => void) => {
  let previous: Option.Option<Navigation> = Option.none()
  const apply = (model: Model): void => {
    const next = model.navigation
    Option.match(previous, {
      onNone: () => undefined,
      onSome: before => bridge.apply(before, next),
    })
    previous = Option.some(next)
  }
  apply(source.readModel())
  const stopObserving = source.subscribe(apply)
  return (): void => {
    if (typeof stopObserving === 'function') {
      stopObserving()
    }
    previous = Option.none()
  }
}
