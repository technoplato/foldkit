import type { Telemetry } from 'foldkit'
import {
  Profiler,
  type ProfilerOnRenderCallback,
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
} from 'react'

// PAINT REPORTER

type RecordPaint = (render: Telemetry.RenderReport) => void

const RecordPaintContext = createContext<RecordPaint | undefined>(undefined)

/** The painter every paint a phone reports is named for. */
export const reactNativePainter = 'ReactNative'

/**
 * The painter name of one part of the app, such as one screen:
 * `ReactNative/TitlePage`.
 *
 * @example
 * ```typescript
 * painterOf('TitlePage') // 'ReactNative/TitlePage'
 * ```
 */
export const painterOf = (part: string): string =>
  `${reactNativePainter}/${part}`

/**
 * Reports each paint of what it wraps to telemetry: how long React took,
 * and whether it was the first paint or an update, as the web's host
 * reports its own. What it wraps can report its own parts by name with
 * {@link PaintedPart}. With no `record` it only shows its children.
 *
 * @example
 * ```tsx
 * <PaintReporter record={telemetry.recordRendered}>
 *   <FoldkitRouterStack />
 * </PaintReporter>
 * ```
 */
export const PaintReporter = ({
  record,
  children,
}: Readonly<{
  record?: RecordPaint
  children: ReactNode
}>): ReactElement => {
  const onRender = useCallback<ProfilerOnRenderCallback>(
    (_id, phase, actualDuration) => {
      record?.({
        painter: reactNativePainter,
        durationMs: actualDuration,
        phase,
      })
    },
    [record],
  )
  return (
    <RecordPaintContext.Provider value={record}>
      <Profiler id="foldkit" onRender={onRender}>
        {children}
      </Profiler>
    </RecordPaintContext.Provider>
  )
}

/**
 * Reports the paints of one named part of the app, such as one screen of
 * a stack, to the nearest {@link PaintReporter}, so a trace says which
 * screen a slow paint was. Outside a reporter it only shows its children.
 *
 * @example
 * ```tsx
 * <PaintedPart name="TitlePage">{screen}</PaintedPart>
 * ```
 */
export const PaintedPart = ({
  name,
  children,
}: Readonly<{ name: string; children: ReactNode }>): ReactElement => {
  const record = useContext(RecordPaintContext)
  const onRender = useCallback<ProfilerOnRenderCallback>(
    (_id, phase, actualDuration) => {
      record?.({
        painter: painterOf(name),
        durationMs: actualDuration,
        phase,
      })
    },
    [record, name],
  )
  return record === undefined ? (
    <>{children}</>
  ) : (
    <Profiler id={name} onRender={onRender}>
      {children}
    </Profiler>
  )
}
