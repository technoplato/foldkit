import {
  Array as Array_,
  Data,
  Effect,
  Match as M,
  Option,
  Schema as S,
  String as String_,
} from 'effect'

import {
  Message,
  RequestedDecrement,
  RequestedIncrement,
  RequestedReset,
} from './counter.js'

const MAX_TAPE_BYTES = 65536
const FETCH_TIMEOUT_MILLISECONDS = 5000

export const CounterTapeStep = S.Literals(['Increment', 'Decrement', 'Reset'])
export type CounterTapeStep = typeof CounterTapeStep.Type

export const CounterTapeActionEntry = S.Struct({
  _tag: S.Literal('Action'),
  label: S.String,
  step: CounterTapeStep,
})
export type CounterTapeActionEntry = typeof CounterTapeActionEntry.Type

export const CounterTapeExpectEntry = S.Struct({
  _tag: S.Literal('Expect'),
  count: S.Number,
  label: S.String,
})
export type CounterTapeExpectEntry = typeof CounterTapeExpectEntry.Type

export const CounterTapeSnapshotEntry = S.Struct({
  _tag: S.Literal('Snapshot'),
  label: S.String,
})
export type CounterTapeSnapshotEntry = typeof CounterTapeSnapshotEntry.Type

export const CounterTapeFinalEntry = S.Struct({
  _tag: S.Literal('Final'),
  count: S.Number,
  label: S.String,
})
export type CounterTapeFinalEntry = typeof CounterTapeFinalEntry.Type

export const CounterTapeEntry = S.Union([
  CounterTapeActionEntry,
  CounterTapeExpectEntry,
  CounterTapeSnapshotEntry,
  CounterTapeFinalEntry,
])
export type CounterTapeEntry = typeof CounterTapeEntry.Type

/** Error raised while loading or parsing a Counter XML tape. */
export class CounterTapeError extends Data.TaggedError('CounterTapeError')<{
  readonly reason: string
}> {}

const counterMessageForTapeStep = (step: CounterTapeStep): Message =>
  M.value(step).pipe(
    M.withReturnType<Message>(),
    M.when('Increment', () => RequestedIncrement()),
    M.when('Decrement', () => RequestedDecrement()),
    M.when('Reset', () => RequestedReset()),
    M.exhaustive,
  )

/** Returns the Counter Message represented by a tape action entry. */
export const messageForCounterTapeEntry = (
  entry: CounterTapeEntry,
): Option.Option<Message> =>
  M.value(entry).pipe(
    M.withReturnType<Option.Option<Message>>(),
    M.tagsExhaustive({
      Action: ({ step }) => Option.some(counterMessageForTapeStep(step)),
      Expect: () => Option.none(),
      Final: () => Option.none(),
      Snapshot: () => Option.none(),
    }),
  )

const stepForOperation = (
  operation: string,
): Option.Option<CounterTapeStep> => {
  const normalizedOperation = operation.trim().toLowerCase()
  return M.value(normalizedOperation).pipe(
    M.withReturnType<Option.Option<CounterTapeStep>>(),
    M.when('increment', () => Option.some('Increment')),
    M.when('requestedincrement', () => Option.some('Increment')),
    M.when('decrement', () => Option.some('Decrement')),
    M.when('requesteddecrement', () => Option.some('Decrement')),
    M.when('reset', () => Option.some('Reset')),
    M.when('requestedreset', () => Option.some('Reset')),
    M.orElse(() => Option.none()),
  )
}

const attributeValue = (
  attributes: string,
  names: ReadonlyArray<string>,
): Option.Option<string> => {
  const attributePattern =
    /(?<name>[A-Za-z][A-Za-z0-9:_-]*)\s*=\s*(?:"(?<doubleQuotedValue>[^"]*)"|'(?<singleQuotedValue>[^']*)')/gu

  for (const match of attributes.matchAll(attributePattern)) {
    const name = match.groups?.['name']?.toLowerCase()
    const value =
      match.groups?.['doubleQuotedValue'] ??
      match.groups?.['singleQuotedValue'] ??
      ''
    if (
      name !== undefined &&
      names.includes(name) &&
      String_.isNonEmpty(value)
    ) {
      return Option.some(value)
    }
  }

  return Option.none()
}

const integerAttributeValue = (
  attributes: string,
  name: string,
): Option.Option<number> => {
  const maybeValue = attributeValue(attributes, [name])
  if (Option.isNone(maybeValue)) {
    return Option.none()
  }

  const parsedValue = Number.parseInt(maybeValue.value, 10)
  if (Number.isInteger(parsedValue)) {
    return Option.some(parsedValue)
  } else {
    return Option.none()
  }
}

const labelForStep = (step: CounterTapeStep): string =>
  M.value(step).pipe(
    M.withReturnType<string>(),
    M.when('Increment', () => 'action increment'),
    M.when('Decrement', () => 'action decrement'),
    M.when('Reset', () => 'action reset'),
    M.exhaustive,
  )

const maybeEntryForElement = (
  tag: string,
  attributes: string,
): Option.Option<CounterTapeEntry> => {
  const normalizedTag = tag.toLowerCase()

  if (
    normalizedTag === 'counter-message' ||
    normalizedTag === 'message' ||
    normalizedTag === 'step' ||
    normalizedTag === 'action'
  ) {
    const maybeOperation = attributeValue(attributes, [
      'name',
      'operation',
      'type',
    ])
    if (Option.isSome(maybeOperation)) {
      const maybeStep = stepForOperation(maybeOperation.value)
      if (Option.isSome(maybeStep)) {
        return Option.some(
          CounterTapeActionEntry.make({
            _tag: 'Action',
            label: labelForStep(maybeStep.value),
            step: maybeStep.value,
          }),
        )
      }
    }
  } else if (
    normalizedTag === 'increment' ||
    normalizedTag === 'decrement' ||
    normalizedTag === 'reset'
  ) {
    const maybeStep = stepForOperation(normalizedTag)
    if (Option.isSome(maybeStep)) {
      return Option.some(
        CounterTapeActionEntry.make({
          _tag: 'Action',
          label: labelForStep(maybeStep.value),
          step: maybeStep.value,
        }),
      )
    }
  } else if (normalizedTag === 'expect') {
    const maybeCount = integerAttributeValue(attributes, 'count')
    if (Option.isSome(maybeCount)) {
      return Option.some(
        CounterTapeExpectEntry.make({
          _tag: 'Expect',
          count: maybeCount.value,
          label: `expect count ${maybeCount.value.toString()}`,
        }),
      )
    }
  } else if (normalizedTag === 'snapshot') {
    return Option.some(
      CounterTapeSnapshotEntry.make({
        _tag: 'Snapshot',
        label: 'snapshot',
      }),
    )
  } else if (normalizedTag === 'final') {
    const maybeCount = integerAttributeValue(attributes, 'count')
    if (Option.isSome(maybeCount)) {
      return Option.some(
        CounterTapeFinalEntry.make({
          _tag: 'Final',
          count: maybeCount.value,
          label: `final Ready ${maybeCount.value.toString()}`,
        }),
      )
    }
  }

  return Option.none()
}

const parseCounterTapeEntryElements = (
  xml: string,
): ReadonlyArray<CounterTapeEntry> => {
  const entries = new Array<CounterTapeEntry>()
  const elementPattern =
    /<(?<tag>counter-message|message|step|action|expect|snapshot|final|increment|decrement|reset)\b(?<attributes>[^>]*)\/?>/giu

  for (const match of xml.matchAll(elementPattern)) {
    const tag = match.groups?.['tag'] ?? ''
    const attributes = match.groups?.['attributes'] ?? ''
    const maybeEntry = maybeEntryForElement(tag, attributes)
    if (Option.isSome(maybeEntry)) {
      entries.push(maybeEntry.value)
    }
  }

  return entries
}

/** Parses displayable Counter tape entries from a small XML tape document. */
export const parseCounterTapeEntries = (
  xml: string,
): Effect.Effect<ReadonlyArray<CounterTapeEntry>, CounterTapeError> => {
  const entries = parseCounterTapeEntryElements(xml)

  if (Array_.isReadonlyArrayEmpty(entries)) {
    return Effect.fail(
      new CounterTapeError({
        reason:
          'Counter tape did not contain any increment, decrement, or reset entries',
      }),
    )
  } else {
    return Effect.succeed(entries)
  }
}

/** Parses Counter Messages from a small XML tape document. */
export const parseCounterTapeXml = (
  xml: string,
): Effect.Effect<ReadonlyArray<Message>, CounterTapeError> =>
  parseCounterTapeEntries(xml).pipe(
    Effect.flatMap(entries => {
      const messages = entries.flatMap(entry => {
        const maybeMessage = messageForCounterTapeEntry(entry)
        if (Option.isSome(maybeMessage)) {
          return [maybeMessage.value]
        } else {
          return []
        }
      })

      if (Array_.isReadonlyArrayEmpty(messages)) {
        return Effect.fail(
          new CounterTapeError({
            reason:
              'Counter tape did not contain any increment, decrement, or reset entries',
          }),
        )
      } else {
        return Effect.succeed(messages)
      }
    }),
  )

/** Loads a Counter XML tape from a URL. */
export const fetchCounterTapeXml = (
  url: URL,
): Effect.Effect<string, CounterTapeError> =>
  Effect.tryPromise({
    try: async () => {
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(),
        FETCH_TIMEOUT_MILLISECONDS,
      )

      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const xml = await response.text()
        if (Buffer.byteLength(xml, 'utf8') > MAX_TAPE_BYTES) {
          throw new Error('Counter tape was too large')
        }

        return xml
      } finally {
        clearTimeout(timeout)
      }
    },
    catch: error =>
      new CounterTapeError({
        reason: `Could not load Counter tape from ${url.toString()}: ${globalThis.String(error)}`,
      }),
  })

/** Built-in sample tape served by the portal demo. */
export const sampleIncrementTapeXml = `<?xml version="1.0" encoding="UTF-8"?>
<tape address="foldkit-counter-sample@0.1.0">
  <action type="increment" />
</tape>
`
