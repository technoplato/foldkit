import { Array, Match as M, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import { AnswerLog } from './answer'
import { Deck, firstRoot, locate } from './deck'
import {
  At,
  AtFollowUp,
  AtRoot,
  FollowUp,
  Root,
  SlideId,
  Turn,
  cardOf,
  neighbor,
  rootOf,
} from './slide'

/** Show every root question, earliest first. */
export const ShowAll = ts('All')
/** Show root questions with no answer log yet. */
export const ShowUnanswered = ts('Unanswered')
/** Show root questions that already have an answer. */
export const ShowAnswered = ts('Answered')
/** Show follow-up questions that still have no answer. */
export const ShowFollowUp = ts('FollowUp')
/** Which root questions left/right walk. */
export const SlideFilter = S.Union([
  ShowAll,
  ShowUnanswered,
  ShowAnswered,
  ShowFollowUp,
])
/** Which root questions left/right walk. */
export type SlideFilter = typeof SlideFilter.Type

/** All → Unanswered → Answered → FollowUp → All. */
export const cycleFilter = (filter: SlideFilter): SlideFilter =>
  M.value(filter).pipe(
    M.tagsExhaustive({
      All: () => ShowUnanswered(),
      Unanswered: () => ShowAnswered(),
      Answered: () => ShowFollowUp(),
      FollowUp: () => ShowAll(),
    }),
  )

/** Short chrome label. Example: FollowUp prints FOLLOW. */
export const filterLabel = (filter: SlideFilter): string =>
  M.value(filter).pipe(
    M.tagsExhaustive({
      All: () => 'ALL',
      Unanswered: () => 'OPEN',
      Answered: () => 'DONE',
      FollowUp: () => 'FOLLOW',
    }),
  )

/** True when this root has a nested follow-up. Example: `03` has `03a`. */
export const hasFollowUp = (root: Root): boolean =>
  Array.match(root.followUps, {
    onEmpty: () => false,
    onNonEmpty: () => true,
  })

/** True when this card has at least one saved stamp. */
export const hasAnswer = (
  logs: ReadonlyArray<AnswerLog>,
  slideId: SlideId,
): boolean =>
  Option.isSome(
    Array.findFirst(
      logs,
      log =>
        log.slideId === slideId &&
        Array.match(log.answers, {
          onEmpty: () => false,
          onNonEmpty: () => true,
        }),
    ),
  )

/** Follow-up cards under this root that still have no stamp. */
export const unansweredFollowUpsOn = (
  root: Root,
  logs: ReadonlyArray<AnswerLog>,
): ReadonlyArray<FollowUp> =>
  Array.filter(root.followUps, child => !hasAnswer(logs, child.id))

/** True when this root still has a follow-up that needs an answer. */
export const hasUnansweredFollowUp = (
  root: Root,
  logs: ReadonlyArray<AnswerLog>,
): boolean =>
  Array.match(unansweredFollowUpsOn(root, logs), {
    onEmpty: () => false,
    onNonEmpty: () => true,
  })

/**
 * Unanswered follow-ups in deck order. Example: `05a`, then `06b`, then
 * `10a`.
 */
export const unansweredFollowUps = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
): ReadonlyArray<FollowUp> =>
  Array.flatMap(deck.roots, root => unansweredFollowUpsOn(root, logs))

/**
 * Newest unanswered follow-up, last in deck order. FOLLOW lands here.
 * Example: after adding `10a` last, FOLLOW opens `/q/10a`.
 */
export const latestUnansweredFollowUp = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
): Option.Option<FollowUp> => Array.last(unansweredFollowUps(deck, logs))

/**
 * Every unanswered card in deck order. An answered root still contributes
 * its open children. Example: after Q01–Q16 are saved, OPEN is `01a`,
 * `02a`, `03b`, `04a`.
 */
export const unansweredSlideIds = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
): ReadonlyArray<SlideId> =>
  Array.flatMap(deck.roots, root => {
    const children = Array.map(
      unansweredFollowUpsOn(root, logs),
      followUp => followUp.id,
    )
    if (hasAnswer(logs, root.id)) {
      return children
    }
    return Array.prepend(children, root.id)
  })

/** First unanswered card. OPEN lands here. */
export const firstUnansweredSlideId = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
): Option.Option<SlideId> => Array.head(unansweredSlideIds(deck, logs))

const walkHere = (filter: SlideFilter, at: At): SlideId =>
  filter._tag === 'All' || filter._tag === 'Answered'
    ? rootOf(at).id
    : cardOf(at).id

/**
 * Left/right walk. All and DONE walk roots. OPEN walks every unanswered
 * card. FOLLOW walks unanswered follow-ups only.
 */
export const walkSlideIds = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
  filter: SlideFilter,
): ReadonlyArray<SlideId> =>
  M.value(filter).pipe(
    M.tagsExhaustive({
      All: () => Array.map(deck.roots, root => root.id),
      Unanswered: () => unansweredSlideIds(deck, logs),
      Answered: () =>
        Array.map(
          Array.filter(deck.roots, root => hasAnswer(logs, root.id)),
          root => root.id,
        ),
      FollowUp: () =>
        Array.map(unansweredFollowUps(deck, logs), followUp => followUp.id),
    }),
  )

/** Roots visible under the current filter, earliest first. */
export const visibleRoots = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
  filter: SlideFilter,
): ReadonlyArray<Root> =>
  M.value(filter).pipe(
    M.tagsExhaustive({
      All: () => deck.roots,
      Unanswered: () =>
        Array.filter(
          deck.roots,
          root =>
            !hasAnswer(logs, root.id) || hasUnansweredFollowUp(root, logs),
        ),
      Answered: () =>
        Array.filter(deck.roots, root => hasAnswer(logs, root.id)),
      FollowUp: () =>
        Array.filter(deck.roots, root => hasUnansweredFollowUp(root, logs)),
    }),
  )

/**
 * 1-based place of this root in the filtered walk. `index` is none when
 * the current root is not in the group. Example: OPEN on Q07 of 11 is
 * `4 / 11`.
 */
export const filterPlace = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
  filter: SlideFilter,
  at: At,
): Readonly<{ index: Option.Option<number>; count: number }> => {
  const walk = walkSlideIds(deck, logs, filter)
  const here = walkHere(filter, at)
  return {
    index: Option.map(
      Array.findFirstIndex(walk, slideId => slideId === here),
      i => i + 1,
    ),
    count: walk.length,
  }
}

/**
 * After an answer, the next root still in the filtered walk, in deck
 * order. Skips the root just answered when the filter is Unanswered.
 * Wraps to the first remaining root.
 */
export const nextAfterAnswer = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
  filter: SlideFilter,
  at: At,
): Option.Option<SlideId> => {
  const walk = walkSlideIds(deck, logs, filter)
  const here = walkHere(filter, at)
  const maybeHere = Array.findFirstIndex(walk, slideId => slideId === here)
  if (Option.isNone(maybeHere)) {
    return Array.head(walk)
  }
  const maybeLater = Array.get(walk, maybeHere.value + 1)
  if (Option.isSome(maybeLater)) {
    return maybeLater
  }
  return Array.head(walk)
}

/**
 * Left/right among visible roots. Walks from `at.root`, so a follow-up of
 * Q03 plus Prev lands on the root before Q03.
 */
export const neighborRoot = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
  filter: SlideFilter,
  at: At,
  turn: Turn,
): Option.Option<Root> => {
  const visible = visibleRoots(deck, logs, filter)
  return Array.match(visible, {
    onEmpty: () => Option.none<Root>(),
    onNonEmpty: roots => neighbor(roots, rootOf(at).id, turn),
  })
}

/**
 * Left/right target. FOLLOW walks unanswered follow-up ids. Other filters
 * walk root ids.
 */
export const neighborSlideId = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
  filter: SlideFilter,
  at: At,
  turn: Turn,
): Option.Option<SlideId> => {
  const walk = walkSlideIds(deck, logs, filter)
  const here = walkHere(filter, at)
  const maybeHere = Array.findFirstIndex(walk, slideId => slideId === here)
  if (Option.isNone(maybeHere)) {
    return Array.head(walk)
  }
  if (turn === 'Prev') {
    return Array.get(walk, maybeHere.value - 1)
  }
  return Array.get(walk, maybeHere.value + 1)
}

/** Next follow-up under this root. From the root, the earliest child. */
export const nextFollowUp = (at: At): Option.Option<FollowUp> =>
  M.value(at).pipe(
    M.tagsExhaustive({
      AtRoot: ({ root }) => Array.head(root.followUps),
      AtFollowUp: ({ root, followUp }) => {
        const maybeIndex = Array.findFirstIndex(
          root.followUps,
          child => child.id === followUp.id,
        )
        if (Option.isNone(maybeIndex)) {
          return Array.head(root.followUps)
        }
        return Array.get(root.followUps, maybeIndex.value + 1)
      },
    }),
  )

/**
 * Next follow-up that still needs an answer. Answered children do not
 * count. Example: after `03a` is saved, down from `03` is none unless
 * another child is open.
 */
export const nextNeededFollowUp = (
  at: At,
  logs: ReadonlyArray<AnswerLog>,
): Option.Option<FollowUp> =>
  M.value(at).pipe(
    M.tagsExhaustive({
      AtRoot: ({ root }) => Array.head(unansweredFollowUpsOn(root, logs)),
      AtFollowUp: ({ root, followUp }) => {
        const maybeIndex = Array.findFirstIndex(
          root.followUps,
          child => child.id === followUp.id,
        )
        if (Option.isNone(maybeIndex)) {
          return Array.head(unansweredFollowUpsOn(root, logs))
        }
        const later = Array.drop(root.followUps, maybeIndex.value + 1)
        return Array.findFirst(later, child => !hasAnswer(logs, child.id))
      },
    }),
  )

/** First visible root, for an empty or hidden current page. */
export const firstVisibleRoot = (
  deck: Deck,
  logs: ReadonlyArray<AnswerLog>,
  filter: SlideFilter,
): Option.Option<Root> => Array.head(visibleRoots(deck, logs, filter))

/** Resolve a URL id to At, or the first root when the id is not in the deck. */
export const atOrFirstRoot = (
  deck: Deck,
  slideId: SlideId,
): Option.Option<At> => {
  const found = locate(deck, slideId)
  if (Option.isSome(found)) {
    return found
  }
  return Option.map(firstRoot(deck), root => AtRoot({ root }))
}

/** Standing on this follow-up under its root. */
export const atFollowUp = (root: Root, followUp: FollowUp): At =>
  AtFollowUp({ root, followUp })

/** Standing on this root. */
export const atRoot = (root: Root): At => AtRoot({ root })
