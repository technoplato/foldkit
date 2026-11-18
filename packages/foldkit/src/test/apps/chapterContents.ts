import { Array, Match as M, Option, Schema as S } from 'effect'

import * as ActionMenu from '../../actionMenu/actionMenu.js'
import * as Catalog from '../../catalog/catalog.js'
import { bind } from '../../interaction/bind.js'
import { m } from '../../message/index.js'
import * as Declaration from '../../navigation/declaration.js'
import { Sheet } from '../../navigation/structure.js'
import { make } from '../../program/program.js'
import {
  Column,
  Dock,
  List,
  Row,
  Text,
  actionButtons,
} from '../../renderers/elements.js'
import * as Route from '../../route/parser.js'
import { ts } from '../../schema/index.js'
import * as Session from '../../session/session.js'
import { handleOf } from './navigableCounter.js'

// MODEL

const chapterCount = 114

const Model = S.Struct({ playing: S.Int, ticks: S.Int })
type Model = typeof Model.Type

const ChapterToken = S.FiniteFromString.pipe(S.decodeTo(S.Int))

// MESSAGE

/** Plays one chapter; the one playing cannot be chosen again. */
export const JumpToChapter = Catalog.action('JumpToChapter', {
  fields: { chapter: S.Int },
  choose: {
    field: 'chapter',
    prompt: 'Which chapter?',
    token: ChapterToken,
    choicesOf: (model: Model) =>
      Array.map(Array.range(1, chapterCount), chapter => ({
        value: chapter,
        title: `Chapter ${chapter.toString()}`,
        availability:
          chapter === model.playing
            ? Catalog.Disabled({ because: 'it is playing now' })
            : Catalog.Enabled(),
      })),
    nothingToChoose: 'there are no chapters',
  },
  what: 'Plays the chapter',
  why: 'The person wants that part',
  meta: { label: 'Play', keys: [] },
})

/** Plays the next chapter. `n` presses it. */
export const NextChapter = Catalog.action('NextChapter', {
  what: 'Plays the next chapter',
  why: 'The person wants what comes next',
  meta: { label: 'Next', keys: ['n'] },
})

const catalog = Catalog.make([JumpToChapter, NextChapter])

/** A second of playing passed, as a player reports every second. */
export const Ticked = m('Ticked')

const Message = S.Union([...catalog.Message.members, Ticked])
type Message = typeof Message.Type

// NAVIGATION

/** The shelf, the root at `/chapters`. */
export const Shelf = ts('Shelf')
/** The shelf. */
export type Shelf = typeof Shelf.Type

/** The book's chapters, a Sheet at `/chapters/contents`. */
export const Contents = ts('Contents')
/** The book's chapters. */
export type Contents = typeof Contents.Type

const contentsScreen = (model: Model) =>
  Column(
    { gap: 1 },
    Text('Contents', { emphasis: 'Headline' }),
    List({
      label: 'Chapters',
      items: Array.map(Array.range(1, chapterCount), chapter => ({
        key: chapter.toString(),
        title: `Chapter ${chapter.toString()}`,
        ...(chapter === model.playing
          ? {}
          : { action: `JumpToChapter:${chapter.toString()}` }),
        isCurrent: chapter === model.playing,
      })),
    }),
  )

const navigation = {
  ...Declaration.screens({
    slug: 'chapters',
    root: Declaration.rootScreen(Shelf, Route.here, {
      title: () => 'Shelf',
    }),
    screens: [
      Declaration.presentScreen(Contents, Route.literal('contents'), Sheet(), {
        title: () => 'Contents',
      }),
    ],
  }),
  viewOf: (model: Model, destination: Shelf | Contents) =>
    destination._tag === 'Contents'
      ? Option.some(Declaration.screenView(contentsScreen(model)))
      : Option.none(),
}

/**
 * A book with 114 chapters: the shelf names the chapter playing and pins
 * a dock with Next under it, and `/chapters/contents` lists every chapter,
 * the one playing current and not pressable. Session and the action menu
 * wrap it, so Escape goes back.
 */
export const ChapterProgram = make({
  id: 'chapter-contents',
  version: 1,
  Model,
  Message,
  init: () => [{ playing: 1, ticks: 0 }, []],
  update: (model: Model, message: Message) =>
    M.value(message).pipe(
      M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        JumpToChapter: ({ chapter }) => [{ ...model, playing: chapter }, []],
        NextChapter: () => [
          { ...model, playing: Math.min(chapterCount, model.playing + 1) },
          [],
        ],
        Ticked: () => [{ ...model, ticks: model.ticks + 1 }, []],
      }),
    ),
  catalog,
  navigation,
  screen: (model: Model) =>
    Column(
      { gap: 1 },
      Text('Shelf', { emphasis: 'Headline' }),
      Text(`Chapter ${model.playing.toString()} is playing`),
      Text(`${model.ticks.toString()} seconds in`, { dim: true }),
      Dock(
        Row(
          {},
          ...actionButtons(
            Array.filter(
              Catalog.entries(catalog, model),
              entry => entry.tag === NextChapter.tag,
            ),
          ),
        ),
      ),
    ),
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
  },
})

/** The chapters inside Session, with the action menu over both. */
export const ChapterApp = ActionMenu.compose({
  of: Session.compose({ of: ChapterProgram }),
})

/** The chapters bound to a fresh in-memory handle. */
export const bindChapters = () => bind(ChapterApp, handleOf(ChapterApp))
