import { Array, Option, Schema as S, String } from 'effect'

import { PropositionId } from './explore'
import { ChoiceLetter, SlideId } from './slide'

/**
 * A later paste on an already-saved lock or explore stamp. Newest-first.
 * Example: first lock is `A`, then a note `also name cli/custom/rs`.
 */
export const NoteStamp = S.Struct({
  at: S.String.annotate({ title: 'saved at' }),
  verbatim: S.String.annotate({ title: 'verbatim note' }),
  cleaned: S.String.annotate({ title: 'cleaned note' }),
})
/** A later paste on an already-saved lock or explore stamp. */
export type NoteStamp = typeof NoteStamp.Type

/**
 * One saved reply. `verbatim` is what the human pasted. `cleaned` is empty
 * until Grok reviews it. Example: verbatim `yeah C`, cleaned `C`.
 * `notes` is later follow-up text. It does not replace `verbatim`.
 */
export const AnswerStamp = S.Struct({
  at: S.String.annotate({ title: 'saved at' }),
  verbatim: S.String.annotate({ title: 'verbatim answer' }),
  cleaned: S.String.annotate({ title: 'cleaned answer' }),
  notes: S.optionalKey(S.Array(NoteStamp)),
})
/** One saved reply. */
export type AnswerStamp = typeof AnswerStamp.Type

/** Card-level explore notes, not a per-step lock. */
export const ExploreScope = S.Literals(['explore'])
/** Card-level explore notes, not a per-step lock. */
export type ExploreScope = typeof ExploreScope.Type

/**
 * Feedback on this card's explorer. It does not lock the parent card.
 * Example: a note on Q04h explore while Q04h stays OPEN. `scope` is
 * `explore`. Older files may still carry `propositionId`.
 */
export const ExploreStamp = S.Struct({
  at: S.String.annotate({ title: 'saved at' }),
  verbatim: S.String.annotate({ title: 'verbatim note' }),
  cleaned: S.String.annotate({ title: 'cleaned note' }),
  notes: S.optionalKey(S.Array(NoteStamp)),
  scope: S.optionalKey(ExploreScope),
  propositionId: S.optionalKey(PropositionId),
})
/** Feedback on this card's explorer. */
export type ExploreStamp = typeof ExploreStamp.Type

/**
 * Newest-first log of answers for one slide. Example: `/answers/01.json`
 * with `answers[0]` the latest paste. `explores` is extra notes, not a
 * card lock.
 */
export const AnswerLog = S.Struct({
  slideId: SlideId,
  answers: S.Array(AnswerStamp),
  explores: S.optionalKey(S.Array(ExploreStamp)),
})
/** Newest-first log of answers for one slide. */
export type AnswerLog = typeof AnswerLog.Type

/** Every answer log on disk. Example: GET `/answers` returns this. */
export const AnswersIndex = S.Struct({
  logs: S.Array(AnswerLog),
})
/** Every answer log on disk. */
export type AnswersIndex = typeof AnswersIndex.Type

/** Empty log for a slide that has never been answered. */
export const emptyAnswerLog = (slideId: SlideId): AnswerLog =>
  AnswerLog.make({
    slideId,
    answers: [],
    explores: [],
  })

/** Explore notes on this log. Missing JSON is an empty list. */
export const exploresOf = (log: AnswerLog): ReadonlyArray<ExploreStamp> =>
  log.explores ?? []

/** Follow-up notes on this stamp. Missing JSON is an empty list. */
export const notesOf = (stamp: {
  readonly notes?: ReadonlyArray<NoteStamp>
}): ReadonlyArray<NoteStamp> => stamp.notes ?? []

/** Puts `stamp` at the front. The newest answer is always the head. */
export const prependStamp = (log: AnswerLog, stamp: AnswerStamp): AnswerLog =>
  AnswerLog.make({
    slideId: log.slideId,
    answers: Array.prepend(log.answers, stamp),
    explores: exploresOf(log),
  })

/** Puts an explore note at the front. Does not change card-level answers. */
export const prependExploreStamp = (
  log: AnswerLog,
  stamp: ExploreStamp,
): AnswerLog =>
  AnswerLog.make({
    slideId: log.slideId,
    answers: log.answers,
    explores: Array.prepend(exploresOf(log), stamp),
  })

/** Adds a note to a lock stamp. Leaves the first verbatim in place. */
export const prependNoteOnAnswer = (
  stamp: AnswerStamp,
  note: NoteStamp,
): AnswerStamp =>
  AnswerStamp.make({
    at: stamp.at,
    verbatim: stamp.verbatim,
    cleaned: stamp.cleaned,
    notes: Array.prepend(notesOf(stamp), note),
  })

/** Adds a note to an explore stamp. Leaves the first verbatim in place. */
export const prependNoteOnExplore = (
  stamp: ExploreStamp,
  note: NoteStamp,
): ExploreStamp => {
  const withNotes = {
    at: stamp.at,
    verbatim: stamp.verbatim,
    cleaned: stamp.cleaned,
    notes: Array.prepend(notesOf(stamp), note),
  }
  if (stamp.scope !== undefined && stamp.propositionId !== undefined) {
    return ExploreStamp.make({
      ...withNotes,
      scope: stamp.scope,
      propositionId: stamp.propositionId,
    })
  }
  if (stamp.scope !== undefined) {
    return ExploreStamp.make({
      ...withNotes,
      scope: stamp.scope,
    })
  }
  if (stamp.propositionId !== undefined) {
    return ExploreStamp.make({
      ...withNotes,
      propositionId: stamp.propositionId,
    })
  }
  return ExploreStamp.make(withNotes)
}

/**
 * Puts `note` on the newest lock. Empty `answers` is unchanged. Example:
 * lock `A` plus note `also cli/custom/rs` stays one OPEN stamp.
 */
export const prependAnswerNote = (
  log: AnswerLog,
  note: NoteStamp,
): AnswerLog =>
  Array.match(log.answers, {
    onEmpty: () => log,
    onNonEmpty: stamps => {
      const latest = Array.headNonEmpty(stamps)
      const rest = Array.tailNonEmpty(stamps)
      return AnswerLog.make({
        slideId: log.slideId,
        answers: Array.prepend(rest, prependNoteOnAnswer(latest, note)),
        explores: exploresOf(log),
      })
    },
  })

/**
 * Puts `note` on the newest explore stamp. Empty `explores` is unchanged.
 */
export const prependExploreNote = (
  log: AnswerLog,
  note: NoteStamp,
): AnswerLog =>
  Array.match(exploresOf(log), {
    onEmpty: () => log,
    onNonEmpty: stamps => {
      const latest = Array.headNonEmpty(stamps)
      const rest = Array.tailNonEmpty(stamps)
      return AnswerLog.make({
        slideId: log.slideId,
        answers: log.answers,
        explores: Array.prepend(rest, prependNoteOnExplore(latest, note)),
      })
    },
  })

/** The newest stamp, if anyone has answered. */
export const latestStamp = (log: AnswerLog): Option.Option<AnswerStamp> =>
  Array.head(log.answers)

/** Prefers the cleaned review when Grok has written one. Example: `yeah C` becomes `C`. */
export const displayText = (stamp: {
  readonly verbatim: string
  readonly cleaned: string
}): string => {
  const cleaned = String.trim(stamp.cleaned)
  if (!String.isEmpty(cleaned)) {
    return cleaned
  }
  return stamp.verbatim
}

/**
 * A/B/C when the newest stamp starts with that letter. `A.` and `A ` count.
 * A sentence that only happens to start with A does not.
 */
export const chosenLetterOf = (
  stamp: AnswerStamp,
): Option.Option<ChoiceLetter> => {
  const text = String.trim(displayText(stamp))
  const letters: ReadonlyArray<ChoiceLetter> = [
    ChoiceLetter.make('A'),
    ChoiceLetter.make('B'),
    ChoiceLetter.make('C'),
  ]
  return Array.findFirst(
    letters,
    letter =>
      text === letter ||
      text.startsWith(`${letter}.`) ||
      text.startsWith(`${letter} `),
  )
}

const PREVIEW_LENGTH = 40

/** First line-ish of a saved answer for the status row. */
export const previewOf = (text: string): string => {
  const trimmed = String.trim(text)
  if (trimmed.length <= PREVIEW_LENGTH) {
    return trimmed
  }
  return `${trimmed.slice(0, PREVIEW_LENGTH)}...`
}

/** Newest follow-up note on this stamp, if any. */
export const latestNoteOf = (stamp: {
  readonly notes?: ReadonlyArray<NoteStamp>
}): Option.Option<NoteStamp> => Array.head(notesOf(stamp))

/** Newest explore note for this card, if any. */
export const latestExploreStamp = (
  log: AnswerLog,
): Option.Option<ExploreStamp> => Array.head(exploresOf(log))

const previewOfStamp = (stamp: {
  readonly verbatim: string
  readonly cleaned: string
  readonly notes?: ReadonlyArray<NoteStamp>
}): string => {
  const maybeNote = latestNoteOf(stamp)
  if (Option.isSome(maybeNote)) {
    return previewOf(displayText(maybeNote.value))
  }
  return previewOf(displayText(stamp))
}

/** Preview of the newest lock, note, or explore stamp. */
export const previewOfLog = (log: AnswerLog): string => {
  const maybeStamp = latestStamp(log)
  if (Option.isSome(maybeStamp)) {
    return previewOfStamp(maybeStamp.value)
  }
  const maybeExplore = latestExploreStamp(log)
  if (Option.isSome(maybeExplore)) {
    return previewOfStamp(maybeExplore.value)
  }
  return ''
}

/** Replaces the log for this slide id. Newest logs stay easy to find at the front. */
export const replaceLog = (
  logs: ReadonlyArray<AnswerLog>,
  log: AnswerLog,
): ReadonlyArray<AnswerLog> =>
  Array.prepend(
    Array.filter(logs, existing => existing.slideId !== log.slideId),
    log,
  )

/** The log for this slide, if we have fetched one. */
export const logForSlide = (
  logs: ReadonlyArray<AnswerLog>,
  slideId: SlideId,
): Option.Option<AnswerLog> =>
  Array.findFirst(logs, log => log.slideId === slideId)

/** Sets `cleaned` on the newest stamp. Leaves older stamps alone. */
export const withLatestCleaned = (log: AnswerLog, cleaned: string): AnswerLog =>
  Array.match(log.answers, {
    onEmpty: () => log,
    onNonEmpty: stamps => {
      const latest = Array.headNonEmpty(stamps)
      const rest = Array.tailNonEmpty(stamps)
      return AnswerLog.make({
        slideId: log.slideId,
        answers: Array.prepend(
          rest,
          AnswerStamp.make({
            at: latest.at,
            verbatim: latest.verbatim,
            cleaned,
            notes: notesOf(latest),
          }),
        ),
        explores: exploresOf(log),
      })
    },
  })
