import {
  Array,
  Context,
  Data,
  Effect,
  Layer,
  Option,
  Ref,
  Schema as S,
  Stream,
} from 'effect'
import { ts } from 'foldkit/schema'

import { Milliseconds } from '../ids.js'
import { ImportAdvanced, ImportFinished, type ImportUpdate } from './service.js'
import { Asin, type MarkedCount, SkipKind, TitleMark } from './title.js'

// LIBRARY IMPORT

/** One chapter as Audible reports it: its name, and where it starts and ends. */
export const AudibleChapter = S.Struct({
  name: S.String,
  startMs: Milliseconds,
  endMs: Milliseconds,
})
/** One chapter as Audible reports it. */
export type AudibleChapter = typeof AudibleChapter.Type

/** Where the family member last was in a title on Audible, and when. */
export const AudiblePosition = S.Struct({
  positionMs: Milliseconds,
  maybeUpdatedAt: S.Option(S.String),
})
/** Where the family member last was in a title on Audible. */
export type AudiblePosition = typeof AudiblePosition.Type

/**
 * What Audible says about one title beyond the library list: its
 * chapters, its exact length, the last place the family member heard, and
 * Audible's own record of it, kept as Audible sent it.
 */
export const TitleDetails = S.Struct({
  asin: Asin,
  chapters: S.Array(AudibleChapter),
  maybeRuntimeMs: S.Option(Milliseconds),
  maybePosition: S.Option(AudiblePosition),
  source: S.Unknown,
})
/** What Audible says about one title beyond the library list. */
export type TitleDetails = typeof TitleDetails.Type

/**
 * What the helper read for one chosen title: its details, or None when
 * Audible would not give them, such as a title it no longer sells.
 */
export type TitleDetailsResult = Readonly<{
  asin: Asin
  maybeDetails: Option.Option<TitleDetails>
}>

/**
 * The family member an import is for: the email their Cloudflare Access
 * login verified, lowercased, such as `listener@example.invalid`.
 */
export type ImportOwner = Readonly<{ email: string }>

/** A title the importer would add, and what it would note about it. */
export const PlannedNew = ts('PlannedNew', {
  asin: Asin,
  marks: S.Array(TitleMark),
})
/** A title the shelf already has, which the importer would only fill in. */
export const PlannedInLibrary = ts('PlannedInLibrary', {
  asin: Asin,
  marks: S.Array(TitleMark),
})
/** A title the importer leaves out, and why. */
export const PlannedSkip = ts('PlannedSkip', { asin: Asin, kind: SkipKind })
/** How the importer stands on one Audible title. */
export const PlannedTitle = S.Union([PlannedNew, PlannedInLibrary, PlannedSkip])
/** How the importer stands on one Audible title. */
export type PlannedTitle = typeof PlannedTitle.Type

/** The importer could not plan or finish, and why, safe to show. */
export class LibraryImportError extends Data.TaggedError('LibraryImportError')<{
  readonly reason: string
}> {}

/**
 * What adds Audible titles to the library, given Audible's own library
 * rows, as the helper read them. `plan` says, for each title, whether the
 * importer would add it, finds it on the shelf already, or leaves it out.
 * `apply` imports the chosen ASINs with their chapters and reports how far
 * it is, then what it did. The live one is the importer vendored from the
 * Scribe repository; tests use {@link makeTestLibraryImport}.
 */
export class LibraryImport extends Context.Service<
  LibraryImport,
  Readonly<{
    plan: (
      input: Readonly<{
        owner: ImportOwner
        library: ReadonlyArray<unknown>
      }>,
    ) => Effect.Effect<ReadonlyArray<PlannedTitle>, LibraryImportError>
    apply: (
      input: Readonly<{
        owner: ImportOwner
        library: ReadonlyArray<unknown>
        asins: ReadonlyArray<Asin>
        details: ReadonlyArray<TitleDetailsResult>
      }>,
    ) => Stream.Stream<ImportUpdate, LibraryImportError>
  }>
>()('books/LibraryImport') {}

const asinOfRow = (row: unknown): Option.Option<Asin> =>
  typeof row === 'object' && row !== null && 'asin' in row
    ? S.decodeUnknownOption(Asin)(row.asin)
    : Option.none()

/** The ASINs of Audible's library rows, in order, leaving out a row without one. */
export const asinsOfLibrary = (
  library: ReadonlyArray<unknown>,
): ReadonlyArray<Asin> => Array.getSomes(Array.map(library, asinOfRow))

/**
 * The importer for a Books server that cannot write the library, such as
 * one with no Instant admin token: every title plans as new, and every
 * import is refused with a sentence that says why.
 */
export const unwiredLibraryImport = Layer.succeed(LibraryImport, {
  plan: ({ library }) =>
    Effect.succeed(
      Array.map(asinsOfLibrary(library), asin =>
        PlannedNew({ asin, marks: [] }),
      ),
    ),
  apply: () =>
    Stream.fail(
      new LibraryImportError({
        reason: 'this Books server has no way to write your library',
      }),
    ),
})

const everyMark: ReadonlyArray<TitleMark> = ['Free', 'Explicit']

/**
 * How many of the planned titles carry each mark, the marks none carries
 * left out: `[{ mark: 'Free', count: 3 }]`.
 */
export const markedCountsOf = (
  planned: ReadonlyArray<PlannedTitle>,
): ReadonlyArray<MarkedCount> =>
  Array.getSomes(
    Array.map(everyMark, mark => {
      const count = Array.filter(
        planned,
        title =>
          title._tag !== 'PlannedSkip' && Array.contains(title.marks, mark),
      ).length
      return count === 0 ? Option.none() : Option.some({ mark, count })
    }),
  )

/** What a test importer was asked to apply, in order. */
export type AppliedImport = Readonly<{
  owner: ImportOwner
  asins: ReadonlyArray<Asin>
  details: ReadonlyArray<TitleDetailsResult>
}>

/**
 * How a test importer plans: the ASINs the shelf already has, the ones it
 * leaves out and why, and the marks it notes. Every other title is new.
 */
export type TestImportRules = Readonly<{
  inLibrary: ReadonlyArray<string>
  skipped?: ReadonlyArray<Readonly<{ asin: string; kind: SkipKind }>>
  marked?: ReadonlyArray<Readonly<{ asin: string; mark: TitleMark }>>
  stepDelay?: Effect.Effect<void>
}>

const plannedOf = (rules: TestImportRules, asin: Asin): PlannedTitle => {
  const marks = Array.map(
    Array.filter(rules.marked ?? [], marked => marked.asin === asin),
    marked => marked.mark,
  )
  return Option.match(
    Array.findFirst(rules.skipped ?? [], skipped => skipped.asin === asin),
    {
      onSome: skipped => PlannedSkip({ asin, kind: skipped.kind }),
      onNone: () =>
        Array.contains(rules.inLibrary, asin)
          ? PlannedInLibrary({ asin, marks })
          : PlannedNew({ asin, marks }),
    },
  )
}

/**
 * An importer held in memory, for tests: it plans by `rules`, reports one
 * step per chosen title, then adds the new ones and matches the rest, and
 * records every import. Every Books server ships the vendored importer.
 *
 * @example
 * ```typescript
 * const importer = yield* makeTestLibraryImport({ inLibrary: ['B0FAKE0002'] })
 * ```
 */
export const makeTestLibraryImport = (rules: TestImportRules) =>
  Effect.map(Ref.make<ReadonlyArray<AppliedImport>>([]), applied => ({
    applied: Ref.get(applied),
    layer: Layer.succeed(LibraryImport, {
      plan: ({ library }) =>
        Effect.succeed(
          Array.map(asinsOfLibrary(library), asin => plannedOf(rules, asin)),
        ),
      apply: ({ owner, asins, details }) => {
        const planned = Array.map(asins, asin => plannedOf(rules, asin))
        const total = asins.length
        const matched = Array.filter(
          planned,
          title => title._tag === 'PlannedInLibrary',
        ).length
        const added = Array.filter(
          planned,
          title => title._tag === 'PlannedNew',
        ).length
        return Stream.concat(
          Stream.fromEffect(
            Effect.as(
              Ref.update(applied, all =>
                Array.append(all, { owner, asins, details }),
              ),
              ImportAdvanced({
                progress: { stage: 'AddingBooks', done: 0, total },
              }),
            ),
          ),
          Stream.concat(
            Stream.mapEffect(Stream.range(1, total), done =>
              Effect.as(
                rules.stepDelay ?? Effect.void,
                ImportAdvanced({
                  progress: { stage: 'AddingBooks', done, total },
                }),
              ),
            ),
            Stream.make(
              ImportFinished({
                summary: {
                  added,
                  matched,
                  notAdded: [],
                  marked: markedCountsOf(planned),
                  leftOut: [],
                },
              }),
            ),
          ),
        )
      },
    }),
  }))
