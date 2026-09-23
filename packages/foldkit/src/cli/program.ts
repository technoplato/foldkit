import { Array, Effect, Match as M, Option, pipe } from 'effect'

import { type Entry, commandOf } from '../catalog/catalog.js'
import type { BoundInteraction } from '../interaction/bind.js'
import { type MenuView, keyInput } from '../interaction/interaction.js'
import { renderScreen } from '../renderers/render.js'
import type {
  CliDaemonFlags,
  CliDaemonPaintedResult,
  CliDaemonSurface,
} from './protocol.js'

// PAINT

const commandColumnWidth = 12
const keysColumnWidth = 8

const keysOf = (entry: Entry): string =>
  Array.match(entry.keys, {
    onEmpty: () => '',
    onNonEmpty: keys => `[${keys.join(' ')}]`,
  })

const availabilityNote = (entry: Entry): string =>
  M.value(entry.availability).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Enabled: () => '',
      Disabled: ({ because }) => `  (disabled: ${because})`,
    }),
  )

const actionLine = (entry: Entry): string =>
  `  ${commandOf(entry.tag).padEnd(commandColumnWidth)}${keysOf(entry).padEnd(keysColumnWidth)}${entry.what}${availabilityNote(entry)}`

const menuLines = (menu: MenuView): ReadonlyArray<string> => [
  '',
  `Action menu  query "${menu.query}"  ${menu.isFilterFocused ? 'filter focused' : 'list focused'}`,
  ...Array.match(menu.rows, {
    onEmpty: () => ['  (no matching actions)'],
    onNonEmpty: rows =>
      Array.map(
        rows,
        row =>
          `  ${row.isHighlighted ? '>' : ' '} ${commandOf(row.entry.tag).padEnd(commandColumnWidth)}${row.entry.what}${availabilityNote(row.entry)}`,
      ),
  }),
]

const statusLine = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
): string =>
  M.value(bound.status()).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      Ready: () => 'ready',
      Starting: () => 'starting',
      Failed: ({ description }) => `failed\n${description}`,
    }),
  )

/**
 * Paints a bound Program as terminal text: status, the screen tree, every
 * Action with its CLI word, keys, and disabled sentence, and the action
 * menu when it is presented.
 *
 * @example
 * ```text
 * ready
 * 3
 * [ + ] [ - ] [ Reset ]
 *
 * Actions
 *   increment   [+ =]   Increments the count by one
 *   reset       [r]     Sets the count to 0
 * ```
 */
export const paintProgram = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
): string =>
  [
    statusLine(bound),
    ...Option.match(bound.screen(), {
      onNone: () => [],
      onSome: tree =>
        Array.map(renderScreen(tree).split('\n'), line => line.trimEnd()),
    }),
    '',
    'Actions',
    ...Array.map(bound.entries(), actionLine),
    ...Option.match(bound.menu(), {
      onNone: () => [],
      onSome: menuLines,
    }),
  ].join('\n')

/**
 * Usage derived from the Program's Catalog. Every Action is a command; the
 * menu and raw keys drive navigation.
 */
export const programUsage = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
): string =>
  [
    `Usage: ${name} [command]`,
    '',
    'Commands',
    `  show               Paint the ${name} and its Actions`,
    ...Array.map(
      bound.entries(),
      entry => `  ${commandOf(entry.tag).padEnd(19)}${entry.what}`,
    ),
    '  menu open|close    Present or dismiss the action menu',
    '  menu type <text>   Filter the action menu',
    '  menu next|previous Move focus in the action menu',
    '  menu choose <cmd>  Choose one action from the menu',
    '  key <key>          Press a key, with --meta, --ctrl, or --shift',
    '  help               Print this help',
  ].join('\n')

// RUN

const painted = (
  stdout: string,
  exitCode = 0,
  stderr = '',
): CliDaemonPaintedResult => ({
  stdout,
  exitCode,
  ...(stderr === '' ? {} : { stderr }),
})

const findEntry = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  command: string,
): Option.Option<Entry> =>
  Array.findFirst(bound.entries(), entry => commandOf(entry.tag) === command)

const pressCommand = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  command: string,
  press: (tag: string) => boolean,
): CliDaemonPaintedResult =>
  Option.match(findEntry(bound, command), {
    onNone: () =>
      painted(
        paintProgram(bound),
        2,
        `Unknown command "${command}". Try one of: ${Array.map(bound.entries(), entry => commandOf(entry.tag)).join(', ')}.`,
      ),
    onSome: entry =>
      M.value(entry.availability).pipe(
        M.withReturnType<CliDaemonPaintedResult>(),
        M.tagsExhaustive({
          Enabled: () => {
            press(entry.tag)
            return painted(paintProgram(bound))
          },
          Disabled: ({ because }) =>
            painted(
              paintProgram(bound),
              1,
              `${commandOf(entry.tag)} is disabled: ${because}.`,
            ),
        }),
      ),
  })

const menuMoves: ReadonlyMap<string, string> = new Map([
  ['next', 'ArrowDown'],
  ['previous', 'ArrowUp'],
  ['enter', 'Enter'],
])

const runMenu = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  words: ReadonlyArray<string>,
): CliDaemonPaintedResult => {
  const [verb = 'open', ...rest] = words
  if (verb === 'open') {
    bound.openMenu()
    return painted(paintProgram(bound))
  } else if (verb === 'close') {
    bound.dismissMenu()
    return painted(paintProgram(bound))
  } else if (verb === 'type') {
    bound.openMenu()
    bound.typeInMenu(rest.join(' '))
    return painted(paintProgram(bound))
  } else if (verb === 'choose') {
    bound.openMenu()
    return pressCommand(bound, rest.join(' '), tag => bound.chooseFromMenu(tag))
  } else {
    return Option.match(Option.fromNullishOr(menuMoves.get(verb)), {
      onNone: () =>
        painted(paintProgram(bound), 2, `Unknown menu verb "${verb}".`),
      onSome: key => {
        bound.pressKey(keyInput(key))
        return painted(paintProgram(bound))
      },
    })
  }
}

/**
 * Runs one CLI command against a bound Program and paints the result.
 * Words come from argv after flags are removed.
 *
 * @example
 * ```typescript
 * runProgramCommand(bound, 'counter', ['increment'], {})
 * runProgramCommand(bound, 'counter', ['menu', 'type', 're'], {})
 * ```
 */
export const runProgramCommand = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  words: ReadonlyArray<string>,
  flags: CliDaemonFlags,
): CliDaemonPaintedResult => {
  const [head = 'show', ...rest] = words
  if (head === 'show') {
    return painted(paintProgram(bound))
  } else if (head === 'help') {
    return painted(programUsage(bound, name))
  } else if (head === 'menu') {
    return runMenu(bound, rest)
  } else if (head === 'key') {
    bound.pressKey(
      keyInput(rest.join(' '), {
        isMeta: flags['meta'] === '1',
        isControl: flags['ctrl'] === '1',
        isShift: flags['shift'] === '1',
      }),
    )
    return painted(paintProgram(bound))
  } else if (head === 'do') {
    return pressCommand(bound, rest.join(' '), tag => bound.press(tag))
  } else {
    return pressCommand(bound, head, tag => bound.press(tag))
  }
}

const wordsOf = (token: string): ReadonlyArray<string> =>
  pipe(
    token.split(' '),
    Array.filter(word => word !== ''),
  )

/**
 * A CLI daemon surface for any bound Program. `show` paints; `do` runs the
 * words the view sent.
 */
export const programCliSurface = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
): CliDaemonSurface<Model, Message> => ({
  read: () => Effect.sync(() => bound.readModel()),
  run: message =>
    Effect.sync(() => {
      const previous = bound.readModel()
      bound.send(message)
      return { model: bound.readModel(), previous }
    }),
  show: () => Effect.sync(() => painted(paintProgram(bound))),
  do: (token, flags) =>
    Effect.sync(() => runProgramCommand(bound, name, wordsOf(token), flags)),
})
