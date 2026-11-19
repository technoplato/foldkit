import type { Telemetry } from 'foldkit'
import {
  Profiler,
  type ProfilerOnRenderCallback,
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
} from 'react'

import type { LaidOut } from './stalls.js'

// PAINT REPORTER

type RecordPaint = (render: Telemetry.RenderReport) => void

const RecordPaintContext = createContext<RecordPaint | undefined>(undefined)

type NoteLaidOut = (entry: LaidOut) => void

const NoteLaidOutContext = createContext<NoteLaidOut | undefined>(undefined)

const PartNameContext = createContext<string | undefined>(undefined)

type Counts = Readonly<{ passages?: number; rows?: number }>

const noCounts: Counts = {}

const nowMs = (): number => Date.now()

// NOTE: a build that carries its own code has no profiler, so a part
// times itself: from when it renders to when what it rendered is
// committed. React renders a part's children inside that span, so the
// figure is the part with everything under it.
const useTimedNote = (
  note: NoteLaidOut | undefined,
  maybePart: string | undefined,
  counts: Counts,
): void => {
  const startedAt = useRef(0)
  const laidOut = useRef(counts)
  startedAt.current = nowMs()
  laidOut.current = counts
  useLayoutEffect(() => {
    if (note !== undefined && maybePart !== undefined) {
      note({
        part: maybePart,
        ms: nowMs() - startedAt.current,
        ...laidOut.current,
      })
    }
  })
}

/**
 * Tells the record of held threads that a part of a screen was laid out
 * just now: how long it took from its render to its commit, and how much
 * it laid out, a reader its passages, a list its rows. It reaches the
 * nearest {@link PaintReporter} that was given `laidOut`, under the name
 * of the nearest {@link PaintedPart}; anywhere else it does nothing.
 *
 * @example
 * ```tsx
 * useLaidOut({ passages: passages.length })
 * ```
 */
export const useLaidOut = (counts: Counts): void => {
  useTimedNote(
    useContext(NoteLaidOutContext),
    useContext(PartNameContext),
    counts,
  )
}

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
 * Given `laidOut`, it is also told each time a named part is laid out,
 * and how many passages or rows a reader or a list in it had, so a
 * record of a held thread can say what was on its way to the screen.
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
  laidOut,
  children,
}: Readonly<{
  record?: RecordPaint
  laidOut?: NoteLaidOut
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
    <NoteLaidOutContext.Provider value={laidOut}>
      <RecordPaintContext.Provider value={record}>
        <Profiler id="foldkit" onRender={onRender}>
          {children}
        </Profiler>
      </RecordPaintContext.Provider>
    </NoteLaidOutContext.Provider>
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
  const noteLaidOut = useContext(NoteLaidOutContext)
  useTimedNote(noteLaidOut, name, noCounts)
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
  return (
    <PartNameContext.Provider value={name}>
      {record === undefined ? (
        children
      ) : (
        <Profiler id={name} onRender={onRender}>
          {children}
        </Profiler>
      )}
    </PartNameContext.Provider>
  )
}
