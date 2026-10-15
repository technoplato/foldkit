import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  IssueAttachment,
  UnrecognizedReference,
  UriAttachmentSource,
  UriReference,
} from '@foldkit/instant-tools/issues'

import {
  describeIssueReference,
  issueAttachmentWebLink,
  issueReferenceWebLink,
} from './reference.js'

describe('Issue references on a page', () => {
  it('names a reporter stored as a bare name by the name, without quotes', () => {
    expect(
      describeIssueReference(UnrecognizedReference.make({ value: 'Michael' })),
    ).toBe('Michael')
    expect(
      describeIssueReference(
        UnrecognizedReference.make({ value: { id: 'rec-228', label: 'R' } }),
      ),
    ).toBe('{"id":"rec-228","label":"R"}')
  })

  it('opens only http and https links', () => {
    expect(
      issueReferenceWebLink(
        UriReference.make({ value: 'https://words.pisspoursoftware.xyz/x' }),
      ),
    ).toEqual(Option.some('https://words.pisspoursoftware.xyz/x'))
    expect(
      issueReferenceWebLink(
        UriReference.make({ value: 'javascript:alert(1)' }),
      ),
    ).toEqual(Option.none())
    expect(
      issueReferenceWebLink(UriReference.make({ value: '/segments/7' })),
    ).toEqual(Option.none())
    expect(
      issueAttachmentWebLink(
        IssueAttachment.make({
          byteCount: Option.none(),
          capturedAtMs: Option.none(),
          contentType: 'image/png',
          fileName: 'shot.png',
          id: 'attachment-1',
          issueId: '695',
          kind: 'Screenshot',
          sha256: Option.none(),
          source: UriAttachmentSource.make({
            value: 'data:image/png;base64,AA',
          }),
        }).source,
      ),
    ).toEqual(Option.none())
  })
})
