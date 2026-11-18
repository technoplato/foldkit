import { Array, Match as M, Option, Order, String, pipe } from 'effect'

import {
  type Availability,
  type Entry,
  type EntryChoice,
  choiceTagOf,
  commandOf,
  isEnabled,
  parseChoiceTag,
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
import { linksOf } from '../renderers/query.js'
import { renderScreen } from '../renderers/render.js'
import { namedByTyped } from '../renderers/typed.js'
import type { UiNode } from '../renderers/types.js'
import { columnRow, underColumn } from './layout.js'
import type { CliDaemonFlags, CliDaemonPaintedResult } from './protocol.js'

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
      `${commandOf(entry.tag)} <${choices.noun.replaceAll(' ', '-')}>`,
  })

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

const outsideLinkPattern = /^[a-z][a-z0-9+.-]*:/i

/**
 * The addresses on a screen that leave the Program, each whole on its own
 * line under the words that name it, headed `Links`. Terminal text cuts a
 * row to the width and cannot be clicked, so without these a row such as
 * `Open Amazon sign-in` could not be opened from a terminal. A link that
 * stays in the Program, `/books/a-new-earth/listen/12m03s`, is left out:
 * `open <uri>` goes there. Empty when no link leaves.
 *
 * @example
 * ```typescript
 * screenLinkLines(connectScreen)
 * // ['', 'Links', '  Open Amazon sign-in', '  https://www.amazon.com/ap/signin?…']
 * ```
 */
export const screenLinkLines = (tree: UiNode): ReadonlyArray<string> =>
  Array.match(
    Array.filter(linksOf(tree), link => outsideLinkPattern.test(link.href)),
    {
      onEmpty: () => [],
      onNonEmpty: links => [
        '',
        'Links',
        ...Array.flatMap(links, link => [
          `${indent}${link.title}`,
          `${indent}${link.href}`,
        ]),
      ],
    },
  )

const viewLines = (view: EntryView): ReadonlyArray<string> =>
  M.value(view).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      Screen: ({ node }) => [...treeLines(node), ...screenLinkLines(node)],
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
  Option.match(bound.screen(), {
    onNone: () => [],
    onSome: tree => [...treeLines(tree), ...screenLinkLines(tree)],
  })

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
      usage: 'follow [topic]',
      what: 'Print a topic each time it changes, such as the screen',
      example: 'follow screen',
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

/** A command a host offers beside the Program's own, such as `books tui`. */
export type HostCommand = Readonly<{ command: string; what: string }>

const widestCommandColumn = 30

type CommandLine = Readonly<{
  command: string
  maybeWhat: Option.Option<string>
}>

const lineOf = (command: string, what: string): CommandLine => ({
  command,
  maybeWhat: Option.some(what),
})

const wordsOfText = (text: string): string =>
  pipe(
    text,
    String.toLowerCase,
    String.replace(/[^a-z0-9]+/g, '-'),
    String.replace(/^-+|-+$/g, ''),
  )

const choiceLineOf = (
  entry: Entry,
  tag: string,
  token: string,
): Option.Option<CommandLine> =>
  Option.flatMap(entry.maybeChoices, choices =>
    Option.match(
      Array.findFirst(choices.choices, choice => choice.token === token),
      {
        onNone: () =>
          choices.isOpen && isEnabled(entry.availability)
            ? Option.some(lineOf(commandOf(tag), entry.what))
            : Option.none(),
        onSome: choice =>
          isEnabled(choice.availability)
            ? Option.some({
                command: commandOf(tag),
                maybeWhat: Option.liftPredicate(
                  choice.title,
                  title => wordsOfText(title) !== wordsOfText(token),
                ),
              })
            : Option.none(),
      },
    ),
  )

const pressableLineOf = (
  entries: ReadonlyArray<Entry>,
  tag: string,
): Option.Option<CommandLine> =>
  Option.match(parseChoiceTag(tag), {
    onNone: () =>
      Option.flatMap(
        Array.findFirst(entries, entry => entry.tag === tag),
        entry =>
          isEnabled(entry.availability) && Option.isNone(entry.maybeChoices)
            ? Option.some(lineOf(commandOf(tag), entry.what))
            : Option.none(),
      ),
    onSome: choice =>
      Option.flatMap(
        Array.findFirst(entries, entry => entry.tag === choice.tag),
        entry => choiceLineOf(entry, tag, choice.token),
      ),
  })

const paintedLineOf =
  (name: string, commandWidth: number) =>
  (line: CommandLine): ReadonlyArray<string> => {
    const command = `${name} ${line.command}`
    return Option.match(line.maybeWhat, {
      onNone: () => [`${indent}${command}`],
      onSome: what =>
        command.length + columnGap > commandWidth
          ? [
              `${indent}${command}`,
              ...underColumn(indentWidth + commandWidth, what),
            ]
          : columnRow([indent, command], [indentWidth, commandWidth], what),
    })
  }

/**
 * The commands a person can copy for this moment, one per line with what
 * each does: the Program's presses that are enabled now, in the order
 * given, then the host's own commands. A press that is disabled or needs
 * a choice it was not given is left out, so every line runs as written. A
 * choice whose title only repeats its token, `books listen small-hours`
 * for Small Hours, stands alone, and a command too long for the column
 * puts what it does on the next line, so one long title never pushes
 * every description off the screen.
 *
 * @example
 * ```typescript
 * paintCommands(bound, 'books', ['Pause', 'Play', 'Listen:21-lessons-for-the-21st-century'], [
 *   { command: 'tui', what: 'Opens the live player here' },
 * ])
 * // while it plays:
 * // ['  books pause  Pauses and keeps your place',
 * //  '  books listen 21-lessons-for-the-21st-century',
 * //  '  books tui    Opens the live player here']
 * ```
 */
export const paintCommands = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  tags: ReadonlyArray<string>,
  hostCommands: ReadonlyArray<HostCommand> = [],
): ReadonlyArray<string> => {
  const entries = bound.entries()
  const candidates: ReadonlyArray<CommandLine> = [
    ...Array.getSomes(Array.map(tags, tag => pressableLineOf(entries, tag))),
    ...Array.map(hostCommands, host => lineOf(host.command, host.what)),
  ]
  const lines = Array.dedupeWith(
    candidates,
    (self, that) => self.command === that.command,
  )
  const commandWidth = Math.min(
    widestOf(
      Array.map(
        Array.filter(lines, line => Option.isSome(line.maybeWhat)),
        line => `${name} ${line.command}`,
      ),
      minimumCommandWidth,
    ),
    widestCommandColumn,
  )
  return Array.flatMap(lines, paintedLineOf(name, commandWidth))
}

/**
 * The commands a part of the view offers now, for under it: of the Action
 * tags the part's own controls press, the first few that run now, each as
 * the terminal spells it with what it does, then the command that lists
 * the rest. Nothing here is typed by hand: the words and sentences are the
 * catalog's, so they change with the state, `pause` while it plays and
 * `play` once it is paused.
 *
 * @example
 * ```typescript
 * paintOffered(bound, 'books', ['Pause', 'Play', 'SkipBack', 'AddBookmark'], { listCommand: 'actions' })
 * // ['  books pause      Pauses and keeps your place',
 * //  '  books skip-back  Goes back 30 seconds',
 * //  '  books actions    Lists every command']
 * ```
 */
export const paintOffered = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  tags: ReadonlyArray<string>,
  options: Readonly<{ limit?: number; listCommand?: string }> = {},
): ReadonlyArray<string> => {
  const entries = bound.entries()
  const runnable = Array.take(
    Array.dedupe(
      Array.filter(tags, tag => Option.isSome(pressableLineOf(entries, tag))),
    ),
    options.limit ?? offeredShown,
  )
  // NOTE: One line for each, however long its sentence: a Client that
  // fits these to a width cuts a line, and a wrapped sentence would leave
  // its second half behind.
  const lines: ReadonlyArray<CommandLine> = [
    ...Array.getSomes(
      Array.map(runnable, tag => pressableLineOf(entries, tag)),
    ),
    lineOf(options.listCommand ?? 'help', 'Lists every command'),
  ]
  const width = widestOf(
    Array.map(lines, line => `${name} ${line.command}`),
    0,
  )
  return Array.map(lines, line =>
    Option.match(line.maybeWhat, {
      onNone: () => `${indent}${name} ${line.command}`,
      onSome: what =>
        `${indent}${`${name} ${line.command}`.padEnd(width)}${what}`,
    }),
  )
}

const offeredShown = 4

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

type Command = Readonly<{
  entry: Entry
  tag: string
  availability: Availability
}>

const openCommandFor = (
  catalogEntries: ReadonlyArray<Entry>,
  command: string,
): Option.Option<Command> => {
  const [word = '', ...rest] = command.split(' ')
  const token = rest.join(' ')
  return Option.map(
    Array.findFirst(
      catalogEntries,
      entry =>
        token !== '' &&
        commandOf(entry.tag) === word &&
        Option.exists(entry.maybeChoices, choices => choices.isOpen),
    ),
    entry => ({
      entry,
      tag: choiceTagOf(entry.tag, token),
      availability: entry.availability,
    }),
  )
}

const commandFor = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  command: string,
): Option.Option<Command> =>
  Option.orElse(
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
    ),
    () => openCommandFor(bound.entries(), command),
  )

/**
 * What a host adds to how commands are answered: its own commands, so an
 * unknown command can be told the nearest of them too, and the command
 * that lists every command, `help` unless the host has another.
 */
export type ProgramCommandOptions = Readonly<{
  hostCommands?: ReadonlyArray<HostCommand>
  listCommand?: string
}>

const refused = (sentence: string, exitCode = 2): CliDaemonPaintedResult =>
  painted('', exitCode, sentence)

const shownChoices = 8

/**
 * Choices as lines to copy: the command for each, then its name, the
 * first few, and how many more there are.
 */
const choiceCommandLines = (
  name: string,
  entry: Entry,
  choices: ReadonlyArray<EntryChoice>,
): ReadonlyArray<string> => {
  const shown = Array.take(choices, shownChoices)
  const commands = Array.map(
    shown,
    choice => `${name} ${commandOf(choiceTagOf(entry.tag, choice.token))}`,
  )
  const width = widestOf(commands, 0)
  const more = choices.length - shown.length
  return [
    ...Array.map(
      shown,
      (choice, index) =>
        `${indent}${(commands[index] ?? '').padEnd(width)}${choice.title}`,
    ),
    ...(more > 0 ? [`${indent}and ${more.toString()} more.`] : []),
  ]
}

const nounOf = (entry: Entry): string =>
  Option.match(entry.maybeChoices, {
    onNone: () => 'choice',
    onSome: choices => choices.noun,
  })

const withArticle = (noun: string): string =>
  /^[aeiou]/iu.test(noun) ? `an ${noun}` : `a ${noun}`

const enabledChoicesOf = (entry: Entry): ReadonlyArray<EntryChoice> =>
  Option.match(entry.maybeChoices, {
    onNone: () => [],
    onSome: ({ choices }) =>
      Array.filter(choices, choice => isEnabled(choice.availability)),
  })

/**
 * A command's own usage after a sentence that says what was wrong, with a
 * few of the choices it takes now to copy.
 */
const usageAnswer = (
  name: string,
  entry: Entry,
  sentence: string,
): CliDaemonPaintedResult => {
  const offered = enabledChoicesOf(entry)
  const usage = `Usage: ${name} ${usageOf(entry)}`
  return refused(
    Array.join(
      Array.match(offered, {
        onEmpty: () => [`${sentence} ${usage}.`],
        onNonEmpty: choices => [
          `${sentence} ${usage}, such as:`,
          ...choiceCommandLines(name, entry, choices),
        ],
      }),
      '\n',
    ),
  )
}

// NEAREST

const editDistance = (first: string, second: string): number => {
  const firstRow: ReadonlyArray<number> = Array.range(0, second.length)
  return Option.getOrElse(
    Array.last(
      Array.reduce(
        Array.fromIterable(first),
        firstRow,
        (previous, letter, row) =>
          Array.reduce(
            Array.fromIterable(second),
            [row + 1],
            (current: ReadonlyArray<number>, other, column) => [
              ...current,
              Math.min(
                (previous[column + 1] ?? 0) + 1,
                (current[column] ?? 0) + 1,
                (previous[column] ?? 0) + (letter === other ? 0 : 1),
              ),
            ],
          ),
      ),
    ),
    () => second.length,
  )
}

const nearestShown = 3

const minimumPartLength = 3

/**
 * How far a typed word is from a command's word: the letters to change,
 * or one when either holds the other, as `next` is in `next-chapter`.
 */
const farnessOf = (typed: string, word: string): number => {
  const isPart =
    Math.min(typed.length, word.length) >= minimumPartLength &&
    (word.includes(typed) || typed.includes(word))
  return Math.min(editDistance(typed, word), isPart ? 1 : Infinity)
}

const firstWordOf = (text: string): string => text.split(' ')[0] ?? ''

/**
 * The commands nearest what was typed, by spelling: up to three, the
 * nearest first, from the Program's Actions and the host's own commands.
 */
const nearestUsages = (
  typed: string,
  usages: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const word = firstWordOf(typed).toLowerCase()
  const allowed = Math.max(1, Math.floor(word.length / 3))
  return pipe(
    Array.map(usages, (usage, index) => ({
      usage,
      index,
      farness: farnessOf(word, firstWordOf(usage)),
    })),
    Array.filter(({ farness }) => farness <= allowed),
    Array.sortWith(
      ({ farness, index }) => farness * usages.length + index,
      Order.Number,
    ),
    Array.take(nearestShown),
    Array.map(({ usage }) => usage),
  )
}

const unknownAnswer = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  command: string,
  options: ProgramCommandOptions,
): CliDaemonPaintedResult => {
  const nearest = nearestUsages(command, [
    ...Array.map(bound.entries(), usageOf),
    ...Array.map(options.hostCommands ?? [], host => host.command),
  ])
  const listing = `\`${name} ${options.listCommand ?? 'help'}\` lists every command.`
  return refused(
    Array.match(nearest, {
      onEmpty: () => `Unknown command "${command}". ${listing}`,
      onNonEmpty: usages =>
        `Unknown command "${command}". Nearest: ${Array.join(
          Array.map(usages, usage => `${name} ${usage}`),
          ', ',
        )}. ${listing}`,
    }),
  )
}

// PRESS

const pressCommand = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  command: string,
  press: (tag: string) => boolean,
  options: ProgramCommandOptions = {},
): CliDaemonPaintedResult => {
  const [word = '', ...rest] = command.split(' ')
  const typed = rest.join(' ')
  const commandWord = (entry: Entry): string => commandOf(entry.tag)
  // NOTE: A choice is taken by its word first, `listen the-lantern-keeper`.
  // What that does not take is read as a person names a choice: its
  // title or part of it, in any case. One choice named is pressed;
  // several, or none, are said with the command's own usage.
  const named = (entry: Entry): CliDaemonPaintedResult => {
    const choices = Option.match(entry.maybeChoices, {
      onNone: (): ReadonlyArray<EntryChoice> => [],
      onSome: held => held.choices,
    })
    if (typed === '') {
      return usageAnswer(
        name,
        entry,
        `${commandWord(entry)} needs ${withArticle(nounOf(entry))}.`,
      )
    }
    const matches = namedByTyped(choices, typed, choice => [
      choice.title,
      choice.token,
    ])
    return Array.match(matches, {
      onEmpty: () =>
        usageAnswer(name, entry, `No ${nounOf(entry)} matches "${typed}".`),
      onNonEmpty: found =>
        found.length === 1
          ? pressed(
              {
                entry,
                tag: choiceTagOf(entry.tag, Array.headNonEmpty(found).token),
                availability: Array.headNonEmpty(found).availability,
              },
              false,
            )
          : refused(
              Array.join(
                [
                  `"${typed}" matches ${found.length.toString()} ${nounOf(entry)}s. Say more of the name, or copy one:`,
                  ...choiceCommandLines(name, entry, found),
                ],
                '\n',
              ),
            ),
    })
  }
  const pressed = (
    found: Command,
    mayBeNamed: boolean,
  ): CliDaemonPaintedResult =>
    M.value(found.availability).pipe(
      M.withReturnType<CliDaemonPaintedResult>(),
      M.tagsExhaustive({
        Enabled: () => {
          if (press(found.tag) || Option.isNone(found.entry.maybeChoices)) {
            return painted(paintProgram(bound, name))
          } else if (mayBeNamed) {
            return named(found.entry)
          } else {
            return usageAnswer(
              name,
              found.entry,
              `${commandWord(found.entry)} could not take "${typed}".`,
            )
          }
        },
        Disabled: ({ because }) =>
          refused(`${commandOf(found.tag)} is disabled: ${because}.`, 1),
      }),
    )
  return Option.match(commandFor(bound, command), {
    onSome: found => pressed(found, true),
    onNone: () =>
      Option.match(
        Array.findFirst(
          bound.entries(),
          entry =>
            commandWord(entry) === word && Option.isSome(entry.maybeChoices),
        ),
        {
          onNone: () => unknownAnswer(bound, name, command, options),
          onSome: named,
        },
      ),
  })
}

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
  options: ProgramCommandOptions = {},
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
    return pressCommand(
      bound,
      name,
      rest.join(' '),
      tag => bound.press(tag),
      options,
    )
  } else {
    return pressCommand(
      bound,
      name,
      words.join(' '),
      tag => bound.press(tag),
      options,
    )
  }
}
