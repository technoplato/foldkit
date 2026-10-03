import { Effect } from 'effect'

export { UrlRequest, Internal, External } from './urlRequest.js'
export {
  ElementAnchor,
  PresentationStyle,
  Push,
  Sheet,
  BottomSheet,
  FullScreenCover,
  Dialog,
  Popover,
  Side,
  Drawer,
  presented,
  NavigationStack,
  NothingPresented,
  PresentingEntries,
  stackAtRoot,
  stackWithEntries,
  topEntry,
  pushed,
  popped,
  replacedRoot,
  setRoot,
  push,
  pop,
  replaceTop,
  stackInstructions,
  applyStackInstructions,
} from './structure.js'
export type { Presented, StackInstruction } from './structure.js'
export { entriesOf, stackFrom, truncated, isOpaque } from './structure.js'
export {
  Slug,
  Placement,
  rootRoute,
  pushRoute,
  presentRoute,
  liftRoute,
  tagCase,
  NotFound,
  isNotFound,
  notFoundRoute,
  HistoryMode,
  routeOf,
  NavigationDeclarationError,
  make,
  NavigationTypeId,
  screens,
  rootScreen,
  pushScreen,
  presentScreen,
  screenView,
  menuView,
  focusModel,
} from './declaration.js'
export type {
  DestinationRoute,
  RouteOptions,
  StackLens,
  ProgramNavigation,
  StackedNavigation,
  DeclaredNavigation,
  EntryView,
  ModelFocus,
  RoutesByTag,
  NavigationConfig,
  TaggedDestination,
  Screen,
  RootScreen,
  ScreenDestination,
  DestinationOfScreens,
} from './declaration.js'
export {
  splitUri,
  pathAndUri,
  queryPairsOf,
  pathOf,
  printStates,
  printStack,
  parseStack,
  canonicalUri,
  defaultUri,
  ownsUri,
} from './uri.js'
export type { SplitUri, PathAndUri } from './uri.js'
export {
  UriVia,
  Launch,
  Link,
  DeepLink,
  History,
  Cli,
  Agent,
  Following,
  OpenedUri,
  NavigatedBack,
  Message,
  isMessage,
} from './message.js'
export {
  settled,
  applyMessage,
  foldMessage,
  backMessages,
} from './transition.js'
export {
  holdOf,
  stackField,
  composedDestination,
  composedFields,
  ownedMessages,
  fieldLens,
  notFoundScreen,
  composeNavigation,
} from './compose.js'
export type { StackHold, DestinationOf } from './compose.js'
export {
  planOf,
  carrierMove,
  classifyCarrierChange,
  launch,
  openWhenReady,
  backOneEntry,
  layersOf,
  runCarrier,
} from './carrier.js'
export type {
  CarrierEntry,
  CarrierPlan,
  PlanLayers,
  CarrierSnapshot,
  CarrierMove,
  Expectation,
  CarrierEvent,
  CarrierDriver,
  CarrierSource,
  CarrierDiagnostic,
  CarrierOptions,
} from './carrier.js'
export {
  windowUri,
  browserHistoryDriver,
  followHostLink,
  followLink,
  HostPages,
  LinkTarget,
  LoadDocument,
  linkTargetOf,
  locationChangedEvent,
  OpenInProgram,
  ShowHostPage,
} from './browserHistory.js'
export { maybeTitleOf } from './carrier.js'
export type { BrowserWindow } from './browserHistory.js'
export { documentTitleOf, frameOf } from './frame.js'
export { uriOfDeepLink } from './deepLink.js'
export type { Frame, FrameLayer, FrameSource } from './frame.js'
export { coalescedStack, keyedStackDriver } from './keyedStack.js'
export type { KeyedRoute, KeyedStack } from './keyedStack.js'
export {
  tanstackRouterPlugin,
  reactRouterPlugin,
  reactNavigationPlugin,
  createNavigationAdapter,
} from './plugin.js'
export type {
  NativeCall,
  PushPathCall,
  BackCall,
  PresentPathCall,
  ReplacePathCall,
  DismissCall,
  NamedPushCall,
  NamedPresentCall,
  PathPrinter,
  RouterPlugin,
  NativeEmitter,
  PathParser,
} from './plugin.js'

/** Pushes a new URL to browser history and triggers Foldkit's URL change handling. */
export const pushUrl = (url: string): Effect.Effect<void> =>
  Effect.sync(() => {
    window.history.pushState({}, '', url)
    window.dispatchEvent(new CustomEvent('foldkit:urlchange'))
  })

/** Replaces the current URL in browser history and triggers Foldkit's URL change handling. */
export const replaceUrl = (url: string): Effect.Effect<void> =>
  Effect.sync(() => {
    window.history.replaceState({}, '', url)
    window.dispatchEvent(new CustomEvent('foldkit:urlchange'))
  })

/** Navigates back in browser history. */
export const back = (): Effect.Effect<void> =>
  Effect.sync(() => window.history.back())

/** Navigates forward in browser history. */
export const forward = (): Effect.Effect<void> =>
  Effect.sync(() => window.history.forward())

/** Performs a full page navigation to the given href. */
export const load = (href: string): Effect.Effect<void> =>
  Effect.sync(() => window.location.assign(href))

/** Opens the given href in a new browsing context (tab or window, at the browser's discretion).
 *  The current page is unchanged. Subject to popup blockers when not called from a user-gesture handler. */
export const openUrl = (href: string): Effect.Effect<void> =>
  Effect.sync(() => {
    window.open(href, '_blank', 'noopener,noreferrer')
  })
