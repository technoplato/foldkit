import type { Telemetry } from 'foldkit'
import {
  Profiler,
  type ProfilerOnRenderCallback,
  type ReactElement,
  type ReactNode,
  useCallback,
} from 'react'

// PAINT REPORTER

/**
 * Reports each paint of what it wraps to telemetry: how long React took,
 * and whether it was the first paint or an update, as the web's host
 * reports its own. With no `record` it only shows its children.
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
  record?: (render: Telemetry.RenderReport) => void
  children: ReactNode
}>): ReactElement => {
  const onRender = useCallback<ProfilerOnRenderCallback>(
    (_id, phase, actualDuration) => {
      record?.({
        painter: 'ReactNative',
        durationMs: actualDuration,
        phase,
      })
    },
    [record],
  )
  return (
    <Profiler id="foldkit" onRender={onRender}>
      {children}
    </Profiler>
  )
}
