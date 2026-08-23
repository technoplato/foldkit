import { Array, Option } from 'effect'
import { Program } from 'foldkit'

import { type Message } from './message.js'
import { type Model } from './model.js'

/**
 * One Action catalog row for a later menu or LLM. No send. No chrome.
 * Puzzle Actions have no fields, so payload is empty.
 */
export type ListedAction = Readonly<{
  token: string
  keys: ReadonlyArray<string>
  valid: boolean
  disabled: boolean
  hiddenBecause: string | undefined
  payload: Readonly<Record<string, never>>
}>

/**
 * Projects Program.valid into a send-free Action catalog.
 * Menu and LLM consume this later. This is not cmd-K.
 */
export const listActions = (
  program: Pick<Program.Program<Model, Message>, 'valid'>,
  model: Model,
): ReadonlyArray<ListedAction> => {
  if (program.valid === undefined) {
    return []
  }
  return Array.map(program.valid(model), row => ({
    token: row.token,
    keys: row.keys,
    valid: row.valid,
    disabled: !row.valid,
    hiddenBecause: row.hidden,
    payload: {},
  }))
}

/** `[ r ] reset` from Action `keys`. First key only. */
export const actionMenuRowLabel = (row: ListedAction): string => {
  const hint = Program.actionMenuKeyHint(row.keys)
  if (row.disabled && row.hiddenBecause !== undefined) {
    return `${hint}${row.token}: ${row.hiddenBecause}`
  }
  return `${hint}${row.token}`
}

/** Filters the Action catalog. Empty query keeps every row. */
export const filterListedActions = (
  rows: ReadonlyArray<ListedAction>,
  maybeQuery: Option.Option<string>,
): Program.FilteredActions<ListedAction> =>
  Program.filterByQuery(rows, maybeQuery)
