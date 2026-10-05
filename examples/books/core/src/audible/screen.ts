import { Array, Match as M, Option, String } from 'effect'
import type { Catalog } from 'foldkit'
import {
  type ButtonNode,
  Column,
  Dock,
  List,
  type ListItem,
  Progress,
  Row,
  Text,
  TextInput,
  type UiNode,
  actionButtons,
} from 'foldkit/renderers'
import * as TranscriptPlayer from 'transcript-player-core-example'

import {
  ConnectAudible,
  DeselectAudibleTitles,
  ImportAudibleTitles,
  ReadAudibleLibraryAgain,
  SelectAllAudibleTitles,
  ToggleAudibleTitle,
  TryAudibleSignInAgain,
} from './message.js'
import type { AudibleView, SignIn, TitlesRead } from './model.js'
import { isSelected } from './model.js'
import { type AudibleProblem, sentenceOf } from './problem.js'
import type {
  AudibleTitle,
  ImportProgress,
  ImportSummary,
  LeftOutField,
  MarkedCount,
  SeriesPart,
  SkipKind,
  SkippedCount,
  TitleMark,
} from './title.js'

// VIEW

type Entries = ReadonlyArray<Catalog.Entry>

type Variant = NonNullable<ButtonNode['variant']>

/**
 * The Books buttons the import screens show but do not own: Reconnect,
 * which swaps the titles page for the sign-in, and the one that goes to
 * the library after an import.
 */
export type HostButtons = Readonly<{
  reconnect: ReadonlyArray<ButtonNode>
  openLibrary: ReadonlyArray<ButtonNode>
}>

const withVariant = (
  buttons: ReadonlyArray<ButtonNode>,
  variant: Variant,
): ReadonlyArray<ButtonNode> =>
  Array.map(buttons, button => ({ ...button, variant }))

const buttonsOf = (
  entries: Entries,
  tags: ReadonlyArray<string>,
  variant: Variant,
): ReadonlyArray<ButtonNode> =>
  withVariant(
    actionButtons(
      Array.filter(entries, entry => Array.contains(tags, entry.tag)),
    ),
    variant,
  )

const isOffered = (entries: Entries, tag: string): boolean =>
  Array.some(
    entries,
    entry => entry.tag === tag && entry.availability._tag === 'Enabled',
  )

const problemLines = (
  maybeProblem: Option.Option<AudibleProblem>,
): ReadonlyArray<UiNode> =>
  Array.fromOption(
    Option.map(maybeProblem, problem => Text(sentenceOf(problem))),
  )

const promise =
  'Books reads the titles you own on Audible. It never downloads your audiobooks.'

const brokenPageNote =
  'After you sign in, Amazon shows a page that looks broken. That is expected.'

const signInRowOf = (loginUrl: string): UiNode =>
  List({
    label: 'Sign in to Amazon',
    items: [
      {
        key: 'amazon-sign-in',
        title: 'Open Amazon sign-in',
        lines: ['Opens amazon.com in a new tab'],
        href: loginUrl,
      },
    ],
  })

const isRestartProblem = (problem: AudibleProblem): boolean =>
  problem._tag === 'SignInExpired' || problem._tag === 'AmazonRefused'

const readyStepsOf = (
  entries: Entries,
  loginUrl: string,
  maybeProblem: Option.Option<AudibleProblem>,
): ReadonlyArray<UiNode> => [
  ...problemLines(Option.filter(maybeProblem, isRestartProblem)),
  Text('Step 1', { dim: true }),
  signInRowOf(loginUrl),
  Text(brokenPageNote, { dim: true }),
  Text('Step 2', { dim: true }),
  List({
    label: 'Paste the address',
    items: [
      {
        key: 'paste-address',
        title: 'Copy the address of that page',
        lines: ['Paste it below, then press Return or Done'],
      },
    ],
  }),
  ...problemLines(
    Option.filter(maybeProblem, problem => !isRestartProblem(problem)),
  ),
  ...(isOffered(entries, ConnectAudible.tag)
    ? [
        TextInput({
          value: '',
          placeholder: 'https://www.amazon.com/ap/maplanding?…',
          action: ConnectAudible.tag,
          label: 'Address of the page Amazon showed',
        }),
      ]
    : []),
]

const stepsOf = (entries: Entries, signIn: SignIn): ReadonlyArray<UiNode> =>
  M.value(signIn).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      SignInWaiting: ({ maybeProblem }) => [
        ...problemLines(maybeProblem),
        Text('Preparing the Amazon sign-in…', { dim: true }),
      ],
      SignInReady: ({ loginUrl, maybeProblem }) =>
        readyStepsOf(entries, loginUrl, maybeProblem),
      SignInConnecting: () => [Text('Connecting to Audible…', { dim: true })],
      SignInStuck: ({ problem }) => [
        Text(sentenceOf(problem)),
        Row({}, ...buttonsOf(entries, [TryAudibleSignInAgain.tag], 'Primary')),
      ],
    }),
  )

/**
 * Connecting Audible: Step 1 opens Amazon's sign-in in a new tab and says
 * the page it lands on looks broken; Step 2 is the field to paste that
 * page's address into, where Return connects. While the server prepares
 * the sign-in or connects, it says so. A wrong paste is said beside the
 * field; a sign-in Amazon refused or that ran out of time, above Step 1,
 * since the person opens a new one.
 *
 * @example
 * ```typescript
 * connectScreen(view, entries)
 * // Column: Connect Audible, Step 1 [Open Amazon sign-in], Step 2 [address field]
 * ```
 */
export const connectScreen = (view: AudibleView, entries: Entries): UiNode =>
  Column(
    { gap: 1 },
    Text('Connect Audible', { emphasis: 'Headline' }),
    Text(promise, { dim: true }),
    ...stepsOf(entries, view.audible.signIn),
  )

const countedWord = (
  count: number,
  singular: string,
  plural: string,
): string => (count === 1 ? `1 ${singular}` : `${count.toString()} ${plural}`)

const bookWord = (count: number): string => countedWord(count, 'book', 'books')

const wordList = new Intl.ListFormat('en', { type: 'conjunction' })

const listedWords = (words: ReadonlyArray<string>): string =>
  wordList.format(words)

const skipWordOf = (kind: SkipKind, count: number): string =>
  M.value(kind).pipe(
    M.withReturnType<string>(),
    M.when('Podcast', () => countedWord(count, 'podcast', 'podcasts')),
    M.when('AudiblePlusLoan', () =>
      countedWord(count, 'Audible Plus loan', 'Audible Plus loans'),
    ),
    M.when('Part', () =>
      countedWord(count, 'part of a longer book', 'parts of longer books'),
    ),
    M.when('Duplicate', () =>
      countedWord(count, 'second edition', 'second editions'),
    ),
    M.when('Other', () => countedWord(count, 'other title', 'other titles')),
    M.exhaustive,
  )

const skippedWordsOf = (
  skipped: ReadonlyArray<SkippedCount>,
): Option.Option<string> =>
  Array.match(skipped, {
    onEmpty: () => Option.none(),
    onNonEmpty: counts =>
      Option.some(
        listedWords(
          Array.map(counts, ({ kind, count }) => skipWordOf(kind, count)),
        ),
      ),
  })

const skippedSentenceOf = (
  skipped: ReadonlyArray<SkippedCount>,
): Option.Option<string> =>
  Option.map(
    skippedWordsOf(skipped),
    words => `Skipped ${words}, which Books does not import.`,
  )

const markWordOf = (mark: TitleMark): string =>
  M.value(mark).pipe(
    M.withReturnType<string>(),
    M.when('Free', () => 'Free'),
    M.when('Explicit', () => 'Explicit'),
    M.exhaustive,
  )

const markedItemOf = ({ mark, count }: MarkedCount): ListItem =>
  M.value(mark).pipe(
    M.withReturnType<ListItem>(),
    M.when('Free', () => ({
      key: 'marked-free',
      title: countedWord(count, 'free title', 'free titles'),
      lines: ['Imported, and marked free'],
    })),
    M.when('Explicit', () => ({
      key: 'marked-explicit',
      title: countedWord(count, 'explicit title', 'explicit titles'),
      lines: ['Imported, and marked explicit'],
    })),
    M.exhaustive,
  )

const leftOutWordOf = (field: LeftOutField): string =>
  M.value(field).pipe(
    M.withReturnType<string>(),
    M.when('Publisher', () => 'publisher'),
    M.when('SeriesName', () => 'series name'),
    M.when('ReleaseDate', () => 'full release date'),
    M.when('Contributors', () => 'other credits'),
    M.exhaustive,
  )

const leftOutWordsOf = (
  leftOut: ReadonlyArray<LeftOutField>,
): Option.Option<string> =>
  Array.match(leftOut, {
    onEmpty: () => Option.none(),
    onNonEmpty: fields =>
      Option.some(
        String.capitalize(listedWords(Array.map(fields, leftOutWordOf))),
      ),
  })

const runtimeOf = (title: AudibleTitle): Option.Option<string> =>
  Option.map(title.maybeRuntimeMs, runtimeMs =>
    TranscriptPlayer.leftWordsOf(runtimeMs).replace(' left', ''),
  )

const seriesOf = (series: SeriesPart): string =>
  Option.match(series.maybeSequence, {
    onNone: () => series.name,
    onSome: sequence => `${series.name}, book ${sequence}`,
  })

const detailOf = (title: AudibleTitle): string =>
  title.match === 'InLibrary'
    ? 'In your library'
    : Array.join(
        [
          ...Array.map(title.marks, markWordOf),
          ...Array.fromOption(runtimeOf(title)),
          ...Array.map(Array.take(title.series, 1), seriesOf),
        ],
        ' · ',
      )

const coverSize = 112

const imageOf = (title: AudibleTitle): Pick<ListItem, 'image'> =>
  Option.match(title.maybeCoverUrl, {
    onNone: () => ({}),
    onSome: src => ({
      image: {
        src,
        width: coverSize,
        height: coverSize,
        alt: `${title.name} cover`,
      },
    }),
  })

const titleItemOf = (
  entries: Entries,
  read: TitlesRead,
  title: AudibleTitle,
): ListItem => {
  const toggle = `${ToggleAudibleTitle.tag}:${title.asin}`
  const isOn = isOffered(entries, ToggleAudibleTitle.tag)
  return {
    key: title.asin,
    title: title.name,
    lines: [Array.join(title.authors, ', '), detailOf(title)],
    ...imageOf(title),
    check: {
      isChecked: isSelected(read, title.asin),
      label: `Import ${title.name}`,
      ...(isOn ? { action: toggle } : {}),
    },
    ...(isOn ? { action: toggle } : {}),
  }
}

const importButtonsOf = (
  entries: Entries,
  read: TitlesRead,
): ReadonlyArray<ButtonNode> =>
  Array.map(buttonsOf(entries, [ImportAudibleTitles.tag], 'Primary'), button =>
    Array.isReadonlyArrayEmpty(read.selected)
      ? button
      : { ...button, label: `Import ${bookWord(read.selected.length)}` },
  )

const countsOf = (read: TitlesRead): string => {
  const inLibrary = Array.filter(
    read.titles,
    title => title.match === 'InLibrary',
  ).length
  return inLibrary === 0
    ? `${bookWord(read.titles.length)} on Audible`
    : `${bookWord(read.titles.length)} on Audible · ${inLibrary.toString()} already in your library`
}

const skippedLines = (
  skipped: ReadonlyArray<SkippedCount>,
): ReadonlyArray<UiNode> =>
  Array.fromOption(
    Option.map(skippedSentenceOf(skipped), sentence =>
      Text(sentence, { dim: true }),
    ),
  )

const listOf = (entries: Entries, read: TitlesRead): ReadonlyArray<UiNode> =>
  Array.match(read.titles, {
    onEmpty: () => [
      Text('Your Audible library has no audiobooks to import.'),
      ...skippedLines(read.skipped),
    ],
    onNonEmpty: titles => [
      Text(countsOf(read), { dim: true }),
      ...skippedLines(read.skipped),
      ...problemLines(read.maybeProblem),
      Row(
        {},
        ...buttonsOf(
          entries,
          [SelectAllAudibleTitles.tag, DeselectAudibleTitles.tag],
          'Ghost',
        ),
      ),
      Text('Your Audible books', { dim: true }),
      List({
        label: 'Your Audible books',
        items: Array.map(titles, title => titleItemOf(entries, read, title)),
      }),
      Dock(Column({ gap: 1 }, Row({}, ...importButtonsOf(entries, read)))),
    ],
  })

const percentOf = (progress: ImportProgress): string =>
  `${Math.round((progress.done / Math.max(progress.total, 1)) * 100).toString()}%`

const progressWordsOf = (progress: ImportProgress): string =>
  M.value(progress.stage).pipe(
    M.withReturnType<string>(),
    M.when(
      'ReadingChapters',
      () =>
        `Reading chapters from Audible: ${progress.done.toString()} of ${bookWord(progress.total)}`,
    ),
    M.when(
      'AddingBooks',
      () => `Adding to your library: ${percentOf(progress)}`,
    ),
    M.exhaustive,
  )

const importingOf = (
  selectedCount: number,
  progress: ImportProgress,
): ReadonlyArray<UiNode> => [
  Text(`Importing ${bookWord(selectedCount)}…`),
  Progress({
    value: progress.done,
    max: Math.max(progress.total, 1),
    label: progressWordsOf(progress),
  }),
  Text(progressWordsOf(progress), { dim: true }),
  Text('You can keep using Books while this runs.', { dim: true }),
]

const headlineOf = (summary: ImportSummary): string => {
  if (summary.added > 0 && summary.matched > 0) {
    return `Added ${summary.added.toString()}, matched ${summary.matched.toString()}`
  } else if (summary.added > 0) {
    return `Added ${bookWord(summary.added)}`
  } else if (summary.matched > 0) {
    return `Matched ${bookWord(summary.matched)}`
  } else {
    return 'Nothing was added'
  }
}

const explanationOf = (summary: ImportSummary): Option.Option<string> =>
  Option.liftPredicate(
    Array.join(
      [
        ...(summary.matched > 0
          ? ['Matched books were already in your library.']
          : []),
        ...(summary.added > 0 ? ['The new ones have no audio yet.'] : []),
      ],
      ' ',
    ),
    String.isNonEmpty,
  )

const noteItemsOf = (
  summary: ImportSummary,
  skipped: ReadonlyArray<SkippedCount>,
): ReadonlyArray<ListItem> => [
  ...Array.fromOption(
    Option.map(skippedWordsOf(skipped), words => ({
      key: 'skipped',
      title: `Skipped ${words}`,
      lines: ['Books imports only the books you own'],
    })),
  ),
  ...Array.map(summary.marked, markedItemOf),
  {
    key: 'positions',
    title: 'Listening positions',
    lines: ['Not imported from Audible yet'],
  },
  ...Array.fromOption(
    Option.map(leftOutWordsOf(summary.leftOut), words => ({
      key: 'left-out',
      title: words,
      lines: ['Not kept: Books has no place for them yet'],
    })),
  ),
]

const importedOf = (
  summary: ImportSummary,
  skipped: ReadonlyArray<SkippedCount>,
  hostButtons: HostButtons,
): ReadonlyArray<UiNode> => [
  Text(headlineOf(summary), { emphasis: 'Headline' }),
  ...Array.fromOption(
    Option.map(explanationOf(summary), explanation =>
      Text(explanation, { dim: true }),
    ),
  ),
  Text('What the import did', { dim: true }),
  List({
    label: 'What the import did',
    items: noteItemsOf(summary, skipped),
  }),
  ...Array.match(summary.notAdded, {
    onEmpty: () => [],
    onNonEmpty: notAdded => [
      Text('Not added', { dim: true }),
      List({
        label: 'Not added',
        items: Array.map(notAdded, title => ({
          key: title.asin,
          title: title.name,
          lines: [title.reason],
        })),
      }),
    ],
  }),
  Row({}, ...hostButtons.openLibrary),
]

const unreadableOf = (
  entries: Entries,
  problem: AudibleProblem,
  hostButtons: HostButtons,
): ReadonlyArray<UiNode> => [
  Text(sentenceOf(problem)),
  Row(
    {},
    ...(problem._tag === 'LoginExpired'
      ? hostButtons.reconnect
      : buttonsOf(entries, [ReadAudibleLibraryAgain.tag], 'Primary')),
  ),
]

/**
 * The family member's Audible titles to choose from: each with its cover,
 * who wrote it, how long it runs or "In your library", whether it is free
 * or explicit, and a check, the new ones checked, with Select all and
 * Select none, and "Import 3 books" pinned at the bottom. Above the list,
 * what the importer skips, such as "Skipped 4 podcasts". While it imports,
 * how far along it is; then "Added 37, matched 3", what it skipped and
 * marked, such as "3 free titles.", what it did not keep, and the way back
 * to the library.
 *
 * @example
 * ```typescript
 * titlesScreen(view, entries, hostButtons)
 * // Column: Import from Audible, 42 books on Audible, [Select all] [Select none], Your Audible books, Dock([Import 39 books])
 * ```
 */
export const titlesScreen = (
  view: AudibleView,
  entries: Entries,
  hostButtons: HostButtons,
): UiNode =>
  Column(
    { gap: 1 },
    Text('Import from Audible', { emphasis: 'Headline' }),
    ...M.value(view.audible.titles).pipe(
      M.withReturnType<ReadonlyArray<UiNode>>(),
      M.tagsExhaustive({
        TitlesUnread: () => [Text('Reading your library…', { dim: true })],
        TitlesRead: read => listOf(entries, read),
        TitlesImporting: ({ selected, progress }) =>
          importingOf(selected.length, progress),
        TitlesImported: ({ summary, skipped }) =>
          importedOf(summary, skipped, hostButtons),
        TitlesUnreadable: ({ problem }) =>
          unreadableOf(entries, problem, hostButtons),
      }),
    ),
  )
