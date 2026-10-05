import {
  Array,
  Cause,
  Effect,
  Layer,
  Match as M,
  Option,
  Queue,
  Schema as S,
  Stream,
  String,
} from 'effect'
import { join } from 'node:path'

import { init } from '@instantdb/admin'

import {
  type AppliedAudibleImport,
  type AppliedTitle,
  type AudibleImportJournal,
  type AudibleImportPlan,
  type PlannedTitle as ScribePlannedTitle,
  type SkipKind as ScribeSkipKind,
  type TitleFlag,
  WRITE_ORDER,
  applyAudibleImport,
  emptyJournal,
  mergeJournals,
  planAudibleImport,
} from '../audibleImport.node.js'
import {
  type ImportOwner,
  LibraryImport,
  LibraryImportError,
  PlannedInLibrary,
  PlannedNew,
  PlannedSkip,
  type PlannedTitle,
  type TitleDetailsResult,
} from './libraryImport.js'
import { ImportAdvanced, ImportFinished, type ImportUpdate } from './service.js'
import {
  Asin,
  type ImportSummary,
  type LeftOutField,
  type MarkedCount,
  type NotAddedTitle,
  type SkipKind,
  type TitleMark,
} from './title.js'
import {
  directoryReadyAt,
  memberFileStem,
  textIfPresentAt,
  writtenPrivately,
} from './vault.node.js'

// SCRIBE IMPORT

/**
 * Where the importer writes and keeps its journals: the Instant app that
 * holds the library, its admin token, and the folder of the encrypted
 * logins, where each member's journal sits beside their login.
 */
export type ScribeImportConfig = Readonly<{
  appId: string
  adminToken: string
  journalDirectory: string
}>

const reasonOf = (error: unknown): string =>
  error instanceof Error && String.isNonEmpty(error.message)
    ? error.message
    : 'the importer stopped'

const markFlags: ReadonlyArray<Readonly<{ mark: TitleMark; flag: TitleFlag }>> =
  [
    { mark: 'Free', flag: 'free' },
    { mark: 'Explicit', flag: 'adult' },
  ]

const marksOf = (flags: ReadonlyArray<TitleFlag>): ReadonlyArray<TitleMark> =>
  Array.map(
    Array.filter(markFlags, ({ flag }) => Array.contains(flags, flag)),
    ({ mark }) => mark,
  )

const skipKindOf = (skip: ScribeSkipKind): Option.Option<SkipKind> =>
  M.value(skip).pipe(
    M.withReturnType<Option.Option<SkipKind>>(),
    M.when('podcast', () => Option.some('Podcast')),
    M.when('audiblePlus', () => Option.some('AudiblePlusLoan')),
    M.when('part', () => Option.some('Part')),
    M.when('duplicate', () => Option.some('Duplicate')),
    M.when('demoRow', () => Option.some('SampleMatch')),
    M.when('ambiguous', () => Option.some('ShelfConflict')),
    M.when('unchanged', () => Option.none()),
    M.orElse(() => Option.some('Other')),
  )

const plannedOf = (title: ScribePlannedTitle): Option.Option<PlannedTitle> =>
  Option.map(S.decodeUnknownOption(Asin)(title.asin), asin => {
    const marks = marksOf(title.flags)
    if (title.action === 'create') {
      return PlannedNew({ asin, marks })
    } else if (title.action === 'update') {
      return PlannedInLibrary({ asin, marks })
    } else {
      return Option.match(
        Option.flatMap(Option.fromNullishOr(title.skip), skipKindOf),
        {
          onNone: () => PlannedInLibrary({ asin, marks }),
          onSome: kind => PlannedSkip({ asin, kind }),
        },
      )
    }
  })

/**
 * How Books shows the importer's plan: a title it would create is new, one
 * it would update or finds unchanged is in the library, and one it skips
 * says why, such as a podcast. A title without a valid ASIN is left out.
 *
 * @example
 * ```typescript
 * plannedTitlesOf(planFromSnapshot({ library, owner, snapshot, nowMs }))
 * // [PlannedNew({ asin: 'B0FAKE0001', marks: ['Free'] }), PlannedSkip({ asin: 'B0FAKEPOD1', kind: 'Podcast' })]
 * ```
 */
export const plannedTitlesOf = (
  plan: AudibleImportPlan,
): ReadonlyArray<PlannedTitle> =>
  Array.getSomes(Array.map(plan.titles, plannedOf))

/**
 * The bridge's chapters as the importer reads them, the lines the helper's
 * `details` command prints: `{ asin, chapters: [{ title, startMs,
 * lengthMs }], runtimeMs }`, and an error line for a title Audible would
 * not describe.
 */
const detailLinesOf = (
  results: ReadonlyArray<TitleDetailsResult>,
): ReadonlyArray<unknown> =>
  Array.map(results, result =>
    Option.match(result.maybeDetails, {
      onNone: () => ({ asin: result.asin, error: { kind: 'Unavailable' } }),
      onSome: details => ({
        asin: details.asin,
        chapters: Array.map(details.chapters, chapter => ({
          title: chapter.name,
          startMs: chapter.startMs,
          lengthMs: chapter.endMs - chapter.startMs,
        })),
        ...Option.match(details.maybeRuntimeMs, {
          onNone: () => ({}),
          onSome: runtimeMs => ({ runtimeMs }),
        }),
      }),
    }),
  )

const unshelvedProblems: ReadonlyArray<string> = [
  'its book is not readable',
  'its book has no item',
  'a row it changes moved',
]

/** True when the title reached the shelf, even if, say, its cover did not. */
const isShelved = (title: AppliedTitle): boolean =>
  !Array.some(title.problems, problem =>
    Array.some(unshelvedProblems, start => String.startsWith(start)(problem)),
  )

const isListedPlan = (title: ScribePlannedTitle): boolean =>
  title.action !== 'skip' || title.skip === 'unchanged'

const isShelvedPlan =
  (applied: AppliedAudibleImport) =>
  (title: ScribePlannedTitle): boolean =>
    title.action === 'skip'
      ? title.skip === 'unchanged'
      : Array.some(
          applied.titles,
          written => written.asin === title.asin && isShelved(written),
        )

const markedOf = (
  plan: AudibleImportPlan,
  applied: AppliedAudibleImport,
): ReadonlyArray<MarkedCount> => {
  const listed = Array.filter(plan.titles, isShelvedPlan(applied))
  return Array.getSomes(
    Array.map(markFlags, ({ mark, flag }) => {
      const count = Array.filter(listed, title =>
        Array.contains(title.flags, flag),
      ).length
      return count === 0 ? Option.none() : Option.some({ mark, count })
    }),
  )
}

type NotCarriedCounts = AudibleImportPlan['summary']['notCarried']

const leftOutCounts: ReadonlyArray<
  Readonly<{
    field: LeftOutField
    countOf: (counts: NotCarriedCounts) => number
  }>
> = [
  { field: 'Publisher', countOf: counts => counts.publisher },
  { field: 'SeriesName', countOf: counts => counts.series },
  { field: 'ReleaseDate', countOf: counts => counts.releaseDate },
  { field: 'Contributors', countOf: counts => counts.contributors },
]

const leftOutOf = (plan: AudibleImportPlan): ReadonlyArray<LeftOutField> =>
  Array.map(
    Array.filter(
      leftOutCounts,
      ({ countOf }) => countOf(plan.summary.notCarried) > 0,
    ),
    ({ field }) => field,
  )

const notAddedOf = (
  plan: AudibleImportPlan,
  applied: AppliedAudibleImport,
): ReadonlyArray<NotAddedTitle> => [
  ...Array.getSomes(
    Array.map(
      Array.filter(
        applied.titles,
        title => title.action !== 'skip' && !isShelved(title),
      ),
      title =>
        Option.map(S.decodeUnknownOption(Asin)(title.asin), asin => ({
          asin,
          name: title.title,
          reason: Array.join(title.problems, '; '),
        })),
    ),
  ),
  ...Array.getSomes(
    Array.map(
      Array.filter(plan.titles, title => !isListedPlan(title)),
      title =>
        Option.map(S.decodeUnknownOption(Asin)(title.asin), asin => ({
          asin,
          name: title.title,
          reason: title.reason,
        })),
    ),
  ),
]

/**
 * What an import did, from its plan and what applying it wrote: titles
 * added, titles matched to books on the shelf, those it could not add, the
 * marks it put on them, and what the library has no place for. A title is
 * added once its book reached the shelf, even if its cover did not.
 *
 * @example
 * ```typescript
 * importSummaryOf(plan, applied)
 * // { added: 37, matched: 3, notAdded: [], marked: [{ mark: 'Free', count: 3 }], leftOut: ['Publisher'] }
 * ```
 */
export const importSummaryOf = (
  plan: AudibleImportPlan,
  applied: AppliedAudibleImport,
): ImportSummary => ({
  added: Array.filter(
    applied.titles,
    title => title.action === 'create' && isShelved(title),
  ).length,
  matched:
    Array.filter(
      applied.titles,
      title => title.action === 'update' && isShelved(title),
    ).length +
    Array.filter(
      plan.titles,
      title => title.action === 'skip' && title.skip === 'unchanged',
    ).length,
  notAdded: notAddedOf(plan, applied),
  marked: markedOf(plan, applied),
  leftOut: leftOutOf(plan),
})

/**
 * How many progress lines applying a plan prints: one per kind of row it
 * writes, one for its links, and one per cover.
 */
const stepsOf = (plan: AudibleImportPlan): number => {
  const acting = Array.filter(plan.titles, title => title.action !== 'skip')
  const rows = [...plan.people, ...Array.flatMap(acting, title => title.rows)]
  const rowKinds = Array.filter(WRITE_ORDER, namespace =>
    Array.some(rows, row => row.namespace === namespace),
  ).length
  const hasLinks = Array.some(
    acting,
    title => !Array.isReadonlyArrayEmpty(title.links),
  )
  return Math.max(1, rowKinds + (hasLinks ? 1 : 0) + plan.summary.coversToFetch)
}

const JournalJson = S.fromJsonString(S.Unknown)

const journalPathOf = (directory: string, owner: ImportOwner): string =>
  join(directory, `${memberFileStem(owner)}.journal.json`)

const isJournal = (value: unknown): value is AudibleImportJournal =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  value.kind === 'audibleImportJournal'

/**
 * Keeps an import's journal beside the member's login, merged with the
 * ones before it, mode 600, so `deleteAudibleImport` can undo every
 * import of theirs.
 */
const savedJournal = (
  directory: string,
  owner: ImportOwner,
  journal: AudibleImportJournal,
) =>
  Effect.gen(function* () {
    const path = journalPathOf(directory, owner)
    const maybeText = yield* textIfPresentAt(path)
    const maybeOlder = Option.filter(
      Option.flatMap(maybeText, S.decodeUnknownOption(JournalJson)),
      isJournal,
    )
    const merged = Option.match(maybeOlder, {
      onNone: () => mergeJournals(emptyJournal(journal.ownerID), journal),
      onSome: older => mergeJournals(older, journal),
    })
    yield* directoryReadyAt(directory)
    yield* writtenPrivately(path, JSON.stringify(merged, null, 2))
  })

/**
 * The Scribe repository's Audible importer as Books' LibraryImport. `plan`
 * runs `planAudibleImport` on the member's Audible rows, which reads their
 * shelf and writes nothing. `apply` plans the chosen ASINs with their
 * chapters, runs `applyAudibleImport` as the member, reports each step it
 * prints, and keeps the journal beside the member's login.
 *
 * NOTE: `../audibleImport.node.ts` is a byte-for-byte copy of
 * `scripts/universal-schema/audible-import.ts` on the Scribe repository's
 * `agent/foldkit/audible-import` branch, SHA-256 `0fd54ff9b048463973a2ec0550aeece2d0118fe641eda8dee0324b1d13ea72e7`.
 * Update it by copying the file again, unchanged; prettier and oxlint skip
 * it.
 *
 * @example
 * ```typescript
 * scribeLibraryImport({ appId, adminToken, journalDirectory: defaultCredentialsDirectory })
 * ```
 */
export const scribeLibraryImport = (config: ScribeImportConfig) =>
  Layer.sync(LibraryImport, () => {
    const database = init({
      appId: config.appId,
      adminToken: config.adminToken,
    })
    return LibraryImport.of({
      plan: ({ owner, library }) =>
        Effect.map(
          Effect.tryPromise({
            try: () =>
              planAudibleImport({
                library: { items: library },
                ownerEmail: owner.email,
                database,
              }),
            catch: error => new LibraryImportError({ reason: reasonOf(error) }),
          }),
          plannedTitlesOf,
        ),
      apply: ({ owner, library, asins, details }) =>
        Stream.callback<ImportUpdate, LibraryImportError>(queue =>
          Effect.tryPromise({
            try: async () => {
              const plan = await planAudibleImport({
                library: { items: library },
                ownerEmail: owner.email,
                database,
                asins,
                details: detailLinesOf(details),
              })
              const total = stepsOf(plan)
              let done = 0
              Queue.offerUnsafe(
                queue,
                ImportAdvanced({
                  progress: { stage: 'AddingBooks', done, total },
                }),
              )
              const applied = await applyAudibleImport(plan, {
                database,
                onProgress: () => {
                  done = Math.min(total, done + 1)
                  Queue.offerUnsafe(
                    queue,
                    ImportAdvanced({
                      progress: { stage: 'AddingBooks', done, total },
                    }),
                  )
                },
              })
              return { plan, applied }
            },
            catch: error => new LibraryImportError({ reason: reasonOf(error) }),
          }).pipe(
            Effect.tap(({ applied }) =>
              Effect.mapError(
                savedJournal(config.journalDirectory, owner, applied.journal),
                () =>
                  new LibraryImportError({
                    reason: 'the import was written, but its journal was not',
                  }),
              ),
            ),
            Effect.match({
              onFailure: error => {
                Queue.failCauseUnsafe(queue, Cause.fail(error))
              },
              onSuccess: ({ plan, applied }) => {
                Queue.offerUnsafe(
                  queue,
                  ImportFinished({ summary: importSummaryOf(plan, applied) }),
                )
                Queue.endUnsafe(queue)
              },
            }),
          ),
        ),
    })
  })
