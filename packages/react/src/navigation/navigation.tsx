import { Array, Match as M, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import type { ButtonNode } from 'foldkit/renderers'
import {
  type ReactElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react'

import {
  ActionMenuDialog,
  ActionMenuPanel,
  type AnyBound,
  type PaintClassNames,
  Screen,
  useBound,
} from '../interaction/interaction.js'
import { useBoundRead } from '../interaction/selected.js'
import { ScreenStyles, paintTree } from '../paintReact/paintReact.js'

// FRAME

/**
 * The navigation frame the bound Program shows now: where it is, the base
 * screen, and every entry presented over it. It keeps its reference while
 * the frame is unchanged, so a count change on a hidden page does not
 * repaint the page on top.
 *
 * @example
 * ```tsx
 * const Where = () =>
 *   Option.match(useNavigationFrame(), {
 *     onNone: () => null,
 *     onSome: frame => <p>{frame.uri}</p>,
 *   })
 * ```
 */
export const useNavigationFrame = (): Option.Option<Navigation.Frame> => {
  const bound = useBound()
  return useBoundRead(bound, () => Navigation.frameOf(bound))
}

/**
 * The bound Program's carrier plan, None until it is Ready or for a
 * Program without a URI. A native stack renders one route per entry.
 *
 * @example
 * ```tsx
 * const depth = Option.match(useNavigationPlan(), {
 *   onNone: () => 0,
 *   onSome: plan => plan.entries.length,
 * })
 * ```
 */
export const useNavigationPlan = (): Option.Option<
  Navigation.CarrierPlan<unknown>
> => {
  const bound = useBound()
  return useBoundRead(bound, bound.navigation)
}

/**
 * Whether the bound Program has a plan to show: true once it is Ready and
 * URL-addressable. A native stack mounts on it and re-renders only when
 * it flips, not on every move.
 *
 * @example
 * ```tsx
 * return useIsNavigationReady() ? <Stack /> : <Starting />
 * ```
 */
export const useIsNavigationReady = (): boolean => {
  const bound = useBound()
  return useBoundRead(bound, () => Option.isSome(bound.navigation()))
}

/**
 * What one stack entry paints, by key. A native stack screen reads its own
 * entry, so pushing a page above it does not repaint it.
 *
 * @example
 * ```tsx
 * const view = useViewAt('/counter/session') // Some(Screen(session page))
 * ```
 */
export const useViewAt = (key: string): Option.Option<Navigation.EntryView> => {
  const bound = useBound()
  return useBoundRead(bound, () => bound.viewAt(key))
}

const pressOf =
  (bound: AnyBound) =>
  (button: ButtonNode): void => {
    if (button.action !== undefined) {
      bound.press(button.action)
    }
  }

const HostPagesContext = createContext<Navigation.HostPages>('ProgramOnly')

/**
 * Tells every navigation frame inside whether the app shows pages of its
 * own beside the Program's, so a screen's text link to `/about` shows that
 * page the way a React Router `<Link>` does. `FoldkitRouter` provides it.
 */
export const HostPagesProvider = HostPagesContext.Provider

const followLinkOf =
  (bound: AnyBound, hostPages: Navigation.HostPages) =>
  (href: string): boolean =>
    typeof window !== 'undefined' &&
    Navigation.followLink(window, bound, href, hostPages, 'Push')

type LayerShape = Readonly<{
  key: string
  maybeStyle: Option.Option<Navigation.PresentationStyle>
  kind: Navigation.EntryView['_tag']
}>

type FrameShape = Readonly<{
  uri: string
  base: LayerShape
  overlays: ReadonlyArray<LayerShape>
}>

const shapeOf = (layer: Navigation.FrameLayer): LayerShape => ({
  key: layer.key,
  maybeStyle: layer.maybeStyle,
  kind: layer.view._tag,
})

const useFrameShape = (): Option.Option<FrameShape> => {
  const bound = useBound()
  return useBoundRead(bound, () =>
    Option.map(Navigation.frameOf(bound), frame => ({
      uri: frame.uri,
      base: shapeOf(frame.base),
      overlays: Array.map(frame.overlays, shapeOf),
    })),
  )
}

const ScreenView = ({
  entryKey,
  classNames,
}: Readonly<{
  entryKey: string
  classNames: PaintClassNames
}>): ReactElement | null => {
  const bound = useBound()
  const hostPages = useContext(HostPagesContext)
  const maybeView = useViewAt(entryKey)
  return useMemo(
    () =>
      Option.match(maybeView, {
        onNone: () => null,
        onSome: view =>
          M.value(view).pipe(
            M.withReturnType<ReactElement>(),
            M.tagsExhaustive({
              Screen: ({ node }) => (
                <>
                  <ScreenStyles />
                  {paintTree(node, {
                    classNames,
                    onPress: pressOf(bound),
                    onLink: followLinkOf(bound, hostPages),
                  })}
                </>
              ),
              Menu: ({ menu }) => <ActionMenuPanel menu={menu} />,
            }),
          ),
      }),
    [bound, hostPages, maybeView, classNames],
  )
}

const enabledButtonsOf = (
  root: HTMLElement,
): ReadonlyArray<HTMLButtonElement> =>
  globalThis.Array.from(
    root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
  )

const openingButtonOf = (
  buttons: ReadonlyArray<HTMLButtonElement>,
): Option.Option<HTMLButtonElement> =>
  Option.orElse(
    Array.findFirst(
      buttons,
      button => button.closest('[data-current]') !== null,
    ),
    () => Array.head(buttons),
  )

const steppedIndex = (
  maybeCurrent: Option.Option<number>,
  move: 'Next' | 'Previous',
  count: number,
): number =>
  Option.match(maybeCurrent, {
    onNone: () => (move === 'Next' ? 0 : count - 1),
    onSome: current =>
      (current + (move === 'Next' ? 1 : -1) + count) % Math.max(count, 1),
  })

/**
 * A screen presented over the page, such as "Delete Counter 3?". It takes
 * the keyboard when it opens, on its current row's button or else its
 * first, without scrolling, and keeps it: Tab and the arrows move between
 * its buttons as `Interaction.presentedFocusMoveOf` decides, Enter
 * presses, and Escape goes back through the Program. A
 * click on the dimmed backdrop around it goes back one entry too, so the
 * sheet or question closes as if dismissed.
 */
const PresentedScreen = ({
  layer,
  classNames,
}: Readonly<{
  layer: LayerShape
  classNames: PaintClassNames
}>): ReactElement => {
  const bound = useBound()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (root !== null) {
      Option.map(openingButtonOf(enabledButtonsOf(root)), button => {
        button.focus({ preventScroll: true })
      })
    }
  }, [])
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      className="fk-overlay"
      data-style={Navigation.styleTagOf(layer)}
      data-key={layer.key}
      onClick={event => {
        if (event.target === event.currentTarget) {
          Navigation.backOneEntry(bound)
        }
      }}
      onKeyDown={event => {
        const root = ref.current
        const maybeMove = Interaction.presentedFocusMoveOf(
          Interaction.keyInput(event.key, {
            isMeta: event.metaKey,
            isControl: event.ctrlKey,
            isShift: event.shiftKey,
          }),
        )
        if (root !== null && Option.isSome(maybeMove)) {
          const buttons = enabledButtonsOf(root)
          Option.map(
            Array.get(
              buttons,
              steppedIndex(
                Array.findFirstIndex(
                  buttons,
                  button => button === document.activeElement,
                ),
                maybeMove.value,
                buttons.length,
              ),
            ),
            button => {
              event.preventDefault()
              button.focus()
            },
          )
        }
      }}
    >
      <ScreenView entryKey={layer.key} classNames={classNames} />
    </div>
  )
}

const OverlayView = ({
  layer,
  classNames,
}: Readonly<{
  layer: LayerShape
  classNames: PaintClassNames
}>): ReactElement =>
  M.value(layer.kind).pipe(
    M.withReturnType<ReactElement>(),
    M.when('Menu', () => (
      <ScreenView entryKey={layer.key} classNames={classNames} />
    )),
    M.when('Screen', () => (
      <PresentedScreen layer={layer} classNames={classNames} />
    )),
    M.exhaustive,
  )

/**
 * Keeps the browser tab's title on the Program's screen and names the Host
 * it was started on, so `Session | React` and `Session | Svelte` tell two
 * windows apart. While the Program is Starting, the title is its own
 * description, `Starting Counter… | React`.
 *
 * @example
 * ```tsx
 * useDocumentTitle() // 'Counter | React', then 'Session | React'
 * ```
 */
export const useDocumentTitle = (): void => {
  const bound = useBound()
  const title = useBoundRead(bound, bound.windowTitle)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = title
    }
  }, [title])
}

const noClassNames: PaintClassNames = {}

/**
 * Paints the bound Program's navigation frame: the base screen, then each
 * entry presented over it, in order. The action menu paints as an
 * {@link ActionMenuPanel}; any other presented entry paints in a dialog
 * whose `data-style` names its presentation. Each layer repaints only
 * when its own view changes, so typing in the menu leaves the page
 * beneath alone. A text link to one of the Program's URIs, such as
 * `/counter/session`, opens it in the Program instead of loading the
 * page. A Program without a URI paints its screen and its menu instead.
 *
 * @example
 * ```tsx
 * <ProgramProvider bound={bound}>
 *   <NavigationFrame />
 * </ProgramProvider>
 * ```
 */
export const NavigationFrame = ({
  classNames,
}: Readonly<{ classNames?: PaintClassNames }>): ReactElement => {
  const resolvedClassNames = classNames ?? noClassNames
  return Option.match(useFrameShape(), {
    onNone: () => (
      <>
        <Screen classNames={resolvedClassNames} />
        <ActionMenuDialog />
      </>
    ),
    onSome: frame => (
      <div className="fk-frame" data-uri={frame.uri}>
        <ScreenView
          key={frame.base.key}
          entryKey={frame.base.key}
          classNames={resolvedClassNames}
        />
        {Array.map(frame.overlays, layer => (
          <OverlayView
            key={layer.key}
            layer={layer}
            classNames={resolvedClassNames}
          />
        ))}
      </div>
    ),
  })
}

// CARRIER

/**
 * Keeps browser history showing the bound Program's plan while mounted.
 * Every URI is the Program's unless `isCarried` says otherwise; on a URI
 * it does not carry, such as an app's own `/about`, the carrier parks
 * while the Program keeps running. The location at mount is the launch
 * URI; browser Back and Forward reach
 * the Program as `NavigatedBack` and `OpenedUri`. Does nothing where there
 * is no window.
 *
 * @example
 * ```tsx
 * const CounterPage = () => {
 *   useBrowserHistory()
 *   return <NavigationFrame />
 * }
 * ```
 */
export const useBrowserHistory = (
  options: Omit<Navigation.CarrierOptions, 'launchUri'> = {},
): void => {
  const bound = useBound()
  const {
    expectationTimeoutMs,
    reportTimeoutMs,
    maximumCorrections,
    isCarried,
  } = options
  const onDiagnostic = useRef(options.onDiagnostic)
  onDiagnostic.current = options.onDiagnostic
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    return Navigation.runCarrier(
      bound,
      Navigation.browserHistoryDriver(window),
      {
        launchUri: Option.some(Navigation.windowUri(window)),
        ...(isCarried === undefined ? {} : { isCarried }),
        ...(expectationTimeoutMs === undefined ? {} : { expectationTimeoutMs }),
        ...(reportTimeoutMs === undefined ? {} : { reportTimeoutMs }),
        ...(maximumCorrections === undefined ? {} : { maximumCorrections }),
        onDiagnostic: diagnostic => {
          if (onDiagnostic.current !== undefined) {
            onDiagnostic.current(diagnostic)
          }
        },
      },
    )
  }, [
    bound,
    expectationTimeoutMs,
    reportTimeoutMs,
    maximumCorrections,
    isCarried,
  ])
}
