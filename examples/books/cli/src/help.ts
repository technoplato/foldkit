/**
 * What `books` prints about itself, derived from the declarations: the
 * first read while no player runs, and everything about one command.
 * It loads the declarations, so the view imports it only to print help.
 */
import {
  type Declaration,
  commandHelpOf,
  findByPath,
  helpLines,
  helpRowOf,
  pathsOf,
  toolsOf,
  usageOf,
} from 'foldkit/cli/view'

import { Help, hostTree, programTree, startHere } from './declared.js'
import { booksCommandName } from './settings.js'

const everyDeclared = [...hostTree, ...programTree]

const rowsOf = (declarations: ReadonlyArray<Declaration>) =>
  pathsOf(declarations).map(addressed => helpRowOf(booksCommandName, addressed))

/**
 * What `books` alone prints while no player runs here: that it starts
 * none, the commands to start with, each line read from its
 * declaration, and how to ask about one command.
 */
export const usageText = (): string =>
  [
    `The Books player is not running here, and \`${booksCommandName}\` alone does not start it.`,
    '',
    'Start here',
    ...helpLines(rowsOf(startHere)),
    '',
    `\`${booksCommandName} ${usageOf(['Help'], Help.declaration)}\` says what one command does, why, and what it takes.`,
    `While the player runs, \`${booksCommandName}\` says what is playing and what to run next.`,
  ].join('\n')

/**
 * Everything one command says, by its name or another name it answers
 * to: its usage, what it does and why, each parameter, and examples.
 * Undefined when nothing here goes by those words.
 */
export const commandHelp = (
  words: ReadonlyArray<string>,
): string | undefined => {
  const found = findByPath(everyDeclared, words)
  return found === undefined
    ? undefined
    : commandHelpOf(booksCommandName, found)
}

/**
 * Every command there is, a line each: what this terminal does itself,
 * then the library's own Actions.
 */
export const everyCommandText = (): string =>
  [
    'This terminal',
    ...helpLines(
      rowsOf(
        hostTree.flatMap(node =>
          pathsOf([node]).map(({ declaration }) => declaration),
        ),
      ),
    ),
    '',
    'The library',
    ...helpLines(
      rowsOf(
        programTree.flatMap(node =>
          pathsOf([node]).map(({ declaration }) => declaration),
        ),
      ),
    ),
  ].join('\n')

/**
 * Everything `books` can be asked for, as the tools a program reads:
 * each with its name, what it does and why, its parameters as JSON
 * Schema, and what it touches where that is declared. It is the list a
 * Model Context Protocol server would serve.
 */
export const toolsText = (): string =>
  JSON.stringify({ name: booksCommandName, tools: toolsOf(everyDeclared) })
