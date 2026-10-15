import { Match as M, Option } from 'effect'

import {
  type IssueAttachmentSource,
  type IssueReference,
} from '@foldkit/instant-tools/issues'

const MILLISECONDS_PER_SECOND = 1_000
const WEB_LINK_PATTERN = /^https?:\/\/\S+$/i

const secondsOf = (milliseconds: number): string =>
  `${(milliseconds / MILLISECONDS_PER_SECOND).toString()} s`

/**
 * One line naming what a reference points at: a Recording reads
 * `recording b24165ca-… 1961.74 s-1964.8 s`, a typed chat message reads its
 * note, another Issue reads `#692`, and a link reads itself.
 */
export const describeIssueReference = (reference: IssueReference): string =>
  M.value(reference).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Agent: ({ id }) => `agent ${id}`,
      Commit: ({ repository, sha }) => `commit ${sha} (${repository})`,
      Conversation: ({ conversation }) => conversation.note,
      Issue: ({ id }) => `#${id}`,
      Media: ({ id, kind }) => `${kind} ${id}`,
      Project: ({ productId, projectId }) =>
        `project ${productId}/${projectId}`,
      Recording: ({ recording }) =>
        `recording ${recording.recordingId} ${secondsOf(recording.startMilliseconds)}${Option.match(
          recording.endMilliseconds,
          {
            onNone: () => '',
            onSome: end => `-${secondsOf(end)}`,
          },
        )}`,
      Release: ({ productId, version }) => `release ${productId} ${version}`,
      Unrecognized: ({ value }) => JSON.stringify(value),
      Uri: ({ value }) => value,
    }),
  )

/**
 * The web address a value may open on a page: `https://words.pisspoursoftware.xyz/…`
 * may, while `javascript:alert(1)` or a bare path such as `/segments/7` stays
 * plain text.
 */
export const webLinkOf = (value: string): Option.Option<string> =>
  WEB_LINK_PATTERN.test(value) ? Option.some(value) : Option.none()

/** The web address a reference opens, when it is a web link. */
export const issueReferenceWebLink = (
  reference: IssueReference,
): Option.Option<string> =>
  reference._tag === 'Uri' ? webLinkOf(reference.value) : Option.none()

/** The web address an attachment opens, when it is stored at a web link. */
export const issueAttachmentWebLink = (
  source: IssueAttachmentSource,
): Option.Option<string> =>
  source._tag === 'Uri' ? webLinkOf(source.value) : Option.none()
