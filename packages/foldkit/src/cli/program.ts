import { Array, Effect, Match as M, Option, pipe } from 'effect'

import { type Entry, commandOf } from '../catalog/catalog.js'
import type { BoundInteraction } from '../interaction/bind.js'
import {
  type MenuView,
  hintLineOf,
  keyInput,
  textOf,
} from '../interaction/interaction.js'
import { backOneEntry } from '../navigation/carrier.js'
import type { EntryView } from '../navigation/declaration.js'
import { type Frame, frameOf } from '../navigation/frame.js'
import { Cli } from '../navigation/message.js'
import { renderScreen } from '../renderers/render.js'
import type { UiNode } from '../renderers/types.js'
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

const rowMark = (row: MenuView['rows'][number]): string =>
  row.isHighlighted ? '>' : ' '

const menuRowLine = (row: MenuView['rows'][number]): string => {
  const keys = Array.match(row.keys, {
    onEmpty: () => '',
    onNonEmpty: rowKeys => `[${rowKeys.join(' ')}]`,
  })
  return `  ${rowMark(row)} ${commandOf(row.entry.tag).padEnd(commandColumnWidth)}${keys.padEnd(keysColumnWidth)}${textOf(row.description)}${availabilityNote(row.entry)}`
}

const menuLines = (menu: MenuView): ReadonlyArray<string> => [
  '',
  `${menu.title}  ${menu.filterLabel}: "${menu.query}"`,
  ...Array.match(menu.rows, {
    onEmpty: () => [`  (${menu.summary})`],
    onNonEmpty: rows => Array.map(rows, menuRowLine),
  }),
  `  ${hintLineOf(menu.hints)}`,
]

const treeLines = (tree: UiNode): ReadonlyArray<string> =>
  Array.map(renderScreen(tree).split('\n'), line => line.trimEnd())

const viewLines = (view: EntryView): ReadonlyArray<string> =>
  M.value(view).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      Screen: ({ node }) => treeLines(node),
      Menu: ({ menu }) => menuLines(menu),
    }),
  )

const frameLines = (frame: Frame): ReadonlyArray<string> => [
  `at ${frame.uri}`,
  ...Array.flatMap([frame.base, ...frame.overlays], layer =>
    viewLines(layer.view),
  ),
]

const rootLines = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
): ReadonlyArray<string> =>
  Option.match(bound.screen(), { onNone: () => [], onSome: treeLines })

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
 * Paints a bound Program as terminal text: status, the screen, every Action
 * with its CLI word, keys, and disabled sentence. A Program with a URI
 * paints where it is, its base screen, and each entry presented over it,
 * such as the action menu. Any other Program paints its screen, then the
 * menu after the Actions.
 *
 * @example
 * ```text
 * ready
 * at /counter/session
 * Session
 * [ Mirror navigation ] [ Keep navigation local ] [ Close ]
 *
 * Actions
 *   increment   [+ =]   Increments the count by one
 * ```
 */
export const paintProgram = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
): string =>
  Option.match(frameOf(bound), {
    onNone: () => [
      statusLine(bound),
      ...rootLines(bound),
      '',
      'Actions',
      ...Array.map(bound.entries(), actionLine),
      ...Option.match(bound.menu(), {
        onNone: () => [],
        onSome: menuLines,
      }),
    ],
    onSome: frame => [
      statusLine(bound),
      ...frameLines(frame),
      '',
      'Actions',
      ...Array.map(bound.entries(), actionLine),
    ],
  }).join('\n')

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
    "  open <uri>         Go to one of the Program's URIs",
    '  back               Go back one screen',
    '  where              Print the current URI',
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

const runOpen = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  words: ReadonlyArray<string>,
): CliDaemonPaintedResult =>
  Array.match(words, {
    onEmpty: () => painted(paintProgram(bound), 2, 'open needs a URI.'),
    onNonEmpty: uriWords => {
      const uri = uriWords.join(' ')
      return bound.openUri(uri, Cli())
        ? painted(paintProgram(bound))
        : painted(
            paintProgram(bound),
            1,
            `Cannot open ${uri}: no URIs here yet.`,
          )
    },
  })

const runBack = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
): CliDaemonPaintedResult =>
  backOneEntry(bound)
    ? painted(paintProgram(bound))
    : painted(paintProgram(bound), 1, 'Already at the first screen.')

const runWhere = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
): CliDaemonPaintedResult =>
  Option.match(bound.navigation(), {
    onNone: () => painted('', 1, 'This Program has no URI yet.'),
    onSome: plan => painted(plan.uri),
  })

/**
 * Runs one CLI command against a bound Program and paints the result.
 * Words come from argv after flags are removed.
 *
 * @example
 * ```typescript
 * runProgramCommand(bound, 'counter', ['increment'], {})
 * runProgramCommand(bound, 'counter', ['menu', 'type', 're'], {})
 * runProgramCommand(bound, 'counter', ['open', '/counter/session'], {})
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
  } else if (head === 'open') {
    return runOpen(bound, rest)
  } else if (head === 'back') {
    return runBack(bound)
  } else if (head === 'where') {
    return runWhere(bound)
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
