import { Array, Effect, Match as M, Option, pipe } from 'effect'

import {
  type Availability,
  type Entry,
  type EntryChoice,
  choiceTagOf,
  commandOf,
  isEnabled,
} from '../catalog/catalog.js'
import type { BoundInteraction } from '../interaction/bind.js'
import { type MenuView, keyInput } from '../interaction/interaction.js'
import { terminalLineText, terminalMenuLines } from '../interaction/terminal.js'
import {
  type TerminalFocus,
  noTerminalFocus,
  terminalFrameOf,
} from '../interaction/terminalFocus.js'
import { backOneEntry } from '../navigation/carrier.js'
import type { EntryView } from '../navigation/declaration.js'
import { type Frame, frameOf } from '../navigation/frame.js'
import { Cli } from '../navigation/message.js'
import { renderScreen } from '../renderers/render.js'
import type { UiNode } from '../renderers/types.js'
import { columnRow, underColumn } from './layout.js'
import type {
  CliDaemonFlags,
  CliDaemonPaintedResult,
  CliDaemonSurface,
} from './protocol.js'

// PAINT

const indentWidth = 2

const minimumCommandWidth = 12

const minimumKeysWidth = 6

const columnGap = 2

const indent = ' '.repeat(indentWidth)

const keysTextOf = (keys: ReadonlyArray<string>): string => keys.join(' ')

type ActionColumns = Readonly<{
  commandWidth: number
  keysWidth: number
  descriptionColumn: number
}>

const widestOf = (texts: ReadonlyArray<string>, minimum: number): number =>
  Array.reduce(texts, minimum, (widest, text) =>
    Math.max(widest, text.length + columnGap),
  )

/**
 * How an Action reads as a CLI command: its word, then the choice it
 * needs, `decrement-counter <counter-id>`.
 */
const usageOf = (entry: Entry): string =>
  Option.match(entry.maybeChoices, {
    onNone: () => commandOf(entry.tag),
    onSome: choices =>
      `${commandOf(entry.tag)} <${commandOf(capitalized(choices.field))}>`,
  })

const capitalized = (word: string): string =>
  `${word.charAt(0).toUpperCase()}${word.slice(1)}`

const offeredTokensOf = (entry: Entry): ReadonlyArray<string> =>
  Option.match(entry.maybeChoices, {
    onNone: () => [],
    onSome: ({ choices }) =>
      Array.map(
        Array.filter(choices, choice => isEnabled(choice.availability)),
        choice => choice.token,
      ),
  })

const choiceLines = (entry: Entry, column: number): ReadonlyArray<string> =>
  Option.match(entry.maybeChoices, {
    onNone: () => [],
    onSome: ({ choices }) => {
      const offered = offeredTokensOf(entry)
      return [
        ...(Array.isReadonlyArrayEmpty(offered)
          ? []
          : underColumn(column, `Choose one of: ${Array.join(offered, ', ')}`)),
        ...(isEnabled(entry.availability)
          ? Array.flatMap(unavailableGroupsOf(choices), ({ because, tokens }) =>
              underColumn(
                column,
                `Unavailable for ${Array.join(tokens, ', ')}: ${because}`,
              ),
            )
          : []),
      ]
    },
  })

type UnavailableGroup = Readonly<{
  because: string
  tokens: ReadonlyArray<string>
}>

const unavailableGroupsOf = (
  choices: ReadonlyArray<EntryChoice>,
): ReadonlyArray<UnavailableGroup> => {
  const unavailable = Array.getSomes(
    Array.map(choices, choice =>
      M.value(choice.availability).pipe(
        M.withReturnType<
          Option.Option<Readonly<{ because: string; token: string }>>
        >(),
        M.tagsExhaustive({
          Enabled: () => Option.none(),
          Disabled: ({ because }) =>
            Option.some({ because, token: choice.token }),
        }),
      ),
    ),
  )
  return Array.map(
    Array.dedupe(Array.map(unavailable, ({ because }) => because)),
    because => ({
      because,
      tokens: Array.map(
        Array.filter(unavailable, choice => choice.because === because),
        choice => choice.token,
      ),
    }),
  )
}

const exampleWordsOf = (entry: Entry): Option.Option<string> =>
  Option.match(entry.maybeChoices, {
    onNone: () => Option.some(commandOf(entry.tag)),
    onSome: () =>
      Option.map(Array.head(offeredTokensOf(entry)), token =>
        commandOf(choiceTagOf(entry.tag, token)),
      ),
  })

const actionColumnsOf = (entries: ReadonlyArray<Entry>): ActionColumns => {
  const commandWidth = widestOf(
    Array.map(entries, entry => `  ${usageOf(entry)}`),
    minimumCommandWidth,
  )
  const keysWidth = widestOf(
    Array.map(entries, entry => keysTextOf(entry.keys)),
    minimumKeysWidth,
  )
  return {
    commandWidth,
    keysWidth,
    descriptionColumn: indentWidth + commandWidth + keysWidth,
  }
}

const unavailableLines = (
  entry: Entry,
  column: number,
): ReadonlyArray<string> =>
  M.value(entry.availability).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      Enabled: () => [],
      Disabled: ({ because }) => underColumn(column, `Unavailable: ${because}`),
    }),
  )

const exampleLines = (
  maybeName: Option.Option<string>,
  column: number,
  words: string,
): ReadonlyArray<string> =>
  Option.match(maybeName, {
    onNone: () => [],
    onSome: name => underColumn(column, `$ ${name} ${words}`),
  })

/**
 * The Actions table: each Action's CLI word, its keys, and its `what`
 * wrapped under itself to 80 columns, then why it is unavailable and,
 * with a Program name, how to run it.
 */
const actionTable = (
  entries: ReadonlyArray<Entry>,
  maybeName: Option.Option<string>,
): ReadonlyArray<string> => {
  const columns = actionColumnsOf(entries)
  const rowsOf = (entry: Entry): ReadonlyArray<string> => [
    ...columnRow(
      [indent, usageOf(entry), keysTextOf(entry.keys)],
      [indentWidth, columns.commandWidth, columns.keysWidth],
      entry.what,
    ),
    ...unavailableLines(entry, columns.descriptionColumn),
    ...choiceLines(entry, columns.descriptionColumn),
    ...Option.match(exampleWordsOf(entry), {
      onNone: () => [],
      onSome: words =>
        exampleLines(maybeName, columns.descriptionColumn, words),
    }),
  ]
  return Option.match(maybeName, {
    onNone: () => Array.flatMap(entries, rowsOf),
    onSome: () =>
      Array.flatMap(entries, (entry, index) =>
        index === 0 ? rowsOf(entry) : ['', ...rowsOf(entry)],
      ),
  })
}

const menuLines = (menu: MenuView): ReadonlyArray<string> => [
  '',
  ...Array.map(terminalMenuLines(menu), terminalLineText),
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
      Starting: ({ description }) => description,
      Failed: ({ description }) => `failed\n${description}`,
    }),
  )

/**
 * A Program's screen as text, without its Actions: the status, where it
 * is, and what it shows, the part `show` and `watch` share.
 *
 * @example
 * ```typescript
 * paintScreen(bound) // 'ready\nat /counters\nCounters\nCounter 1 3 [ + ] [ - ] ...'
 * ```
 */
export const paintScreen = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  focus: TerminalFocus = noTerminalFocus,
): string =>
  Option.match(frameOf(bound), {
    onNone: () => [
      statusLine(bound),
      ...rootLines(bound),
      ...Option.match(bound.menu(), {
        onNone: () => [],
        onSome: menuLines,
      }),
    ],
    onSome: frame => [
      statusLine(bound),
      ...frameLines(terminalFrameOf(frame, focus)),
    ],
  }).join('\n')

/**
 * Paints a bound Program as terminal text that fits 80 columns: status,
 * where it is, its screens, then every Action with its CLI word, keys,
 * description, and why it is unavailable. With the Program's CLI `name`,
 * each Action also shows how to run it. Everything comes from the
 * Program's Catalog and navigation; the host writes none of it.
 *
 * @example
 * ```text
 * ready
 * at /counter
 * 3
 * [ + ] [ - ] [ Reset ]
 *
 * Actions
 *   increment               + =   Increments the count by one
 *                                 $ counter increment
 * ```
 */
export const paintProgram = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name?: string,
): string => {
  const maybeName = Option.fromNullishOr(name)
  const actions = ['', 'Actions', ...actionTable(bound.entries(), maybeName)]
  return Option.match(frameOf(bound), {
    onNone: () => [
      statusLine(bound),
      ...rootLines(bound),
      ...actions,
      ...Option.match(bound.menu(), {
        onNone: () => [],
        onSome: menuLines,
      }),
    ],
    onSome: frame => [
      statusLine(bound),
      ...frameLines(terminalFrameOf(frame, noTerminalFocus)),
      ...actions,
    ],
  }).join('\n')
}

type Control = Readonly<{ usage: string; what: string; example: string }>

const controlsOf = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
): ReadonlyArray<Control> => {
  const maybeFirstEnabled = Array.findFirst(
    bound.entries(),
    entry => entry.availability._tag === 'Enabled',
  )
  const firstCommand = Option.getOrElse(
    Option.map(maybeFirstEnabled, entry => commandOf(entry.tag)),
    () => 'help',
  )
  const firstKey = Option.getOrElse(
    Array.findFirst(
      Array.flatMap(bound.entries(), entry => entry.keys),
      key => key.length > 0,
    ),
    () => 'Escape',
  )
  const currentUri = Option.getOrElse(
    Option.map(bound.navigation(), plan => plan.uri),
    () => '/',
  )
  return [
    {
      usage: 'show',
      what: `Paint the ${name} and its Actions`,
      example: 'show',
    },
    {
      usage: 'menu open|close',
      what: 'Present or dismiss the action menu',
      example: 'menu open',
    },
    {
      usage: 'menu type <text>',
      what: 'Filter the action menu',
      example: `menu type ${firstCommand.slice(0, 2)}`,
    },
    {
      usage: 'menu next|previous',
      what: 'Move focus in the action menu',
      example: 'menu next',
    },
    {
      usage: 'menu choose <cmd>',
      what: 'Choose one Action from the menu',
      example: `menu choose ${firstCommand}`,
    },
    {
      usage: 'key <key>',
      what: 'Press a key, with --meta, --ctrl, or --shift',
      example: `key ${firstKey}`,
    },
    {
      usage: 'open <uri>',
      what: "Go to one of the Program's URIs",
      example: `open ${currentUri}`,
    },
    { usage: 'back', what: 'Go back one screen', example: 'back' },
    { usage: 'where', what: 'Print the current URI', example: 'where' },
    {
      usage: 'watch',
      what: 'Repaint the screen as it changes, on every device',
      example: 'watch',
    },
    {
      usage: 'tail',
      what: 'Print every event as it lands, from every device',
      example: 'tail',
    },
    { usage: 'help', what: 'Print this help', example: 'help' },
  ]
}

/**
 * Usage derived from the Program: every Action is a command, laid out like
 * `show`, then the controls every Program has, each with an example built
 * from this Program, such as `$ counter menu choose increment`.
 */
export const programUsage = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
): string => {
  const controls = controlsOf(bound, name)
  const usageWidth = widestOf(
    Array.map(controls, control => control.usage),
    minimumCommandWidth,
  )
  const column = indentWidth + usageWidth
  return [
    'Usage',
    `${indent}${name} [command] [--meta] [--ctrl] [--shift]`,
    '',
    'Actions',
    ...actionTable(bound.entries(), Option.some(name)),
    '',
    'Controls',
    ...Array.flatMap(controls, (control, index) => [
      ...(index === 0 ? [] : ['']),
      ...columnRow(
        [indent, control.usage],
        [indentWidth, usageWidth],
        control.what,
      ),
      ...underColumn(column, `$ ${name} ${control.example}`),
    ]),
  ].join('\n')
}

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

const needsChoiceSentence = (entry: Entry, name: string): string =>
  Option.match(Array.head(offeredTokensOf(entry)), {
    onNone: () => `${commandOf(entry.tag)} has nothing to choose right now.`,
    onSome: first =>
      `${usageOf(entry)} needs one of: ${Array.join(offeredTokensOf(entry), ', ')}. Try: ${name} ${commandOf(choiceTagOf(entry.tag, first))}`,
  })

type Command = Readonly<{
  entry: Entry
  tag: string
  availability: Availability
}>

const commandFor = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  command: string,
): Option.Option<Command> =>
  Array.findFirst(
    Array.flatMap(
      bound.entries(),
      (entry): ReadonlyArray<Command> => [
        { entry, tag: entry.tag, availability: entry.availability },
        ...Option.match(entry.maybeChoices, {
          onNone: () => [],
          onSome: ({ choices }) =>
            Array.map(choices, choice => ({
              entry,
              tag: choiceTagOf(entry.tag, choice.token),
              availability: choice.availability,
            })),
        }),
      ],
    ),
    candidate => commandOf(candidate.tag) === command,
  )

const pressCommand = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  command: string,
  press: (tag: string) => boolean,
): CliDaemonPaintedResult =>
  Option.match(commandFor(bound, command), {
    onNone: () =>
      painted(
        paintProgram(bound, name),
        2,
        `Unknown command "${command}". Try one of: ${Array.map(bound.entries(), usageOf).join(', ')}.`,
      ),
    onSome: found =>
      M.value(found.availability).pipe(
        M.withReturnType<CliDaemonPaintedResult>(),
        M.tagsExhaustive({
          Enabled: () =>
            press(found.tag) || Option.isNone(found.entry.maybeChoices)
              ? painted(paintProgram(bound, name))
              : painted(
                  paintProgram(bound, name),
                  2,
                  needsChoiceSentence(found.entry, name),
                ),
          Disabled: ({ because }) =>
            painted(
              paintProgram(bound, name),
              1,
              `${command} is disabled: ${because}.`,
            ),
        }),
      ),
  })

const menuMoves: ReadonlyMap<string, string> = new Map([
  ['next', 'ArrowDown'],
  ['previous', 'ArrowUp'],
  ['enter', 'Enter'],
])

const isUriWord = (words: ReadonlyArray<string>): boolean =>
  Option.match(Array.head(words), {
    onNone: () => true,
    onSome: word => word.startsWith('/'),
  })

const runMenu = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  words: ReadonlyArray<string>,
): CliDaemonPaintedResult => {
  const [verb = 'open', ...rest] = words
  if (verb === 'open') {
    bound.openMenu()
    return painted(paintProgram(bound, name))
  } else if (verb === 'close') {
    bound.dismissMenu()
    return painted(paintProgram(bound, name))
  } else if (verb === 'type') {
    bound.openMenu()
    bound.typeInMenu(rest.join(' '))
    return painted(paintProgram(bound, name))
  } else if (verb === 'choose') {
    bound.openMenu()
    return pressCommand(bound, name, rest.join(' '), tag =>
      bound.chooseFromMenu(tag),
    )
  } else {
    return Option.match(Option.fromNullishOr(menuMoves.get(verb)), {
      onNone: () =>
        painted(paintProgram(bound, name), 2, `Unknown menu verb "${verb}".`),
      onSome: key => {
        bound.pressKey(keyInput(key))
        return painted(paintProgram(bound, name))
      },
    })
  }
}

const runOpen = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  words: ReadonlyArray<string>,
): CliDaemonPaintedResult =>
  Array.match(words, {
    onEmpty: () => painted(paintProgram(bound, name), 2, 'open needs a URI.'),
    onNonEmpty: uriWords => {
      const uri = uriWords.join(' ')
      return bound.openUri(uri, Cli())
        ? painted(paintProgram(bound, name))
        : painted(
            paintProgram(bound, name),
            1,
            `Cannot open ${uri}: no URIs here yet.`,
          )
    },
  })

const runBack = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
): CliDaemonPaintedResult =>
  backOneEntry(bound)
    ? painted(paintProgram(bound, name))
    : painted(paintProgram(bound, name), 1, 'Already at the first screen.')

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
    return painted(paintProgram(bound, name))
  } else if (head === 'help') {
    return painted(programUsage(bound, name))
  } else if (head === 'menu') {
    return runMenu(bound, name, rest)
  } else if (head === 'key') {
    bound.pressKey(
      keyInput(rest.join(' '), {
        isMeta: flags['meta'] === '1',
        isControl: flags['ctrl'] === '1',
        isShift: flags['shift'] === '1',
      }),
    )
    return painted(paintProgram(bound, name))
  } else if (head === 'open' && isUriWord(rest)) {
    return runOpen(bound, name, rest)
  } else if (head === 'back') {
    return runBack(bound, name)
  } else if (head === 'where') {
    return runWhere(bound)
  } else if (head === 'do') {
    return pressCommand(bound, name, rest.join(' '), tag => bound.press(tag))
  } else {
    return pressCommand(bound, name, words.join(' '), tag => bound.press(tag))
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
  show: () => Effect.sync(() => painted(paintProgram(bound, name))),
  do: (token, flags) =>
    Effect.sync(() => runProgramCommand(bound, name, wordsOf(token), flags)),
})
