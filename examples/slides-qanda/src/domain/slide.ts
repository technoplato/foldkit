import { Array, Match as M, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

/**
 * One URL segment for a question card. `01` prints as `/q/01`. Slashes are
 * not a value. Example: `01`.
 */
export const SlideId = S.NonEmptyString.pipe(S.brand('SlideId')).annotate({
  title: 'slide id',
  message: 'Each slide needs a non-empty id such as 01.',
})
/** One URL segment for a question card. */
export type SlideId = typeof SlideId.Type

/** A, B, or C on a glanceable slide. */
export const ChoiceLetter = S.Literals(['A', 'B', 'C']).annotate({
  title: 'choice letter',
  message: 'Each option letter must be A, B, or C.',
})
/** A, B, or C on a glanceable slide. */
export type ChoiceLetter = typeof ChoiceLetter.Type

/** One named choice on a slide. */
export const SlideOption = S.Struct({
  letter: ChoiceLetter.annotateKey({
    messageMissingKey: 'Each option needs a letter: A, B, or C.',
  }),
  text: S.String.annotate({ title: 'choice text' }).annotateKey({
    messageMissingKey:
      'Each option needs the text that sits next to the letter.',
  }),
})
/** One named choice on a slide. */
export type SlideOption = typeof SlideOption.Type

const questionFields = {
  id: SlideId.annotateKey({
    messageMissingKey: 'Each slide needs an id such as 01.',
  }),
  title: S.String.annotate({ title: 'slide title' }).annotateKey({
    messageMissingKey: 'Each slide needs a title.',
  }),
  mapLines: S.NonEmptyArray(S.String)
    .annotate({
      title: 'map lines',
      message: 'mapLines must have at least one short line.',
    })
    .annotateKey({
      messageMissingKey:
        'Each slide needs mapLines: a non-empty list of short lines.',
    }),
  story: S.String.annotate({ title: 'story' }).annotateKey({
    messageMissingKey:
      'Each slide needs a story with named people (Alice, Bob, Eve, Dave).',
  }),
  question: S.String.annotate({ title: 'question' }).annotateKey({
    messageMissingKey: 'Each slide needs one question.',
  }),
  options: S.NonEmptyArray(SlideOption)
    .annotate({
      title: 'options',
      message: 'options must include at least one A / B / C choice.',
    })
    .annotateKey({
      messageMissingKey:
        'Each slide needs options: a non-empty A / B / C list.',
    }),
  prompt: S.String.annotate({ title: 'prompt' }).annotateKey({
    messageMissingKey: 'Each slide needs a prompt such as Paste A, B, or C.',
  }),
}

/**
 * The glanceable card. Roots and follow-ups share this body. Example: title
 * `WHO PLAYS?`, id `01`.
 */
export const Question = S.Struct(questionFields)
/** The glanceable card. */
export type Question = typeof Question.Type

/**
 * A follow-up hanging off one root. It cannot point at a missing parent
 * because it only exists inside that root's `followUps`. Example: `01a`
 * under `01`.
 */
export const FollowUp = Question
/** A follow-up hanging off one root. */
export type FollowUp = typeof FollowUp.Type

/**
 * A root question. Follow-ups are nested here, so a dangling parent id
 * cannot be written. Example: `01` with `followUps: []`.
 */
export const Root = S.Struct({
  ...questionFields,
  followUps: S.Array(FollowUp).annotate({ title: 'follow-ups' }).annotateKey({
    messageMissingKey:
      'Each root needs followUps: an array, empty when there is no follow-up.',
  }),
})
/** A root question. */
export type Root = typeof Root.Type

/** Standing on a root. Left and right walk other roots. */
export const AtRoot = ts('AtRoot', { root: Root })
/** Standing on a follow-up. The root is required, not optional. */
export const AtFollowUp = ts('AtFollowUp', { root: Root, followUp: FollowUp })
/**
 * Where the person is in the deck. A follow-up always carries its root.
 * Example: `/q/01` is AtRoot. `/q/01a` is AtFollowUp of `01`.
 */
export const At = S.Union([AtRoot, AtFollowUp])
/** Where the person is in the deck. */
export type At = typeof At.Type
/** Standing on a root. */
export type AtRoot = typeof AtRoot.Type
/** Standing on a follow-up. */
export type AtFollowUp = typeof AtFollowUp.Type

/** The card on screen. AtRoot uses the root body. AtFollowUp uses the child. */
export const cardOf = (at: At): Question =>
  M.value(at).pipe(
    M.tagsExhaustive({
      AtFollowUp: ({ followUp }) => followUp,
      AtRoot: ({ root }) =>
        Question.make({
          id: root.id,
          title: root.title,
          mapLines: root.mapLines,
          story: root.story,
          question: root.question,
          options: root.options,
          prompt: root.prompt,
        }),
    }),
  )

/** The id in the URL. `/q/01a` is the follow-up id, not the root id. */
export const idOf = (at: At): SlideId => cardOf(at).id

/** The root under this position. Always present. */
export const rootOf = (at: At): Root => at.root

/** Left or right among roots. */
export const Turn = S.Literals(['Prev', 'Next'])
/** Left or right among roots. */
export type Turn = typeof Turn.Type

const STEP: Record<Turn, number> = {
  Prev: -1,
  Next: 1,
}

/** Zero-based index of this id in a list of cards. */
export const indexById = <A extends { readonly id: SlideId }>(
  items: ReadonlyArray<A>,
  slideId: SlideId,
): Option.Option<number> =>
  Array.findFirstIndex(items, item => item.id === slideId)

/**
 * Neighbor of `slideId` wrapping at both ends. An unknown id steps to the
 * first item on Next and the last item on Prev.
 */
export const neighbor = <A extends { readonly id: SlideId }>(
  items: Array.NonEmptyReadonlyArray<A>,
  slideId: SlideId,
  turn: Turn,
): Option.Option<A> => {
  const maybeIndex = indexById(items, slideId)
  if (Option.isNone(maybeIndex)) {
    if (turn === 'Next') {
      return Array.head(items)
    }
    return Array.last(items)
  }
  const count = items.length
  const nextIndex = (maybeIndex.value + STEP[turn] + count) % count
  return Array.get(items, nextIndex)
}
