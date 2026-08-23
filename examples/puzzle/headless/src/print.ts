import {
  Array,
  Effect,
  Exit,
  Fiber,
  Match as M,
  Option,
  Schema as S,
  Scope,
  Stream,
} from 'effect'
import { Processor, Program } from 'foldkit'
import { renderScreen } from 'foldkit/renderers'
import {
  App,
  type AppMessage,
  type AppModel,
  MessageWire,
  type SnapshotLogTransport,
  type SyncedPuzzleHandle,
  describePuzzleSyncError,
  puzzleScreen,
  startLivePuzzle,
  uriOf,
} from 'puzzle-core-example'
import { FoldkitPuzzleV01, Instant } from 'puzzle-core-example'

import { InstantLogMessageRecord } from '@foldkit/instant'

/** One Instant Message row printed by the headless tail. */
export type HeadlessMessage = InstantLogMessageRecord

/** How the headless tail prints `createdAtMs`. */
export type HeadlessTimeFormat = 'ms' | 'human' | 'both' | 'verbose'

/** Clock options for one printed line. */
export type HeadlessTimeOptions = Readonly<{
  format?: HeadlessTimeFormat
  nowMs?: number
  timeZone?: string
}>

const actionWidth = 32
const whoWidth = 12
const columnGap = '  '
const absentCell = '·'
const selectionPrefix = 'ActionCommandMenuSelectionMade:'
const focusPrefix = 'ActionMenuFocusMoved:'
const queryPrefix = 'ActionMenuQueryChanged:'

const partValue = (
  parts: ReadonlyArray<Intl.DateTimeFormatPart>,
  type: Intl.DateTimeFormatPartTypes,
): string => {
  const maybePart = Array.findFirst(parts, part => part.type === type)
  if (Option.isNone(maybePart)) {
    return ''
  }
  return maybePart.value.value
}

const clockParts = (
  createdAtMs: number,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): ReadonlyArray<Intl.DateTimeFormatPart> =>
  new Intl.DateTimeFormat('en-US', {
    ...options,
    timeZone,
  }).formatToParts(new Date(createdAtMs))

const formatClockTime = (
  parts: ReadonlyArray<Intl.DateTimeFormatPart>,
): string => {
  const hour = partValue(parts, 'hour')
  const minute = partValue(parts, 'minute')
  const second = partValue(parts, 'second')
  const dayPeriod = partValue(parts, 'dayPeriod')
  return `${hour}:${minute}:${second} ${dayPeriod}`
}

/** Short local clock. 1:52:44 PM */
export const formatHeadlessHumanClock = (
  createdAtMs: number,
  timeZone?: string,
): string =>
  formatClockTime(
    clockParts(createdAtMs, timeZone, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }),
  )

/** Long local clock. Thursday, August 20, 2026, 4:26:35.679 PM */
export const formatHeadlessVerboseClock = (
  createdAtMs: number,
  timeZone?: string,
): string => {
  const parts = clockParts(createdAtMs, timeZone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  const millis = String(createdAtMs % 1000).padStart(3, '0')
  const weekday = partValue(parts, 'weekday')
  const month = partValue(parts, 'month')
  const day = partValue(parts, 'day')
  const year = partValue(parts, 'year')
  const hour = partValue(parts, 'hour')
  const minute = partValue(parts, 'minute')
  const second = partValue(parts, 'second')
  const dayPeriod = partValue(parts, 'dayPeriod')
  return `${weekday}, ${month} ${day}, ${year}, ${hour}:${minute}:${second}.${millis} ${dayPeriod}`
}

/** Reads PUZZLE_HEADLESS_TIME. Missing or unknown values are human. */
export const parseHeadlessTimeFormat = (
  value: string | undefined,
): HeadlessTimeFormat => {
  if (
    value === 'ms' ||
    value === 'human' ||
    value === 'both' ||
    value === 'verbose'
  ) {
    return value
  }
  return 'human'
}

/** Prints createdAtMs as unix ms, a short clock, both, or a verbose clock. */
export const formatHeadlessClock = (
  createdAtMs: number,
  options?: HeadlessTimeOptions,
): string => {
  const format = options?.format ?? 'ms'
  if (format === 'ms') {
    return createdAtMs.toString()
  }
  if (format === 'verbose') {
    return formatHeadlessVerboseClock(createdAtMs, options?.timeZone)
  }
  const human = formatHeadlessHumanClock(createdAtMs, options?.timeZone)
  if (format === 'human') {
    return human
  }
  return `${human}  ${createdAtMs.toString()}`
}

const padCell = (value: string, width: number): string => {
  if (value.length === width) {
    return value
  }
  if (value.length < width) {
    return value.padEnd(width)
  }
  return value.slice(0, width)
}

const formatHeadlessRow = (action: string, who: string, time: string): string =>
  `${padCell(action, actionWidth)}${columnGap}${padCell(who, whoWidth)}${columnGap}${time}`

const withOptionalClock = (body: string, clock: string | undefined): string => {
  if (clock === undefined) {
    return body
  }
  return `${body}  ${clock}`
}

const statusClock = (options?: HeadlessTimeOptions): string | undefined => {
  const format = options?.format ?? 'ms'
  if (format === 'ms') {
    return undefined
  }
  return formatHeadlessClock(options?.nowMs ?? Date.now(), options)
}

const actionNameOf = (tag: string): string => {
  if (tag.startsWith(selectionPrefix)) {
    return 'ActionCommandMenuSelectionMade'
  }
  if (tag.startsWith(focusPrefix)) {
    return 'ActionMenuFocusMoved'
  }
  if (tag.startsWith(queryPrefix)) {
    return 'ActionMenuQueryChanged'
  }
  return tag
}

const queryCell = (menu: AppModel['actionMenu']): string => {
  if (menu._tag === 'Closed') {
    return absentCell
  }
  return Option.getOrElse(menu.maybeQuery, () => absentCell)
}

const menuCell = (menu: AppModel['actionMenu']): string => menu._tag

const modelDiffLines = (
  before: AppModel,
  after: AppModel,
): ReadonlyArray<string> => {
  const lines: Array<string> = []
  const beforeUri = uriOf(before.product)
  const afterUri = uriOf(after.product)
  if (beforeUri !== afterUri) {
    lines.push(`  tape  ${beforeUri} → ${afterUri}`)
  }
  if (menuCell(before.actionMenu) !== menuCell(after.actionMenu)) {
    lines.push(
      `  actionMenu  ${menuCell(before.actionMenu)} → ${menuCell(after.actionMenu)}`,
    )
  }
  if (
    before.actionMenu._tag === 'Open' &&
    after.actionMenu._tag === 'Open' &&
    before.actionMenu.focus !== after.actionMenu.focus
  ) {
    lines.push(
      `  focus  ${before.actionMenu.focus.toString()} → ${after.actionMenu.focus.toString()}`,
    )
  }
  if (queryCell(before.actionMenu) !== queryCell(after.actionMenu)) {
    lines.push(
      `  maybeQuery  ${queryCell(before.actionMenu)} → ${queryCell(after.actionMenu)}`,
    )
  }
  return lines
}

/** Prints Starting, Failed, or the Program screen tree. */
export const formatHeadlessStatus = (
  snapshot: Program.SyncedModel<AppModel, AppMessage>,
  options?: HeadlessTimeOptions,
): string => {
  const clock = statusClock(options)
  return M.value(snapshot).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Starting: () => withOptionalClock('Starting Instant Puzzle…', clock),
      Failed: ({ error }) =>
        withOptionalClock(describePuzzleSyncError(error), clock),
      Ready: ({ product }) => {
        const painted = renderScreen(puzzleScreen(product))
        if (clock === undefined) {
          return painted
        }
        return `${painted}\n${clock}`
      },
    }),
  )
}

/** Prints one Instant Message row. Action, who, time. */
export const formatHeadlessMessage = (
  message: HeadlessMessage,
  options?: HeadlessTimeOptions,
): string =>
  formatHeadlessRow(
    actionNameOf(message.tag),
    message.from,
    formatHeadlessClock(message.createdAtMs, options),
  )

/**
 * Prints one composed App change the way TCA printChanges does.
 * Action first, then each Model field that moved.
 */
export const formatPrintChanges = (
  message: HeadlessMessage,
  before: AppModel,
  after: AppModel,
  options?: HeadlessTimeOptions,
): string => {
  const header = formatHeadlessMessage(message, options)
  const diffs = modelDiffLines(before, after)
  return Array.match(diffs, {
    onEmpty: () => header,
    onNonEmpty: lines => [header, ...lines].join('\n'),
  })
}

/** One headless printer. Status is the Program screen tree. Tail is new Messages. */
export type HeadlessPrinter = Readonly<{
  handle: SyncedPuzzleHandle
  lines: () => ReadonlyArray<string>
  stop: () => void
}>

const decodeAppMessage = (message: HeadlessMessage): AppMessage =>
  S.decodeUnknownSync(MessageWire)({
    createdAtMs: message.createdAtMs,
    from: message.from,
    id: message.id,
    tag: message.tag,
  })

const pushNewMessage = (
  seen: Set<string>,
  previous: { model: AppModel },
  push: (line: string) => void,
  row: unknown,
  options?: HeadlessTimeOptions,
): void => {
  const maybeMessage = S.decodeUnknownOption(InstantLogMessageRecord)(row)
  if (Option.isNone(maybeMessage)) {
    return
  }
  const message = maybeMessage.value
  if (seen.has(message.id)) {
    return
  }
  seen.add(message.id)
  const decoded = decodeAppMessage(message)
  const [after] = App.update(previous.model, decoded)
  push(formatPrintChanges(message, previous.model, after, options))
  previous.model = after
}

const tailTransport = (
  transport: SnapshotLogTransport,
  seen: Set<string>,
  previous: { model: AppModel },
  push: (line: string) => void,
  options?: HeadlessTimeOptions,
): (() => void) => {
  const fiber = Effect.runFork(
    transport.subscribe.pipe(
      Stream.runForEach(state =>
        Effect.sync(() => {
          for (const message of state.messages) {
            pushNewMessage(seen, previous, push, message, options)
          }
        }),
      ),
    ),
  )
  return () => {
    Effect.runFork(Fiber.interrupt(fiber))
  }
}

const tailLiveInstant = (
  seen: Set<string>,
  previous: { model: AppModel },
  push: (line: string) => void,
  options?: HeadlessTimeOptions,
): (() => void) => {
  const scope = Effect.runSync(Scope.make())
  const engine = Instant({
    app: FoldkitPuzzleV01,
    processor: Processor.Host.Headless(),
    instance: 'tail',
  })
  Effect.runFork(
    engine
      .subscribe(event => {
        if (event._tag === 'Message') {
          pushNewMessage(seen, previous, push, event.row, options)
        }
      })
      .pipe(Effect.provideService(Scope.Scope, scope)),
  )
  return () => {
    Effect.runFork(Scope.close(scope, Exit.void))
  }
}

/**
 * Starts the Headless Processor. Prints the Program screen. Tails Messages.
 */
export const startHeadlessPrinter = (options?: {
  readonly time?: HeadlessTimeFormat
  readonly timeZone?: string
  readonly transport?: SnapshotLogTransport
}): HeadlessPrinter => {
  const time: HeadlessTimeOptions =
    options?.timeZone === undefined
      ? { format: options?.time ?? 'human' }
      : {
          format: options?.time ?? 'human',
          timeZone: options.timeZone,
        }
  const handle = startLivePuzzle(
    Processor.Host.Headless(),
    options?.transport === undefined
      ? undefined
      : { transport: options.transport },
  )
  const lines: Array<string> = []
  const seen = new Set<string>()
  const previous = { model: App.init()[0] }
  const push = (line: string): void => {
    lines.push(line)
  }
  const printStatus = (): void => {
    push(formatHeadlessStatus(handle.readModel(), time))
  }
  const stopSubscribe = handle.subscribe(printStatus)
  printStatus()
  const stopTail =
    options?.transport === undefined
      ? tailLiveInstant(seen, previous, push, time)
      : tailTransport(options.transport, seen, previous, push, time)
  return {
    handle,
    lines: () => lines,
    stop: () => {
      stopSubscribe()
      stopTail()
      handle.stop()
    },
  }
}
