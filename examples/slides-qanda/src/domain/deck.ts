import { Array, Effect, Option, Result, Schema as S, SchemaIssue } from 'effect'
import { ts } from 'foldkit/schema'

import { At, AtFollowUp, AtRoot, Root, SlideId } from './slide'

/**
 * A slideshow loaded from JSON. Empty `slides` is a missing deck, not a
 * crash. Example: `{ "title": "DEATH", "slides": [ ... ] }`.
 */
export const Deck = S.Struct({
  title: S.String.annotate({ title: 'deck title' }).annotateKey({
    messageMissingKey: 'A deck needs a title.',
  }),
  roots: S.Array(Root).annotate({ title: 'roots' }).annotateKey({
    messageMissingKey: 'A deck needs a roots array.',
  }),
})
/** A slideshow loaded from JSON. */
export type Deck = typeof Deck.Type

/** Pasted text that decoded as a full deck. */
export const PastedDeck = ts('PastedDeck', { deck: Deck })
/** Pasted text that looked like deck JSON but failed Schema. */
export const PastedBrokenDeck = ts('PastedBrokenDeck', { error: S.String })
/** Pasted text that is an answer, not a deck. */
export const PastedAnswer = ts('PastedAnswer', { text: S.String })
/** How to treat text pasted on the slideshow. */
export const PasteKind = S.Union([PastedDeck, PastedBrokenDeck, PastedAnswer])
/** How to treat text pasted on the slideshow. */
export type PasteKind = typeof PasteKind.Type

/** The first root, if the deck has one. */
export const firstRoot = (deck: Deck): Option.Option<Root> =>
  Array.head(deck.roots)

/**
 * Finds `/q/:id` in the nested deck. A miss means the id is not in this
 * deck. A hit always includes the root.
 */
export const locate = (deck: Deck, slideId: SlideId): Option.Option<At> => {
  const maybeRoot = Array.findFirst(deck.roots, root => root.id === slideId)
  if (Option.isSome(maybeRoot)) {
    return Option.some(AtRoot({ root: maybeRoot.value }))
  }
  return Array.reduce(deck.roots, Option.none<At>(), (found, root) => {
    if (Option.isSome(found)) {
      return found
    }
    const maybeFollowUp = Array.findFirst(
      root.followUps,
      followUp => followUp.id === slideId,
    )
    if (Option.isNone(maybeFollowUp)) {
      return Option.none()
    }
    return Option.some(AtFollowUp({ root, followUp: maybeFollowUp.value }))
  })
}

const issueFormatter = SchemaIssue.makeFormatterStandardSchemaV1()

const keyOf = (
  part: PropertyKey | { readonly key: PropertyKey },
): PropertyKey => {
  if (typeof part === 'object' && part !== null && 'key' in part) {
    return part.key
  }
  return part
}

const formatHumanPath = (
  path: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>,
): string =>
  Array.reduce(path, '', (printed, part) => {
    const key = keyOf(part)
    if (typeof key === 'number') {
      return `${printed}[${key}]`
    }
    if (printed === '') {
      return String(key)
    }
    return `${printed}.${String(key)}`
  })

const formatIssueLines = (error: S.SchemaError): string => {
  const formatted = issueFormatter(error.issue)
  return formatted.issues
    .map(issue => {
      const path = issue.path ?? []
      if (Option.isNone(Array.head(path))) {
        return issue.message
      }
      return `${issue.message}\n  at ${formatHumanPath(path)}`
    })
    .join('\n')
}

/** Turns a Schema failure into lines a person can read on one screen. */
export const formatDeckIssue = (error: unknown): string => {
  if (S.isSchemaError(error)) {
    return `This JSON is not a deck.\n${formatIssueLines(error)}`
  }
  if (typeof error === 'string') {
    return error
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/** Turns a fetch failure into lines a person can read on one screen. */
export const formatLoadError = (error: unknown): string => {
  if (typeof error === 'string') {
    return error
  }
  if (S.isSchemaError(error)) {
    return formatDeckIssue(error)
  }
  if (error instanceof Error) {
    return `Could not load deck.json.\n${error.message}`
  }
  return `Could not load deck.json.\n${String(error)}`
}

/** Decode a fetched JSON value as a Deck. */
export const decodeDeck = (value: unknown): Effect.Effect<Deck, string> =>
  S.decodeUnknownEffect(Deck)(value).pipe(Effect.mapError(formatDeckIssue))

/**
 * Classifies a paste. A JSON object that is not a Deck is a broken deck, not
 * an answer. Example: `{ "title": "DEATH" }` is PastedBrokenDeck. `A` is
 * PastedAnswer.
 */
export const classifyPaste = (text: string): PasteKind => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return PastedAnswer({ text })
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return PastedAnswer({ text })
  }
  const result = Effect.runSync(Effect.result(decodeDeck(parsed)))
  return Result.match(result, {
    onSuccess: deck => PastedDeck({ deck }),
    onFailure: error => PastedBrokenDeck({ error }),
  })
}

/**
 * True when this text is a deck JSON object, not an answer sentence.
 * Example: `{ "title": "DEATH", "slides": [ ... ] }` is Some. `A` is None.
 */
export const maybeDeckFromText = (text: string): Option.Option<Deck> => {
  const kind = classifyPaste(text)
  if (kind._tag === 'PastedDeck') {
    return Option.some(kind.deck)
  }
  return Option.none()
}
