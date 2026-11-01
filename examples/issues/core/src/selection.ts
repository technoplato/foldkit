import { Option } from 'effect'

import { SelectedIssue } from './message.js'

const selectIssueMessages = new Map<string, typeof SelectedIssue.Type>()

/**
 * The Message that opens an Issue, made once per Issue: Scribe's page offers
 * all 1,330 of its Issues on every paint, and `SelectedIssue.make` would
 * parse each again. `selectIssueMessageOf('1538')` is always the same value.
 */
export const selectIssueMessageOf = (
  issueId: string,
): typeof SelectedIssue.Type =>
  Option.getOrElse(
    Option.fromUndefinedOr(selectIssueMessages.get(issueId)),
    () => {
      const message = SelectedIssue.make({ issueId })
      selectIssueMessages.set(issueId, message)
      return message
    },
  )
