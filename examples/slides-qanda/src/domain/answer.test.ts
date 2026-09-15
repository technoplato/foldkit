import { Array, Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  AnswerLog,
  AnswerStamp,
  NoteStamp,
  notesOf,
  prependAnswerNote,
  prependExploreNote,
} from './answer'
import { ExploreStamp, SlideId } from './index'
import { hasAnswer } from './nav'

describe('AnswerLog notes', () => {
  test('decodes a lock stamp plus newest-first notes', () => {
    const log = S.decodeUnknownSync(AnswerLog)({
      slideId: '04j',
      answers: [
        {
          at: '2026-09-08T14:00:00-04:00',
          verbatim: 'A',
          cleaned: '',
          notes: [
            {
              at: '2026-09-08T14:05:00-04:00',
              verbatim: 'also cli/custom/rs',
              cleaned: '',
            },
          ],
        },
      ],
    })
    expect(log.slideId).toBe('04j')
    const maybeHead = Array.head(log.answers)
    expect(Option.isSome(maybeHead)).toBe(true)
    if (Option.isSome(maybeHead)) {
      expect(maybeHead.value.verbatim).toBe('A')
      const maybeNote = Array.head(notesOf(maybeHead.value))
      expect(Option.isSome(maybeNote)).toBe(true)
      if (Option.isSome(maybeNote)) {
        expect(maybeNote.value.verbatim).toBe('also cli/custom/rs')
      }
    }
  })

  test('a second sim paste appends a note and keeps the first verbatim', () => {
    const log = AnswerLog.make({
      slideId: SlideId.make('sim'),
      answers: [
        AnswerStamp.make({
          at: '2026-09-09T13:00:00-04:00',
          verbatim: 'fee should sit with the bundle',
          cleaned: '',
        }),
      ],
      explores: [],
    })
    const next = prependAnswerNote(
      log,
      NoteStamp.make({
        at: '2026-09-09T13:05:00-04:00',
        verbatim: 'stake is the second payment',
        cleaned: '',
      }),
    )
    const maybeHead = Array.head(next.answers)
    expect(next.slideId).toBe('sim')
    expect(Option.isSome(maybeHead)).toBe(true)
    if (Option.isSome(maybeHead)) {
      expect(maybeHead.value.verbatim).toBe('fee should sit with the bundle')
      const maybeNote = Array.head(notesOf(maybeHead.value))
      expect(Option.isSome(maybeNote)).toBe(true)
      if (Option.isSome(maybeNote)) {
        expect(maybeNote.value.verbatim).toBe('stake is the second payment')
      }
    }
  })

  test('prependAnswerNote keeps the first verbatim', () => {
    const log = AnswerLog.make({
      slideId: SlideId.make('04j'),
      answers: [
        AnswerStamp.make({
          at: '2026-09-08T14:00:00-04:00',
          verbatim: 'A',
          cleaned: '',
        }),
      ],
      explores: [],
    })
    const withFirst = prependAnswerNote(
      log,
      NoteStamp.make({
        at: '2026-09-08T14:05:00-04:00',
        verbatim: 'also cli/custom/rs',
        cleaned: '',
      }),
    )
    const next = prependAnswerNote(
      withFirst,
      NoteStamp.make({
        at: '2026-09-08T14:06:00-04:00',
        verbatim: 'and cli/custom/py',
        cleaned: '',
      }),
    )
    const maybeHead = Array.head(next.answers)
    expect(Option.isSome(maybeHead)).toBe(true)
    if (Option.isSome(maybeHead)) {
      expect(maybeHead.value.verbatim).toBe('A')
      const maybeNewest = Array.head(notesOf(maybeHead.value))
      const maybeOlder = Array.get(notesOf(maybeHead.value), 1)
      expect(Option.isSome(maybeNewest)).toBe(true)
      if (Option.isSome(maybeNewest)) {
        expect(maybeNewest.value.verbatim).toBe('and cli/custom/py')
      }
      expect(Option.isSome(maybeOlder)).toBe(true)
      if (Option.isSome(maybeOlder)) {
        expect(maybeOlder.value.verbatim).toBe('also cli/custom/rs')
      }
    }
  })

  test('notes do not lock OPEN by themselves', () => {
    const logs = [
      AnswerLog.make({
        slideId: SlideId.make('04j'),
        answers: [],
        explores: [
          ExploreStamp.make({
            at: '2026-09-08T14:00:00-04:00',
            verbatim: 'prints look right',
            cleaned: '',
            scope: 'explore',
            notes: [
              NoteStamp.make({
                at: '2026-09-08T14:05:00-04:00',
                verbatim: 'elixir offline caveat is clear',
                cleaned: '',
              }),
            ],
          }),
        ],
      }),
    ]
    expect(hasAnswer(logs, SlideId.make('04j'))).toBe(false)
    const withLock = prependAnswerNote(
      AnswerLog.make({
        slideId: SlideId.make('04j'),
        answers: [
          AnswerStamp.make({
            at: '2026-09-08T14:10:00-04:00',
            verbatim: 'A',
            cleaned: '',
          }),
        ],
        explores: [],
      }),
      NoteStamp.make({
        at: '2026-09-08T14:11:00-04:00',
        verbatim: 'follow-up',
        cleaned: '',
      }),
    )
    expect(hasAnswer([withLock], SlideId.make('04j'))).toBe(true)
  })

  test('prependExploreNote keeps the first explore verbatim', () => {
    const log = AnswerLog.make({
      slideId: SlideId.make('04j'),
      answers: [],
      explores: [
        ExploreStamp.make({
          at: '2026-09-08T14:00:00-04:00',
          verbatim: 'prints look right',
          cleaned: '',
          scope: 'explore',
        }),
      ],
    })
    const next = prependExploreNote(
      log,
      NoteStamp.make({
        at: '2026-09-08T14:05:00-04:00',
        verbatim: 'elixir offline caveat is clear',
        cleaned: '',
      }),
    )
    const maybeHead = Array.head(next.explores ?? [])
    expect(Option.isSome(maybeHead)).toBe(true)
    if (Option.isSome(maybeHead)) {
      expect(maybeHead.value.verbatim).toBe('prints look right')
      const maybeNote = Array.head(notesOf(maybeHead.value))
      expect(Option.isSome(maybeNote)).toBe(true)
      if (Option.isSome(maybeNote)) {
        expect(maybeNote.value.verbatim).toBe('elixir offline caveat is clear')
      }
    }
    expect(Option.isNone(Array.head(next.answers))).toBe(true)
  })
})
