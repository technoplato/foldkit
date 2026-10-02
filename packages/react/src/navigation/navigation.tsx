import { Array, Match as M, Option, String } from 'effect'
import { Navigation } from 'foldkit'
import type { ButtonNode } from 'foldkit/renderers'
import { type ReactElement, useEffect, useMemo } from 'react'

import {
  ActionMenuDialog,
  ActionMenuPanel,
  type AnyBound,
  type PaintClassNames,
  Screen,
  useBound,
} from '../interaction/interaction.js'
import { useBoundRead } from '../interaction/selected.js'
import { paintTree } from '../paintReact/paintReact.js'

// FRAME

/**
 * The navigation frame the bound Program shows now: where it is, the base
 * screen, and every entry presented over it. It keeps its reference while
 * the frame is unchanged, so a count change on a hidden page does not
 * repaint the page on top.
 */
export const useNavigationFrame = (): Option.Option<Navigation.Frame> => {
  const bound = useBound()
  return useBoundRead(bound, () => Navigation.frameOf(bound))
}

/**
 * The bound Program's carrier plan, None until it is Ready or for a
 * Program without a URI. A native stack renders one route per entry.
 */
export const useNavigationPlan = (): Option.Option<
  Navigation.CarrierPlan<unknown>
> => {
  const bound = useBound()
  return useBoundRead(bound, bound.navigation)
}

/**
 * What one stack entry paints, by key. A native stack screen reads its own
 * entry, so pushing a page above it does not repaint it.
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

const openInApp =
  (bound: AnyBound) =>
  (href: string): boolean =>
    String.startsWith('/')(href) && bound.openUri(href, Navigation.Link())

const ScreenView = ({
  layer,
  classNames,
}: Readonly<{
  layer: Navigation.FrameLayer
  classNames: PaintClassNames
}>): ReactElement | null => {
  const bound = useBound()
  return useMemo(
    () =>
      M.value(layer.view).pipe(
        M.withReturnType<ReactElement | null>(),
        M.tagsExhaustive({
          Screen: ({ node }) =>
            paintTree(node, {
              classNames,
              onPress: pressOf(bound),
              onLink: openInApp(bound),
            }),
          Menu: ({ menu }) => <ActionMenuPanel menu={menu} />,
        }),
      ),
    [bound, layer, classNames],
  )
}

const styleTagOf = (layer: Navigation.FrameLayer): string =>
  Option.match(layer.maybeStyle, {
    onNone: () => 'Root',
    onSome: style => style._tag,
  })

const OverlayView = ({
  layer,
  classNames,
}: Readonly<{
  layer: Navigation.FrameLayer
  classNames: PaintClassNames
}>): ReactElement | null =>
  M.value(layer.view).pipe(
    M.withReturnType<ReactElement | null>(),
    M.tagsExhaustive({
      Menu: () => <ScreenView layer={layer} classNames={classNames} />,
      Screen: () => (
        <div
          role="dialog"
          aria-modal="true"
          className="fk-overlay"
          data-style={styleTagOf(layer)}
          data-key={layer.key}
        >
          <ScreenView layer={layer} classNames={classNames} />
        </div>
      ),
    }),
  )

const noClassNames: PaintClassNames = {}

/**
 * Paints the bound Program's navigation frame: the base screen, then each
 * entry presented over it, in order. The action menu paints as an
 * {@link ActionMenuPanel}; any other presented entry paints in a dialog
 * whose `data-style` names its presentation. A text link to an in-app
 * path, such as `/counter/session`, opens it in the Program instead of
 * loading the page. A Program without a URI paints its screen and its
 * menu instead.
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
  return Option.match(useNavigationFrame(), {
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
          layer={frame.base}
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
 * The location at mount is the launch URI; browser Back and Forward reach
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
  const { expectationTimeoutMs, reportTimeoutMs, maximumCorrections } = options
  const onDiagnostic = options.onDiagnostic
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    return Navigation.runCarrier(
      bound,
      Navigation.browserHistoryDriver(window),
      {
        launchUri: Option.some(Navigation.windowUri(window)),
        ...(expectationTimeoutMs === undefined ? {} : { expectationTimeoutMs }),
        ...(reportTimeoutMs === undefined ? {} : { reportTimeoutMs }),
        ...(maximumCorrections === undefined ? {} : { maximumCorrections }),
        ...(onDiagnostic === undefined ? {} : { onDiagnostic }),
      },
    )
  }, [
    bound,
    expectationTimeoutMs,
    reportTimeoutMs,
    maximumCorrections,
    onDiagnostic,
  ])
}
