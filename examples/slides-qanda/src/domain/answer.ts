import { Array, Option, Schema as S, String } from 'effect'

import { ChoiceLetter, SlideId } from './slide'

/**
 * One saved reply. `verbatim` is what the human pasted. `cleaned` is empty
 * until Grok reviews it. Example: verbatim `yeah C`, cleaned `C`.
 */
export const AnswerStamp = S.Struct({
  at: S.String.annotate({ title: 'saved at' }),
  verbatim: S.String.annotate({ title: 'verbatim answer' }),
  cleaned: S.String.annotate({ title: 'cleaned answer' }),
})
/** One saved reply. */
export type AnswerStamp = typeof AnswerStamp.Type

/**
 * Newest-first log of answers for one slide. Example: `/answers/01.json`
 * with `answers[0]` the latest paste.
 */
export const AnswerLog = S.Struct({
  slideId: SlideId,
  answers: S.Array(AnswerStamp),
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
  })

/** Puts `stamp` at the front. The newest answer is always the head. */
export const prependStamp = (log: AnswerLog, stamp: AnswerStamp): AnswerLog =>
  AnswerLog.make({
    slideId: log.slideId,
    answers: Array.prepend(log.answers, stamp),
  })

/** The newest stamp, if anyone has answered. */
export const latestStamp = (log: AnswerLog): Option.Option<AnswerStamp> =>
  Array.head(log.answers)

/** Prefers the cleaned review when Grok has written one. Example: `yeah C` becomes `C`. */
export const displayText = (stamp: AnswerStamp): string => {
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
      String.startsWith(text, `${letter}.`) ||
      String.startsWith(text, `${letter} `),
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

/** Preview of the newest stamp, or empty when the log has none. */
export const previewOfLog = (log: AnswerLog): string => {
  const maybeStamp = latestStamp(log)
  if (Option.isNone(maybeStamp)) {
    return ''
  }
  return previewOf(displayText(maybeStamp.value))
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
          }),
        ),
      })
    },
  })
