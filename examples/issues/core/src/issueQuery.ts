import { Option } from 'effect'

import { IssueQuery } from '@foldkit/instant-tools/issues'

/**
 * The most Issues one catalog read returns, newest first. The earlier limit of
 * 500 hid every Issue after #522 once the catalog passed 500 (#591).
 */
export const ISSUE_QUERY_LIMIT = 2_000

/** Reads every product's Issues, newest first, up to `ISSUE_QUERY_LIMIT`. */
export const catalogIssueQuery = IssueQuery.make({
  limit: ISSUE_QUERY_LIMIT,
  productId: Option.none(),
  projectId: Option.none(),
  statuses: [],
})
