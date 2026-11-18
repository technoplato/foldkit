import { Schema as S } from 'effect'

/**
 * The version of `me.json` this page reads. The origin writes it from the
 * verified Access login; another version fails to decode.
 */
export const ME_SCHEMA_VERSION = 1

/**
 * `me.json`: who is signed in, read by the origin from the Access login it
 * verified, never from the request, and the names of the files that user's
 * own folder holds. The page shows a thing only when its file is named here:
 * `{ email: 'owner@example.com', files: ['understanding'] }`.
 */
export const Me = S.Struct({
  schemaVersion: S.Literal(ME_SCHEMA_VERSION),
  email: S.String,
  files: S.Array(S.String),
})
export type Me = typeof Me.Type

/** The file in a user's folder that holds their understanding profile. */
export const UNDERSTANDING_FILE = 'understanding'

/**
 * The version of `understanding.json` this page reads, which the exporter in
 * the Scribe repository (`scripts/me/me_export.py`) writes into each user's
 * folder; another version fails to decode.
 */
export const UNDERSTANDING_SCHEMA_VERSION = 1

/** A count nobody measured, and why. */
export const NotMeasured = S.TaggedStruct('NotMeasured', { reason: S.String })
export type NotMeasured = typeof NotMeasured.Type

/**
 * One area of the understanding profile as its newest rating has it: where a
 * course would teach it, a score out of 10, whether it is at proficient (a
 * problem in it found and fixed without an agent), when and by whom it was
 * rated, how many ratings it has had, and the links to the words behind it.
 */
export const UnderstandingArea = S.Struct({
  name: S.String,
  level: S.String,
  score: S.Number,
  isProficient: S.Boolean,
  ratedAt: S.String,
  by: S.String,
  ratings: S.Number,
  evidence: S.Array(S.String),
}).pipe(S.encodeKeys({ isProficient: 'proficient' }))
export type UnderstandingArea = typeof UnderstandingArea.Type

/** The count after one rating: the areas at proficient, of the areas rated by then. */
export const UnderstandingPoint = S.Struct({
  at: S.String,
  proficient: S.Number,
  areas: S.Number,
})
export type UnderstandingPoint = typeof UnderstandingPoint.Type

/** The count now: the areas the newest ratings put at proficient, of how many. */
export const UnderstandingCount = S.TaggedStruct('Measured', {
  proficient: S.Number,
  areas: S.Number,
})
export type UnderstandingCount = typeof UnderstandingCount.Type

/**
 * `understanding.json`: one user's understanding profile, its areas at
 * proficient now and after each rating, every area by its newest rating, how
 * it is counted, and the lines the exporter could not read. A count nobody
 * measured says why.
 */
export const Understanding = S.Struct({
  schemaVersion: S.Literal(UNDERSTANDING_SCHEMA_VERSION),
  generatedAt: S.String,
  source: S.String,
  method: S.String,
  count: S.Union([UnderstandingCount, NotMeasured]),
  list: S.Array(UnderstandingArea),
  history: S.Array(UnderstandingPoint),
  problems: S.Array(S.String),
})
export type Understanding = typeof Understanding.Type
