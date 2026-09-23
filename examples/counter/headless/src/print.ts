import {
  App,
  type AppModel,
  type BoundCounter,
  MessageWire,
  type SyncedCounterModel,
  bindCounter,
  counterScreen,
  newProcessorInstance,
  startCounter,
  startCounterOn,
} from 'counter-core-example'
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
  String,
  pipe,
} from 'effect'
import { ActionMenu, Processor, Program } from 'foldkit'
import { renderScreen } from 'foldkit/renderers'

import {
  FoldkitCounterV01,
  Instant,
  InstantLogMessageRecord,
  type SnapshotLogTransport,
} from '@foldkit/instant'

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
const kindWidth = 10
const detailWidth = 9
const columnGap = '  '
const absentCell = '·'

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
  const millis = (createdAtMs % 1000).toString().padStart(3, '0')
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

/** Reads COUNTER_HEADLESS_TIME. Missing or unknown values are human. */
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

const formatStatusRow = (
  kind: string,
  detail: string,
  who: string,
  time: string,
): string =>
  `${padCell(kind, kindWidth)}${columnGap}${padCell(detail, detailWidth)}${columnGap}${padCell(who, whoWidth)}${columnGap}${time}`

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

const statusTimeCell = (options?: HeadlessTimeOptions): string => {
  const clock = statusClock(options)
  if (clock === undefined) {
    if (options?.nowMs === undefined) {
      return absentCell
    }
    return options.nowMs.toString()
  }
  return clock
}

/**
 * The Message name in one tag column. Payload Messages are written as
 * `Tag:{json}`, so `ChoseActionMenuAction:{"tag":"Reset"}` prints
 * `ChoseActionMenuAction`.
 */
export const actionNameOf = (tag: string): string =>
  pipe(tag, String.split(':'), Array.headNonEmpty)

const menuCell = (model: AppModel): string =>
  Option.match(ActionMenu.menuOf(model.navigation), {
    onNone: () => 'Closed',
    onSome: () => 'Open',
  })

const queryCell = (model: AppModel): string =>
  Option.match(ActionMenu.menuOf(model.navigation), {
    onNone: () => absentCell,
    onSome: menu => (String.isEmpty(menu.query) ? absentCell : menu.query),
  })

const focusCell = (model: AppModel): string =>
  Option.match(ActionMenu.menuOf(model.navigation), {
    onNone: () => absentCell,
    onSome: menu =>
      M.value(menu.focus).pipe(
        M.withReturnType<string>(),
        M.tagsExhaustive({
          OnFilter: () => 'filter',
          OnAction: ({ tag }) => tag,
        }),
      ),
  })

const fieldChange = (
  name: string,
  before: string,
  after: string,
): ReadonlyArray<string> =>
  before === after ? [] : [`  ${name}  ${before} → ${after}`]

const modelDiffLines = (
  before: AppModel,
  after: AppModel,
): ReadonlyArray<string> => [
  ...fieldChange('count', before.count.toString(), after.count.toString()),
  ...fieldChange('actionMenu', menuCell(before), menuCell(after)),
  ...fieldChange('focus', focusCell(before), focusCell(after)),
  ...fieldChange('query', queryCell(before), queryCell(after)),
]

/** Prints Starting, Failed, or the live count and screen. */
export const formatHeadlessStatus = (
  model: SyncedCounterModel,
  options?: HeadlessTimeOptions,
): string => {
  const clock = statusClock(options)
  return M.value(model).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Starting: () => withOptionalClock('Starting Instant Counter…', clock),
      Failed: ({ error }) =>
        withOptionalClock(
          Program.describeSyncError(error, message => message._tag),
          clock,
        ),
      Ready: ready =>
        [
          formatStatusRow(
            'count',
            ready.count.toString(),
            absentCell,
            statusTimeCell(options),
          ),
          renderScreen(counterScreen(ready)),
        ].join('\n'),
    }),
  )
}

/** Prints one Instant Message row: action, who, time. */
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
 * Prints one App change the way TCA printChanges does: the Message first,
 * then each Model field that moved.
 */
export const formatPrintChanges = (
  message: HeadlessMessage,
  before: AppModel,
  after: AppModel,
  options?: HeadlessTimeOptions,
): string =>
  Array.match(modelDiffLines(before, after), {
    onEmpty: () => formatHeadlessMessage(message, options),
    onNonEmpty: lines =>
      [formatHeadlessMessage(message, options), ...lines].join('\n'),
  })

/** One headless printer. Status is the live count; the tail is new Messages. */
export type HeadlessPrinter = Readonly<{
  counter: BoundCounter
  lines: () => ReadonlyArray<string>
  stop: () => Promise<void>
}>

type Tail = { model: AppModel }

const pushNewMessage = (
  seen: Set<string>,
  tail: Tail,
  push: (line: string) => void,
  row: unknown,
  options?: HeadlessTimeOptions,
): void => {
  const maybeRecord = S.decodeUnknownOption(InstantLogMessageRecord)(row)
  if (Option.isNone(maybeRecord) || seen.has(maybeRecord.value.id)) {
    return
  }
  const record = maybeRecord.value
  seen.add(record.id)
  Option.match(S.decodeUnknownOption(MessageWire)(record), {
    onNone: () => {
      push(`${formatHeadlessMessage(record, options)}  (unreadable)`)
    },
    onSome: message => {
      const [after] = App.update(tail.model, message)
      push(formatPrintChanges(record, tail.model, after, options))
      tail.model = after
    },
  })
}

const tailTransport = (
  transport: SnapshotLogTransport,
  onRow: (row: unknown) => void,
): (() => void) => {
  const fiber = Effect.runFork(
    transport.subscribe.pipe(
      Stream.runForEach(state =>
        Effect.sync(() => {
          Array.forEach(state.messages, onRow)
        }),
      ),
    ),
  )
  return () => {
    Effect.runFork(Fiber.interrupt(fiber))
  }
}

const tailLiveInstant = (onRow: (row: unknown) => void): (() => void) => {
  const scope = Effect.runSync(Scope.make())
  const engine = Instant({
    app: FoldkitCounterV01,
    processor: Processor.Host.Headless(),
    instance: 'tail',
  })
  Effect.runFork(
    engine
      .subscribe(event => {
        if (event._tag === 'Message') {
          onRow(event.row)
        }
      })
      .pipe(Effect.provideService(Scope.Scope, scope)),
  )
  return () => {
    Effect.runFork(Scope.close(scope, Exit.void))
  }
}

const startPrinterCounter = (
  maybeTransport: Option.Option<SnapshotLogTransport>,
): BoundCounter =>
  bindCounter(
    Option.match(maybeTransport, {
      onNone: () =>
        startCounter({
          host: Processor.Host.Headless(),
          instance: newProcessorInstance(),
        }),
      onSome: transport =>
        startCounterOn(
          Instant({
            app: FoldkitCounterV01,
            processor: Processor.Host.Headless(),
            instance: 'printer',
            transport,
          }),
        ),
    }),
  )

/**
 * Starts the Headless Processor: prints the current count and tails every
 * Message on the tape. Pass `transport` in tests.
 */
export const startHeadlessPrinter = (options?: {
  readonly time?: HeadlessTimeFormat
  readonly timeZone?: string
  readonly transport?: SnapshotLogTransport
}): HeadlessPrinter => {
  const time: HeadlessTimeOptions =
    options?.timeZone === undefined
      ? { format: options?.time ?? 'human' }
      : { format: options?.time ?? 'human', timeZone: options.timeZone }
  const maybeTransport = Option.fromNullishOr(options?.transport)
  const counter = startPrinterCounter(maybeTransport)
  const lines: Array<string> = []
  const seen = new Set<string>()
  const tail: Tail = { model: App.init()[0] }
  const push = (line: string): void => {
    lines.push(line)
  }
  const onRow = (row: unknown): void => {
    pushNewMessage(seen, tail, push, row, time)
  }
  const printStatus = (): void => {
    push(formatHeadlessStatus(counter.readModel(), time))
  }
  const stopWatching = counter.subscribe(printStatus)
  printStatus()
  const stopTail = Option.match(maybeTransport, {
    onNone: () => tailLiveInstant(onRow),
    onSome: transport => tailTransport(transport, onRow),
  })
  return {
    counter,
    lines: () => lines,
    stop: async () => {
      stopWatching()
      stopTail()
      await counter.stop()
    },
  }
}
