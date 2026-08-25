import { Match as M, Option } from 'effect'

import { type PresentationStyle, type StackInstruction } from './structure.js'

// CALLS

/** Pushes one path onto a path-based router. */
export type PushPathCall = Readonly<{
  _tag: 'PushPath'
  readonly path: string
}>
/** Goes back one entry on a path-based router. */
export type BackCall = Readonly<{ _tag: 'Back' }>
/** Presents one path over the current entry with a visual style. */
export type PresentPathCall = Readonly<{
  _tag: 'PresentPath'
  readonly path: string
  readonly style: PresentationStyle
}>
/** Replaces the current history entry. */
export type ReplacePathCall = Readonly<{
  _tag: 'ReplacePath'
  readonly path: string
}>
/** Dismisses the topmost presentation. */
export type DismissCall = Readonly<{ _tag: 'Dismiss' }>
/** Pushes a named route with params and card animation. */
export type NamedPushCall = Readonly<{
  _tag: 'NamedPush'
  readonly route: string
  readonly params: Readonly<Record<string, string>>
}>
/** Presents a named route with an explicit native presentation. */
export type NamedPresentCall = Readonly<{
  _tag: 'NamedPresent'
  readonly route: string
  readonly params: Readonly<Record<string, string>>
  readonly presentation: 'card' | 'modal' | 'transparentModal'
}>

/** One imperative call a host router performs. Plugins return these; hosts perform them. */
export type NativeCall =
  | PushPathCall
  | BackCall
  | PresentPathCall
  | ReplacePathCall
  | DismissCall
  | NamedPushCall
  | NamedPresentCall

// PLUGIN

/** Prints one destination to its canonical path in the host URI space. */
export type PathPrinter<Destination> = (destination: Destination) => string

/**
 * Configures the navigation adapter for one router family. Pure: plugins
 * translate steps into calls and perform nothing.
 */
export interface RouterPlugin<Destination> {
  readonly id: string
  readonly toNativeCalls: (
    instruction: StackInstruction<Destination>,
    print: PathPrinter<Destination>,
  ) => ReadonlyArray<NativeCall>
}

/** Performs native calls at the platform edge. Host-supplied. */
export type NativeEmitter = (call: NativeCall) => void

const presentStyleOf = (
  style: PresentationStyle,
): 'card' | 'modal' | 'transparentModal' =>
  M.value(style).pipe(
    M.withReturnType<'card' | 'modal' | 'transparentModal'>(),
    M.tagsExhaustive({
      Push: () => 'card',
      Sheet: () => 'modal',
      BottomSheet: () => 'modal',
      FullScreenCover: () => 'transparentModal',
      Dialog: () => 'transparentModal',
      Popover: () => 'transparentModal',
      Drawer: () => 'modal',
    }),
  )

const webCallsFor = <Destination>(
  instruction: StackInstruction<Destination>,
  print: PathPrinter<Destination>,
): ReadonlyArray<NativeCall> =>
  M.value(instruction).pipe(
    M.withReturnType<ReadonlyArray<NativeCall>>(),
    M.tagsExhaustive({
      SetRoot: ({ root }) =>
        [
          {
            _tag: 'ReplacePath',
            path: print(root),
          },
        ] satisfies ReadonlyArray<NativeCall>,
      Push: ({ destination, style }) =>
        style._tag === 'Push'
          ? [{ _tag: 'PushPath', path: print(destination) }]
          : [
              {
                _tag: 'PresentPath',
                path: print(destination),
                style,
              },
            ],
      Pop: () => [{ _tag: 'Back' }],
      ReplaceTop: ({ entry }) =>
        entry.style._tag === 'Push'
          ? [{ _tag: 'ReplacePath', path: print(entry.destination) }]
          : [
              { _tag: 'Dismiss' },
              {
                _tag: 'PresentPath',
                path: print(entry.destination),
                style: entry.style,
              },
            ],
    }),
  )

/** Web router plugin for TanStack Router. Sheets and dialogs are routes; screens paint overlays. */
export const tanstackRouterPlugin = <
  Destination,
>(): RouterPlugin<Destination> => ({
  id: 'tanstack-router',
  toNativeCalls: webCallsFor,
})

/** Web router plugin for React Router. Shares the web policy today; versioned separately. */
export const reactRouterPlugin = <
  Destination,
>(): RouterPlugin<Destination> => ({
  id: 'react-router',
  toNativeCalls: webCallsFor,
})

/** How a plugin parses printed paths into named routes and params. */
export type PathParser<Destination> = (path: string) => Option.Option<{
  readonly route: string
  readonly params: Readonly<Record<string, string>>
  readonly destination: Destination
}>

/** Named-route plugin for React Navigation; parses printed paths through injected config. */
export const reactNavigationPlugin = <Destination>(config: {
  readonly parsePath: PathParser<Destination>
}): RouterPlugin<Destination> => ({
  id: 'react-navigation',
  toNativeCalls: (instruction, print) =>
    webCallsFor(instruction, print).flatMap(call =>
      M.value(call).pipe(
        M.withReturnType<ReadonlyArray<NativeCall>>(),
        M.tagsExhaustive({
          PushPath: ({ path }) =>
            Option.match(config.parsePath(path), {
              onNone: () => [],
              onSome: parsed => [
                {
                  _tag: 'NamedPush',
                  route: parsed.route,
                  params: parsed.params,
                },
              ],
            }),
          PresentPath: ({ path, style }) =>
            Option.match(config.parsePath(path), {
              onNone: () => [],
              onSome: parsed => [
                {
                  _tag: 'NamedPresent',
                  route: parsed.route,
                  params: parsed.params,
                  presentation:
                    style._tag === 'Push' ? 'card' : presentStyleOf(style),
                },
              ],
            }),
          ReplacePath: ({ path }) =>
            Option.match(config.parsePath(path), {
              onNone: () => [],
              onSome: parsed => [
                { _tag: 'Back' },
                {
                  _tag: 'NamedPush',
                  route: parsed.route,
                  params: parsed.params,
                },
              ],
            }),
          Back: () => [{ _tag: 'Back' }],
          Dismiss: () => [{ _tag: 'Dismiss' }],
          NamedPush: call => [call],
          NamedPresent: call => [call],
        }),
      ),
    ),
})

// ADAPTER

/** Feeds one plugin, one path printer, and one emitter to create the surface hosts call. */
export const createNavigationAdapter = <Destination>(
  plugin: RouterPlugin<Destination>,
  print: PathPrinter<Destination>,
  emit: NativeEmitter,
): {
  readonly apply: (
    instructions: ReadonlyArray<StackInstruction<Destination>>,
  ) => void
} => ({
  apply: instructions => {
    for (const instruction of instructions) {
      for (const call of plugin.toNativeCalls(instruction, print)) {
        emit(call)
      }
    }
  },
})
