import {
  Array,
  Duration,
  Effect,
  Option,
  Order,
  Predicate,
  Queue,
  Record,
  Schema as S,
  Scope,
  Stream,
  pipe,
} from 'effect'

import { titleOf } from '../catalog/catalog.js'
import { fromLabelOf, hostOfFrom, labelOf } from '../processor/host.js'
import {
  type SyncEngine,
  readRowNumber,
  readRowString,
} from '../runtime/syncEngine.js'
import { columnRow } from './layout.js'

// FORMAT

const timeWidth = 10

const appWidth = 14

const instanceWidth = 10

const recentRows = 10

const settleMs = 400

const pad2 = (value: number): string => value.toString().padStart(2, '0')

const clockOf = (createdAtMs: number): string => {
  const date = new Date(createdAtMs)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

const isTagged = (
  value: unknown,
): value is Readonly<{ _tag: unknown }> & object =>
  Predicate.isObject(value) && Predicate.hasProperty(value, '_tag')

const fieldText = (value: unknown): string => {
  if (typeof value === 'string') {
    return `"${value}"`
  } else if (isTagged(value)) {
    return describe(value)
  } else {
    return JSON.stringify(value)
  }
}

const describe = (message: unknown): string => {
  if (!isTagged(message)) {
    return String(message)
  }
  const fields = pipe(
    Record.toEntries(message),
    Array.filter(([key]) => key !== '_tag'),
    Array.map(([key, value]) => `${key} ${fieldText(value)}`),
  )
  return Array.join([titleOf(String(message._tag)), ...fields], '  ')
}

const clientLabelOf = (row: unknown): Option.Option<string> =>
  Option.map(Option.flatMap(readRowString(row, 'client'), hostOfFrom), labelOf)

const nonEmptyRowField = (row: unknown, key: string): Option.Option<string> =>
  Option.filter(
    Option.map(readRowString(row, key), value => value.trim()),
    value => value !== '',
  )

const metadataTagOf = (row: unknown): Option.Option<string> => {
  const parts = Array.getSomes([
    nonEmptyRowField(row, 'browser'),
    nonEmptyRowField(row, 'windowLabel'),
    nonEmptyRowField(row, 'appVersion'),
    nonEmptyRowField(row, 'userEmail'),
  ])
  return Array.isReadonlyArrayNonEmpty(parts)
    ? Option.some(`[${Array.join(parts, ' · ')}]`)
    : Option.none()
}

/**
 * One log row as a tail line: when it landed, the client it was pressed on,
 * the instance of the Processor that wrote it, optional client metadata
 * (browser, window/tab label, app/build version, user email) when present,
 * and the Message as words with its fields. The client is the one the row
 * names when it was sent on behalf of a client on another Host, such as a
 * `books tui` view whose keys the CLI daemon sends, and otherwise the
 * Processor's own Host. A row the Program cannot read shows its raw tag.
 *
 * @example
 * ```typescript
 * formatTailRow(SyncedCounter.message, row)
 * // '00:53:05  React         ad55df2e  [Chrome · Tab 1 · v0.131.0 · user@example.com]  Increment'
 * // '00:53:09  CLI           4f2a9c1e  Changed action menu query  query "re"'
 * // '00:53:12  TUI           4f2a9c1e  [v0.131.0 · user@example.com]  Moved action menu focus  move "Next"'
 * ```
 */
export const formatTailRow = (
  messageSchema: S.Decoder<unknown>,
  row: unknown,
): ReadonlyArray<string> => {
  const writer = fromLabelOf(
    Option.getOrElse(readRowString(row, 'from'), () => ''),
  )
  const app = Option.getOrElse(clientLabelOf(row), () => writer.app)
  const { instance } = writer
  const time = Option.match(readRowNumber(row, 'createdAtMs'), {
    onNone: () => '',
    onSome: clockOf,
  })
  const text = Option.match(S.decodeUnknownOption(messageSchema)(row), {
    onNone: () => Option.getOrElse(readRowString(row, 'tag'), () => '?'),
    onSome: describe,
  })
  const body = Option.match(metadataTagOf(row), {
    onNone: () => text,
    onSome: metadata => `${metadata}  ${text}`,
  })
  return columnRow(
    [time, app, instance],
    [timeWidth, appWidth, instanceWidth],
    body,
  )
}

// TAIL

const createdAtOrder = Order.mapInput(Order.Number, (row: unknown) =>
  Option.getOrElse(readRowNumber(row, 'createdAtMs'), () => 0),
)

/**
 * Prints every Message as it lands on the log, from every device: first
 * the last ten for context, then each new one. It never applies a
 * Message; it only reads the engine's live feed, so it shows exactly what
 * every Processor receives.
 *
 * @example
 * ```typescript
 * runProgramTail(engine, SyncedCounter.message, line => console.log(line))
 * // 00:53:05  React         ad55df2e  Increment
 * // 00:53:06  OpenTUI       9c1e4f2a  Opened action menu
 * ```
 */
export const runProgramTail = (
  engine: SyncEngine,
  messageSchema: S.Decoder<unknown>,
  write: (line: string) => void,
  startingRows: ReadonlyArray<unknown> = [],
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const seen = new Set<string>(
      Array.getSomes(
        Array.map(startingRows, row =>
          Option.filter(readRowString(row, 'id'), id => id !== ''),
        ),
      ),
    )
    const pending: Array<unknown> = [...startingRows]
    let isSettled = false
    const writeRow = (row: unknown): void => {
      Array.forEach(formatTailRow(messageSchema, row), write)
    }
    yield* engine.subscribe(event => {
      if (event._tag !== 'Message') {
        return
      }
      const maybeId = Option.filter(
        readRowString(event.row, 'id'),
        id => id !== '',
      )
      if (Option.isSome(maybeId)) {
        if (seen.has(maybeId.value)) {
          return
        }
        seen.add(maybeId.value)
      }
      if (isSettled) {
        writeRow(event.row)
      } else {
        pending.push(event.row)
      }
    })
    yield* Effect.sleep(Duration.millis(settleMs))
    isSettled = true
    Array.forEach(
      Array.takeRight(Array.sort(pending, createdAtOrder), recentRows),
      writeRow,
    )
  })

/**
 * {@link runProgramTail} as a Stream of its lines, for a Background
 * Processor to serve as a topic a view follows, such as the log of a
 * made-up library that lives only in the processor that holds it. The
 * last ten come from the rows the engine holds when the view connects,
 * since an engine's live feed may start with none of them.
 *
 * @example
 * ```typescript
 * const followings = { log: () => followProgramTail(engine, SyncedCounter.message) }
 * // books tail on a made-up library:
 * // 00:53:06  TUI           9c1e4f2a  Opened action menu
 * ```
 */
export const followProgramTail = (
  engine: SyncEngine,
  messageSchema: S.Decoder<unknown>,
): Stream.Stream<string> =>
  Stream.callback<string>(queue =>
    Effect.flatMap(
      Effect.orElseSucceed(
        Effect.map(engine.read(), read => read.messages),
        () => [],
      ),
      startingRows =>
        runProgramTail(
          engine,
          messageSchema,
          line => {
            Queue.offerUnsafe(queue, line)
          },
          startingRows,
        ),
    ),
  )
