import {
  Context,
  Data,
  Effect,
  type Redacted,
  Schema as S,
  Stream,
} from 'effect'
import { ts } from 'foldkit/schema'

import { AudibleProblem, Unavailable } from './problem.js'
import {
  Asin,
  AudibleTitle,
  ImportProgress,
  ImportSummary,
  SkippedCount,
} from './title.js'

// SERVICE

/** Every path the Books server answers for the Audible import starts here. */
export const audiblePathPrefix = '/__books/audible/'

/** `POST`: starts an Amazon sign-in and answers its address. */
export const audibleStartPath = '/__books/audible/start'

/** `POST { redirectUrl }`: finishes the sign-in with the pasted address. */
export const audibleFinishPath = '/__books/audible/finish'

/** `GET`: the family member's Audible titles, each marked new or on the shelf. */
export const audibleLibraryPath = '/__books/audible/library'

/** `POST { asins }`: imports those titles, reporting progress as it goes. */
export const audibleImportPath = '/__books/audible/import'

/** The Amazon sign-in the server started: the address to open in a new tab. */
export const StartedSignIn = S.Struct({ loginUrl: S.String })
/** The Amazon sign-in the server started. */
export type StartedSignIn = typeof StartedSignIn.Type

/** `{"loginUrl":"https://www.amazon.com/ap/signin?…"}` */
export const StartedSignInJson = S.fromJsonString(S.toCodecJson(StartedSignIn))

/**
 * The address a person pasted after signing in, on its way to the server
 * that holds the sign-in's verifier. The only place it is ever plain text.
 */
export const FinishSignIn = S.Struct({ redirectUrl: S.String })
/** The address a person pasted after signing in. */
export type FinishSignIn = typeof FinishSignIn.Type

/** `{"redirectUrl":"https://www.amazon.com/ap/maplanding?…"}` */
export const FinishSignInJson = S.fromJsonString(S.toCodecJson(FinishSignIn))

/**
 * The family member's Audible titles the importer would bring in, newest
 * purchase first, and how many it leaves out and why, such as 4 podcasts.
 */
export const AudibleLibrary = S.Struct({
  titles: S.Array(AudibleTitle),
  skipped: S.Array(SkippedCount),
})
/** The family member's Audible titles. */
export type AudibleLibrary = typeof AudibleLibrary.Type

/** `{"titles":[…]}` */
export const AudibleLibraryJson = S.fromJsonString(
  S.toCodecJson(AudibleLibrary),
)

/** The titles a person chose to import, by ASIN. */
export const ImportRequest = S.Struct({ asins: S.Array(Asin) })
/** The titles a person chose to import. */
export type ImportRequest = typeof ImportRequest.Type

/** `{"asins":["B002V0RAUU"]}` */
export const ImportRequestJson = S.fromJsonString(S.toCodecJson(ImportRequest))

/** The import moved on: 12 of 40 titles' chapters read. */
export const ImportAdvanced = ts('ImportAdvanced', { progress: ImportProgress })
/** The import is done, and what it did. */
export const ImportFinished = ts('ImportFinished', { summary: ImportSummary })
/** The import stopped before it was done, and why. */
export const ImportStopped = ts('ImportStopped', { problem: AudibleProblem })

/** One thing the server says while an import runs. */
export const ImportEvent = S.Union([
  ImportAdvanced,
  ImportFinished,
  ImportStopped,
])
/** One thing the server says while an import runs. */
export type ImportEvent = typeof ImportEvent.Type

/** One import event as the JSON of one Server-Sent Event's `data` line. */
export const ImportEventJson = S.fromJsonString(S.toCodecJson(ImportEvent))

/** The name of the Server-Sent Event that carries an import event. */
export const importEventName = 'import'

/** What an import reports before it stops: progress, then the summary. */
export const ImportUpdate = S.Union([ImportAdvanced, ImportFinished])
/** What an import reports before it stops. */
export type ImportUpdate = typeof ImportUpdate.Type

/** Why a request failed, as the server answers it: `{"problem":{…}}`. */
export const ProblemBody = S.Struct({ problem: AudibleProblem })
/** Why a request failed. */
export type ProblemBody = typeof ProblemBody.Type

/** `{"problem":{"_tag":"LoginExpired"}}` */
export const ProblemBodyJson = S.fromJsonString(S.toCodecJson(ProblemBody))

/** An Audible import step could not happen, and why, safe to show. */
export class AudibleImportError extends Data.TaggedError('AudibleImportError')<{
  readonly problem: AudibleProblem
}> {}

/**
 * What the Audible import needs from the host: start an Amazon sign-in,
 * finish it with the address a person pasted, read the family member's
 * titles, and import some of them. The browser and the terminals call the
 * Books server, which keeps every Audible login to itself.
 */
export type AudibleImportShape = Readonly<{
  startSignIn: Effect.Effect<StartedSignIn, AudibleImportError>
  finishSignIn: (
    address: Redacted.Redacted<string>,
  ) => Effect.Effect<void, AudibleImportError>
  readLibrary: Effect.Effect<AudibleLibrary, AudibleImportError>
  importTitles: (
    asins: ReadonlyArray<Asin>,
  ) => Stream.Stream<ImportUpdate, AudibleImportError>
}>

const cannotImport = new AudibleImportError({
  problem: Unavailable({
    reason: 'this copy of Books has no way to reach Audible',
  }),
})

/**
 * The host's Audible import. A host that gives none, such as a test of
 * the player, gets one that says it cannot reach Audible, so Books still
 * runs there and the import screens say why they stop.
 *
 * @example
 * ```typescript
 * Layer.succeed(AudibleImport, httpAudibleImport({ origin: '' }))
 * ```
 */
export const AudibleImport = Context.Reference<AudibleImportShape>(
  'books/AudibleImport',
  {
    defaultValue: () => ({
      startSignIn: Effect.fail(cannotImport),
      finishSignIn: () => Effect.fail(cannotImport),
      readLibrary: Effect.fail(cannotImport),
      importTitles: () => Stream.fail(cannotImport),
    }),
  },
)
