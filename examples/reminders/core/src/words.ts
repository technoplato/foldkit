import {
  Array,
  Effect,
  Option,
  Schema as S,
  SchemaIssue,
  SchemaTransformation,
} from 'effect'

import { Ordering, SmartList } from './board.js'

// WORDS

const wordCodec = <Value extends string>(
  target: S.Codec<Value, Value>,
  pairs: Array.NonEmptyReadonlyArray<readonly [string, Value]>,
): S.Codec<Value, string> =>
  S.String.pipe(
    S.decodeTo(
      target,
      SchemaTransformation.transformOrFail({
        decode: (word: string) =>
          Option.match(
            Array.findFirst(
              pairs,
              ([candidate]) => candidate === word.trim().toLowerCase(),
            ),
            {
              onNone: () =>
                Effect.fail(
                  new SchemaIssue.InvalidValue(Option.some(word), {
                    message: `Expected one of ${Array.join(
                      Array.map(pairs, ([candidate]) => candidate),
                      ', ',
                    )}`,
                  }),
                ),
              onSome: ([, value]) => Effect.succeed(value),
            },
          ),
        encode: (value: Value) =>
          Effect.succeed(
            Option.getOrElse(
              Option.map(
                Array.findFirst(pairs, ([, candidate]) => candidate === value),
                ([word]) => word,
              ),
              () => value,
            ),
          ),
      }),
    ),
  )

/** A smart list as one lowercase word, `today` in `/reminders/today`. */
export const SmartListWord = wordCodec(SmartList, [
  ['today', 'Today'],
  ['scheduled', 'Scheduled'],
  ['all', 'All'],
  ['flagged', 'Flagged'],
  ['completed', 'Completed'],
])

/** How a reminder's priority can be set, `NoPriority` clearing it. */
export const PriorityChoice = S.Literals([
  'NoPriority',
  'Low',
  'Medium',
  'High',
])
/** How a reminder's priority can be set. */
export type PriorityChoice = typeof PriorityChoice.Type

/** A priority as one word, `high` in `reminders set-priority high`. */
export const PriorityWord = wordCodec(PriorityChoice, [
  ['none', 'NoPriority'],
  ['low', 'Low'],
  ['medium', 'Medium'],
  ['high', 'High'],
])

/** An order as one word, `due-date` in `reminders sort-by due-date`. */
export const OrderingWord = wordCodec(Ordering, [
  ['manual', 'Manual'],
  ['due-date', 'DueDate'],
  ['priority', 'Priority'],
  ['title', 'Title'],
])
