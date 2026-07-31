import { Array, Match as M, Schema as S } from 'effect'

const AllSubjects = S.TaggedStruct('AllSubjects', {})
const SelectedSubjects = S.TaggedStruct('SelectedSubjects', {
  subjectIds: S.Array(S.String.check(S.isNonEmpty())),
})

/** Selects every subject or an explicit acceptance-only subject allowlist. */
export const HeadlessSubjectScope = S.Union([AllSubjects, SelectedSubjects])

/** Selects every subject or an explicit acceptance-only subject allowlist. */
export type HeadlessSubjectScope = typeof HeadlessSubjectScope.Type

const EncodedSubjectIds = S.fromJsonString(
  S.Array(S.String.check(S.isNonEmpty())),
)

/** Reads an optional JSON subject allowlist without exposing its contents. */
export const headlessSubjectScopeFromEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): HeadlessSubjectScope => {
  const encodedSubjectIds =
    environment['FOLDKIT_INSTANT_COUNTER_SUBJECT_ALLOWLIST']
  if (encodedSubjectIds === undefined) {
    return AllSubjects.make({})
  }
  return SelectedSubjects.make({
    subjectIds: S.decodeUnknownSync(EncodedSubjectIds)(encodedSubjectIds),
  })
}

/** Checks whether one authenticated subject is inside the headless scope. */
export const includesHeadlessSubject = (
  scope: HeadlessSubjectScope,
  subjectId: string,
): boolean =>
  M.value(scope).pipe(
    M.tagsExhaustive({
      AllSubjects: () => true,
      SelectedSubjects: selected =>
        Array.contains(selected.subjectIds, subjectId),
    }),
  )
