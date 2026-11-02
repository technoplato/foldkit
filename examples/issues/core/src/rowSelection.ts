import { Array, Option } from 'effect'

import { type Issue } from '@foldkit/instant-tools/issues'

import {
  type RowDirection,
  issueUnderCursorOf,
  movedRowCursor,
  rowsInOrderOf,
  selectedSetOf,
} from './listing.js'
import { type Model, type SelectionRun, nextModel } from './model.js'

const uniqueIds = (ids: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.fromIterable(new Set(ids))

const idsBetween = (
  rows: ReadonlyArray<Issue>,
  fromId: string,
  toId: string,
): ReadonlyArray<string> => {
  const maybeFrom = Array.findFirstIndex(rows, issue => issue.id === fromId)
  const maybeTo = Array.findFirstIndex(rows, issue => issue.id === toId)
  return Option.getOrElse(
    Option.zipWith(maybeFrom, maybeTo, (from, to) =>
      Array.map(
        rows.slice(Math.min(from, to), Math.max(from, to) + 1),
        issue => issue.id,
      ),
    ),
    () => [toId],
  )
}

const runOf = (model: Model, fallbackAnchorId: string): SelectionRun =>
  Option.getOrElse(model.maybeSelectionRun, () => ({
    anchorId: Option.match(issueUnderCursorOf(model), {
      onNone: () => fallbackAnchorId,
      onSome: issue => issue.id,
    }),
    chosenBefore: model.selectedIssueIds,
  }))

/**
 * Extends the selection to one row: everything between where the run started
 * and that row is selected, on top of what was selected before the run, and
 * the cursor lands there. Going back over the run lets go of what it passes.
 */
export const selectionExtendedTo = (model: Model, issueId: string): Model => {
  const run = runOf(model, issueId)
  return nextModel({
    ...model,
    maybeRowCursor: Option.some(issueId),
    maybeSelectionRun: Option.some(run),
    selectedIssueIds: uniqueIds([
      ...run.chosenBefore,
      ...idsBetween(rowsInOrderOf(model), run.anchorId, issueId),
    ]),
  })
}

/** Extends the selection one row up or down from the cursor. */
export const selectionExtendedBy = (
  model: Model,
  direction: RowDirection,
): Model =>
  Option.match(
    movedRowCursor(rowsInOrderOf(model), model.maybeRowCursor, direction),
    {
      onNone: () => model,
      onSome: issueId => selectionExtendedTo(model, issueId),
    },
  )

/** Selects one row, or lets go of it when it is selected. */
export const selectionToggled = (model: Model, issueId: string): Model =>
  nextModel({
    ...model,
    maybeSelectionRun: Option.none(),
    selectedIssueIds: selectedSetOf(model).has(issueId)
      ? Array.filter(model.selectedIssueIds, id => id !== issueId)
      : Array.append(model.selectedIssueIds, issueId),
  })
