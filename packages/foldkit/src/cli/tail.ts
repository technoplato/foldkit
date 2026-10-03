import {
  Array,
  Duration,
  Effect,
  Option,
  Order,
  Predicate,
  Record,
  Schema as S,
  Scope,
  pipe,
} from 'effect'

import { titleOf } from '../catalog/catalog.js'
import { hostOfFrom, labelOf, print } from '../processor/host.js'
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

const appAndInstanceOf = (
  from: string,
): Readonly<{ app: string; instance: string }> =>
  Option.match(hostOfFrom(from), {
    onNone: () => ({ app: from, instance: '' }),
    onSome: host => ({
      app: labelOf(host),
      instance: from.slice(print(host).length + 1),
    }),
  })

const fieldText = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : JSON.stringify(value)

const describe = (message: unknown): string => {
  if (!Predicate.isObject(message) || !Predicate.hasProperty(message, '_tag')) {
    return String(message)
  }
  const fields = pipe(
    Record.toEntries(message),
    Array.filter(([key]) => key !== '_tag'),
    Array.map(([key, value]) => `${key} ${fieldText(value)}`),
  )
  return Array.join([titleOf(String(message._tag)), ...fields], '  ')
}

/**
 * One log row as a tail line that fits 80 columns: when it landed, which
 * app wrote it, that app's instance, and the Message as words with its
 * fields. A row the Program cannot read shows its raw tag.
 *
 * @example
 * ```typescript
 * formatTailRow(SyncedCounter.message, row)
 * // '00:53:05  React         ad55df2e  Increment'
 * // '00:53:09  CLI           4f2a9c1e  Changed action menu query  query "re"'
 * ```
 */
export const formatTailRow = (
  messageSchema: S.Decoder<unknown>,
  row: unknown,
): ReadonlyArray<string> => {
  const { app, instance } = appAndInstanceOf(
    Option.getOrElse(readRowString(row, 'from'), () => ''),
  )
  const time = Option.match(readRowNumber(row, 'createdAtMs'), {
    onNone: () => '',
    onSome: clockOf,
  })
  const text = Option.match(S.decodeUnknownOption(messageSchema)(row), {
    onNone: () => Option.getOrElse(readRowString(row, 'tag'), () => '?'),
    onSome: describe,
  })
  return columnRow(
    [time, app, instance],
    [timeWidth, appWidth, instanceWidth],
    text,
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
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const seen = new Set<string>()
    const pending: Array<unknown> = []
    let isSettled = false
    const writeRow = (row: unknown): void => {
      Array.forEach(formatTailRow(messageSchema, row), write)
    }
    yield* engine.subscribe(event => {
      if (event._tag !== 'Message') {
        return
      }
      const id = Option.getOrElse(readRowString(event.row, 'id'), () => '')
      if (seen.has(id)) {
        return
      }
      seen.add(id)
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
