import { Array, Option } from 'effect'

import type { Milliseconds } from './ids.js'
import {
  type Model,
  type Passage,
  type Section,
  type Word,
  passagesOf,
} from './model.js'

// PARAGRAPHS

const paragraphPauseMs = 1500

const paragraphWords = 70

const sentenceEnd = /[.!?…]["”’')\]]*$/u

/**
 * The section that starts after `afterMs` and at or before `atMs`, such
 * as the chapter a word opens.
 */
export const startsSection = (
  sections: ReadonlyArray<Section>,
  afterMs: number,
  atMs: number,
): Option.Option<Section> =>
  Array.findFirst(
    sections,
    section => section.startMs > afterMs && section.startMs <= atMs,
  )

const endsParagraph = (
  sections: ReadonlyArray<Section>,
  word: Word,
  maybeNext: Option.Option<Word>,
  count: number,
): boolean =>
  Option.match(maybeNext, {
    onNone: () => true,
    onSome: next =>
      next.startMs - word.endMs >= paragraphPauseMs ||
      Option.isSome(startsSection(sections, word.startMs, next.startMs)) ||
      (count >= paragraphWords && sentenceEnd.test(word.text)),
  })

/** The words of one paragraph, in order. */
export type Paragraph = Array.NonEmptyReadonlyArray<Word>

type Paragraphs = Readonly<{
  done: ReadonlyArray<Paragraph>
  open: ReadonlyArray<Word>
}>

const noParagraphs: Paragraphs = { done: [], open: [] }

const splitParagraphs = (
  sections: ReadonlyArray<Section>,
  words: ReadonlyArray<Word>,
): ReadonlyArray<Paragraph> =>
  Array.reduce(words, noParagraphs, (state, word, index): Paragraphs => {
    const open = Array.append(state.open, word)
    return endsParagraph(
      sections,
      word,
      Array.get(words, index + 1),
      open.length,
    )
      ? { done: Array.append(state.done, open), open: [] }
      : { done: state.done, open }
  }).done

type Split = Readonly<{
  sections: ReadonlyArray<Section>
  paragraphs: ReadonlyArray<Paragraph>
}>

const splits = new WeakMap<ReadonlyArray<Word>, Split>()

/**
 * A passage's words in paragraphs, so a five-minute passage reads as
 * prose: a paragraph ends at a pause of a second and a half, where a
 * section starts, or at the end of a sentence once it has 70 words. The
 * split of one passage's words is kept while the passage and the sections
 * stay the same, so a screen painted every second splits them once.
 */
export const paragraphsOf = (
  sections: ReadonlyArray<Section>,
  words: ReadonlyArray<Word>,
): ReadonlyArray<Paragraph> => {
  const kept = splits.get(words)
  if (kept !== undefined && kept.sections === sections) {
    return kept.paragraphs
  } else {
    const paragraphs = splitParagraphs(sections, words)
    splits.set(words, { sections, paragraphs })
    return paragraphs
  }
}

/** Every paragraph of the passages, in order. */
export const paragraphsIn = (
  sections: ReadonlyArray<Section>,
  passages: ReadonlyArray<Passage>,
): ReadonlyArray<Paragraph> =>
  Array.flatMap(passages, passage => paragraphsOf(sections, passage.words))

const startOf = (paragraph: Paragraph): Milliseconds =>
  Array.headNonEmpty(paragraph).startMs

const restartParagraphMs = 1000

/**
 * Where the paragraph after the one being heard starts, among the words
 * near the place. None in the last of them.
 */
export const nextParagraphOf = (model: Model): Option.Option<Milliseconds> =>
  Option.map(
    Array.findFirst(
      paragraphsIn(model.media.sections, passagesOf(model)),
      paragraph => startOf(paragraph) > model.placeMs,
    ),
    startOf,
  )

/**
 * Where to go back to by paragraph: the start of the one being heard,
 * once more than a second into it, else the start of the one before. None
 * at the start of the first paragraph near the place.
 */
export const previousParagraphOf = (
  model: Model,
): Option.Option<Milliseconds> =>
  Option.map(
    Array.findLast(
      paragraphsIn(model.media.sections, passagesOf(model)),
      paragraph => startOf(paragraph) < model.placeMs - restartParagraphMs,
    ),
    startOf,
  )
