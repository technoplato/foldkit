import { Option } from 'effect'

import { IssueQuery } from '@foldkit/instant-tools/issues'

/**
 * Reads every product's Issues, newest first, and every one of them: the list,
 * search, backlinks and chips all read this catalog, so a cap would hide its
 * oldest Issues as it grows. Caps of 500 (#591) and 2,000 (#1538) did.
 */
export const catalogIssueQuery = IssueQuery.make({
  limit: Number.MAX_SAFE_INTEGER,
  productId: Option.none(),
  projectId: Option.none(),
  statuses: [],
})
