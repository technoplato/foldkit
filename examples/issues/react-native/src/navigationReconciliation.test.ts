import {
  FileIssue,
  IssueDetail,
  IssueList,
  TriageInbox,
} from 'issues-core-example'
import { describe, expect, it } from 'vitest'

import { nativeIssueReconciliation } from './navigationReconciliation'

describe('nativeIssueReconciliation', () => {
  it('pushes every non-root typed destination onto the native stack', () => {
    expect(nativeIssueReconciliation(FileIssue.make({}), 'Issues')._tag).toBe(
      'PushedNativeIssueDestination',
    )
    expect(
      nativeIssueReconciliation(
        IssueDetail.make({ issueId: 'issue-041' }),
        'Issues',
      )._tag,
    ).toBe('PushedNativeIssueDestination')
    expect(nativeIssueReconciliation(TriageInbox.make({}), 'Issues')._tag).toBe(
      'PushedNativeIssueDestination',
    )
  })

  it('pops when the Program returns to its root', () => {
    expect(
      nativeIssueReconciliation(IssueList.make({}), 'Destination')._tag,
    ).toBe('PoppedNativeIssueDestination')
  })
})
