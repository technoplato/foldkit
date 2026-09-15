import { Array, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

/**
 * One explore screen on a card. Example: `ios-expo` on Q04h.
 */
export const PropositionId = S.NonEmptyString.pipe(
  S.brand('PropositionId'),
).annotate({
  title: 'proposition id',
  message: 'Each proposition needs a non-empty id such as ios-expo.',
})
/** One explore screen on a card. */
export type PropositionId = typeof PropositionId.Type

/**
 * Markdown written on the card. Example: a short CLI print inlined on Q04h.
 */
export const WrittenProposition = ts('Written', {
  id: PropositionId,
  title: S.String,
  markdown: S.String,
})
/** Markdown written on the card. */
export type WrittenProposition = typeof WrittenProposition.Type

/**
 * Markdown or code loaded from `public/`. Example: `explore/04h/ios-expo.md`.
 */
export const FileProposition = ts('File', {
  id: PropositionId,
  title: S.String,
  file: S.String,
})
/** Markdown or code loaded from `public/`. */
export type FileProposition = typeof FileProposition.Type

/**
 * One readable screen inside explore mode. Deck JSON may omit `_tag` and
 * use either `markdown` or `file`.
 */
export const Proposition = S.Union([WrittenProposition, FileProposition])
/** One readable screen inside explore mode. */
export type Proposition = typeof Proposition.Type

const WrittenJson = S.Struct({
  id: PropositionId.annotateKey({
    messageMissingKey: 'Each proposition needs an id such as ios-expo.',
  }),
  title: S.String.annotate({ title: 'proposition title' }).annotateKey({
    messageMissingKey: 'Each proposition needs a title.',
  }),
  markdown: S.String.annotate({ title: 'markdown' }).annotateKey({
    messageMissingKey: 'A written proposition needs markdown.',
  }),
})

const FileJson = S.Struct({
  id: PropositionId.annotateKey({
    messageMissingKey: 'Each proposition needs an id such as ios-expo.',
  }),
  title: S.String.annotate({ title: 'proposition title' }).annotateKey({
    messageMissingKey: 'Each proposition needs a title.',
  }),
  file: S.String.annotate({ title: 'public file' }).annotateKey({
    messageMissingKey:
      'A file proposition needs file: a path under public/, such as explore/04h/ios-expo.md.',
  }),
})

/**
 * Deck JSON shape for one proposition. `{ markdown }` is Written. `{ file }`
 * is File. Example: `{ "id": "ios-expo", "title": "EXPO IOS", "file":
 * "explore/04h/ios-expo.md" }`.
 */
export const PropositionJson = S.Union([WrittenJson, FileJson])
/** Deck JSON shape for one proposition. */
export type PropositionJson = typeof PropositionJson.Type

/** Tagged proposition from deck JSON. */
export const propositionFromJson = (json: PropositionJson): Proposition => {
  if ('file' in json) {
    return FileProposition({
      id: json.id,
      title: json.title,
      file: json.file,
    })
  }
  return WrittenProposition({
    id: json.id,
    title: json.title,
    markdown: json.markdown,
  })
}

/** Deck JSON from a tagged proposition. */
export const propositionToJson = (proposition: Proposition): PropositionJson => {
  if (proposition._tag === 'File') {
    return {
      id: proposition.id,
      title: proposition.title,
      file: proposition.file,
    }
  }
  return {
    id: proposition.id,
    title: proposition.title,
    markdown: proposition.markdown,
  }
}

/** Propositions on this card. Missing JSON is an empty list. */
export const propositionsOf = (card: {
  readonly propositions?: ReadonlyArray<PropositionJson>
}): ReadonlyArray<Proposition> =>
  Array.map(card.propositions ?? [], propositionFromJson)

/** True when this card has at least one explore screen. */
export const hasPropositions = (card: {
  readonly propositions?: ReadonlyArray<PropositionJson>
}): boolean =>
  Array.match(propositionsOf(card), {
    onEmpty: () => false,
    onNonEmpty: () => true,
  })

/** The proposition with this id, if it is on the card. */
export const findProposition = (
  propositions: ReadonlyArray<Proposition>,
  propositionId: PropositionId,
): Option.Option<Proposition> =>
  Array.findFirst(propositions, proposition => proposition.id === propositionId)

/** First explore screen, if the card has any. */
export const firstProposition = (
  propositions: ReadonlyArray<Proposition>,
): Option.Option<Proposition> => Array.head(propositions)

const STEP: Readonly<{ Prev: number; Next: number }> = {
  Prev: -1,
  Next: 1,
}

/**
 * Neighbor explore screen. Stops at the ends. An unknown id steps to the
 * first screen on Next and the last screen on Prev.
 */
export const neighborProposition = (
  propositions: ReadonlyArray<Proposition>,
  propositionId: PropositionId,
  turn: 'Prev' | 'Next',
): Option.Option<Proposition> =>
  Array.match(propositions, {
    onEmpty: () => Option.none<Proposition>(),
    onNonEmpty: items => {
      const maybeIndex = Array.findFirstIndex(
        items,
        item => item.id === propositionId,
      )
      if (Option.isNone(maybeIndex)) {
        if (turn === 'Next') {
          return Array.head(items)
        }
        return Array.last(items)
      }
      return Array.get(items, maybeIndex.value + STEP[turn])
    },
  })

/** 1-based place of this screen among the card's propositions. */
export const propositionPlace = (
  propositions: ReadonlyArray<Proposition>,
  propositionId: PropositionId,
): Readonly<{ index: Option.Option<number>; count: number }> => ({
  index: Option.map(
    Array.findFirstIndex(
      propositions,
      proposition => proposition.id === propositionId,
    ),
    i => i + 1,
  ),
  count: propositions.length,
})

/**
 * Public-relative file that is safe to fetch. Example:
 * `explore/04h/ios-expo.md`. Rejects `..` and absolute paths.
 */
export const maybePublicFile = (file: string): Option.Option<string> => {
  if (file.includes('..') || file.startsWith('/') || file.includes('\\')) {
    return Option.none()
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*\.(md|ts|tsx|js|json|txt)$/.test(file)) {
    return Option.none()
  }
  return Option.some(file)
}
