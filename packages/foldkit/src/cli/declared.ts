/**
 * How a terminal spells and reads declarations: the command's words, its
 * flags, its usage line, its examples, and what an argv asked for. All of
 * it is read from `foldkit/declaration`; nothing here is typed beside a
 * declaration. This module must not import Effect, Instant, or a
 * Program, so a view starts fast.
 */
import {
  type Addressed,
  type Declaration,
  type Example,
  type GivenOf,
  type Node,
  type Parameter,
  type Parameters,
  type Spelling,
  parse,
  pathsOf,
  saidNameOf,
  wordsOf,
} from '../declaration/plain.js'

// SPELL

const dashed = (name: string): string => wordsOf(name).join('-')

/**
 * The words a terminal takes for a path: each name with dashes, the
 * names apart.
 *
 * @example
 * ```typescript
 * commandOf(['AddBookmark']) // 'add-bookmark'
 * commandOf(['Menu', 'Type']) // 'menu type'
 * ```
 */
export const commandOf = (path: ReadonlyArray<string>): string =>
  path.map(dashed).join(' ')

/**
 * The flag a terminal takes for a parameter given by name.
 *
 * @example
 * ```typescript
 * flagOf('eachWord') // '--each-word'
 * ```
 */
export const flagOf = (name: string): string => `--${dashed(name)}`

const placeholderOf = (
  name: string,
  parameter: Parameter.Parameter,
): string => {
  if (parameter.kind._tag === 'OneOf') {
    return parameter.kind.options.join('|')
  } else if (parameter.kind._tag === 'Named') {
    return `<${parameter.kind.noun.replaceAll(' ', '-')}>`
  } else if (parameter.kind._tag === 'Number') {
    return parameter.isSubject ? `<${dashed(name)}>` : '<number>'
  } else {
    return `<${dashed(name)}>`
  }
}

const isSayable = (parameter: Parameter.Parameter): boolean =>
  parameter.kind._tag !== 'Structured'

const bracketed = (parameter: Parameter.Parameter, text: string): string =>
  parameter.presence === 'Required' ? text : `[${text}]`

const nameOf = (name: string, parameter: Parameter.Parameter): string =>
  parameter.kind._tag === 'Named'
    ? parameter.kind.noun.replaceAll(' ', '-')
    : dashed(name)

const subjectPlaceholderOf = (
  name: string,
  parameter: Parameter.Parameter,
): string =>
  parameter.presence !== 'Required' && parameter.kind._tag !== 'OneOf'
    ? nameOf(name, parameter)
    : placeholderOf(name, parameter)

const partOf = (name: string, parameter: Parameter.Parameter): string => {
  if (parameter.isSubject) {
    return bracketed(parameter, subjectPlaceholderOf(name, parameter))
  } else if (parameter.kind._tag === 'Toggle') {
    return `[${flagOf(name)}]`
  } else {
    return bracketed(
      parameter,
      `${flagOf(name)} ${placeholderOf(name, parameter)}`,
    )
  }
}

const orderedOf = (
  parameters: Parameters,
): ReadonlyArray<readonly [string, Parameter.Parameter]> => {
  const sayable = Object.entries(parameters).filter(([, parameter]) =>
    isSayable(parameter),
  )
  return [
    ...sayable.filter(([, parameter]) => parameter.isSubject),
    ...sayable.filter(([, parameter]) => !parameter.isSubject),
  ]
}

const subjectNounOf = (declaration: Declaration): string | undefined =>
  Object.values(declaration.parameters).flatMap(parameter =>
    parameter.isSubject && parameter.kind._tag === 'Named'
      ? [parameter.kind.noun]
      : [],
  )[0]

/**
 * The path a terminal says for a declaration: the path given, its last
 * word the name people say, {@link saidNameOf}. An Action titled `Play
 * title` that chooses a title and answers to `Play` is said `play
 * <title>`, while its name, the Message's identity, stays `Listen`.
 *
 * @example
 * ```typescript
 * saidPathOf(['Listen'], Listen) // ['Play']
 * saidPathOf(['Search'], Search) // ['Search']
 * ```
 */
export const saidPathOf = (
  path: ReadonlyArray<string>,
  declaration: Declaration<string, any>,
): ReadonlyArray<string> => {
  const whole: Declaration = declaration
  const said = saidNameOf(whole, subjectNounOf(whole))
  return said === whole.name ? path : [...path.slice(0, -1), said]
}

/**
 * The other names a declaration answers to, beside the one a terminal
 * says: its own name when that is not the one said, then its aliases.
 */
const otherNamesOf = (
  path: ReadonlyArray<string>,
  declaration: Declaration<string, any>,
): ReadonlyArray<string> => {
  const whole: Declaration = declaration
  const said = saidPathOf(path, whole).at(-1)
  return [whole.name, ...whole.aliases].filter(other => other !== said)
}

/**
 * A declaration's usage line, read from its parameters: the command's
 * words, its subject, then each parameter given by name, with what may
 * be left out in brackets. It cannot name a parameter the reader does
 * not take, because {@link askedOf} reads the same declaration.
 *
 * @example
 * ```typescript
 * usageOf(['Follow'], Follow) // 'follow [words|screen] [--each-word] [--before <number>]'
 * usageOf(['Listen'], Listen) // 'listen <title> [--device <number>]'
 * ```
 */
export const usageOf = (
  path: ReadonlyArray<string>,
  declaration: Declaration<string, any>,
): string => {
  const whole: Declaration = declaration
  return [
    commandOf(saidPathOf(path, whole)),
    ...orderedOf(whole.parameters).map(([name, parameter]) =>
      partOf(name, parameter),
    ),
  ].join(' ')
}

const wordPattern = /^[\p{Letter}\p{Number}_./:@%+=-]+$/u

const quoted = (text: string): string =>
  wordPattern.test(text) ? text : `"${text}"`

/**
 * An example as the words to type: the command, its subject, then each
 * parameter given by name. It is spelled from the example's values, so
 * it runs as written.
 *
 * @example
 * ```typescript
 * exampleOf(['Follow'], Follow, { given: { topic: 'words', eachWord: true }, what: '…' })
 * // 'follow words --each-word'
 * ```
 */
export const exampleOf = (
  path: ReadonlyArray<string>,
  declaration: Declaration<string, any>,
  example: Example<any>,
): string => {
  const whole: Declaration = declaration
  const given: Readonly<Record<string, unknown>> = example.given
  return [
    commandOf(saidPathOf(path, declaration)),
    ...orderedOf(whole.parameters).flatMap(([name, parameter]) => {
      const value = given[name]
      if (value === undefined || value === false) {
        return []
      } else if (parameter.isSubject) {
        return [quoted(String(value))]
      } else if (parameter.kind._tag === 'Toggle') {
        return [flagOf(name)]
      } else {
        return [flagOf(name), quoted(String(value))]
      }
    }),
  ].join(' ')
}

/**
 * The flags that are on or off in a tree of declarations, by the word
 * after the dashes, with those every command takes. The argv reader
 * takes them, so a toggle never swallows the word typed after it:
 * `follow --each-word words` follows the words.
 *
 * @example
 * ```typescript
 * toggleFlagsOf([Follow, Search]) // ['each-word', 'json']
 * ```
 */
export const toggleFlagsOf = (
  nodes: ReadonlyArray<Node>,
  everywhere: Parameters = {},
): ReadonlyArray<string> => {
  const names = [
    ...pathsOf(nodes).flatMap(({ declaration }) =>
      Object.entries(declaration.parameters),
    ),
    ...Object.entries(everywhere),
  ]
    .filter(([, parameter]) => parameter.kind._tag === 'Toggle')
    .map(([name]) => dashed(name))
  return [...new Set(names)]
}

// READ

/**
 * What an argv asked for: a declaration with what it was given, a
 * refusal in one sentence with the command's usage, or nothing declared
 * here, which the Program's own Actions then answer.
 */
export type Asked =
  | Readonly<{
      _tag: 'Asked'
      path: ReadonlyArray<string>
      declaration: Declaration
      given: Readonly<Record<string, unknown>>
    }>
  | Readonly<{
      _tag: 'Refused'
      path: ReadonlyArray<string>
      declaration: Declaration
      sentence: string
    }>
  | Readonly<{ _tag: 'NotDeclared' }>

/**
 * What {@link askedOf} needs beside the tree: the command's own name,
 * `books`, said before every usage and example, and the flags every
 * command takes, such as whether to paint in color.
 */
export type AskedOptions = Readonly<{
  name?: string
  everywhere?: Parameters
}>

const spokenOf = (name: string): string => wordsOf(name).join(' ')

const typedOf = (word: string): string =>
  word
    .toLowerCase()
    .split(/[-_]/u)
    .filter(part => part !== '')
    .join(' ')

const answersTo = (declaration: Declaration, word: string): boolean =>
  [declaration.name, ...declaration.aliases].some(
    name => spokenOf(name) === typedOf(word),
  )

type Found = Readonly<{ addressed: Addressed; rest: ReadonlyArray<string> }>

const foundIn = (
  nodes: ReadonlyArray<Node>,
  words: ReadonlyArray<string>,
): Found | undefined =>
  pathsOf(nodes)
    .flatMap(addressed => {
      const parents = addressed.path.slice(0, -1)
      const typed = words.slice(0, addressed.path.length)
      const leaf = typed.at(-1)
      const isParents = parents.every(
        (name, index) => spokenOf(name) === typedOf(typed.at(index) ?? ''),
      )
      return typed.length === addressed.path.length &&
        leaf !== undefined &&
        isParents &&
        answersTo(addressed.declaration, leaf)
        ? [{ addressed, rest: words.slice(addressed.path.length) }]
        : []
    })
    .sort(
      (self, that) => that.addressed.path.length - self.addressed.path.length,
    )
    .at(0)

const prefixed = (name: string | undefined, text: string): string =>
  name === undefined ? text : `${name} ${text}`

const spellingOf = (
  name: string | undefined,
  { path, declaration }: Addressed,
): Spelling => ({
  name: prefixed(name, commandOf(path)),
  parameter: parameterName => {
    const parameter = declaration.parameters[parameterName]
    return parameter !== undefined && parameter.isSubject
      ? placeholderOf(parameterName, {
          ...parameter,
          kind:
            parameter.kind._tag === 'OneOf' ? { _tag: 'Text' } : parameter.kind,
        })
      : flagOf(parameterName)
  },
  example: example => prefixed(name, exampleOf(path, declaration, example)),
})

/**
 * What an argv's words and flags ask of a tree of declarations. The
 * first words name a declaration by its path, its name, or an alias; the
 * words after are its subject; the flags are its parameters given by
 * name. What it was given is read by `parse`, the one reader every
 * Client shares, so a wrong flag or a missing word is refused in the
 * same sentence a form or an agent hears, spelled for a terminal and
 * followed by the usage. Words that name nothing here are left for the
 * Program.
 *
 * @example
 * ```typescript
 * askedOf(tree, ['follow', 'words'], { 'each-word': '1' }, { name: 'books' })
 * // { _tag: 'Asked', path: ['Follow'], declaration: Follow, given: { topic: 'words', eachWord: true } }
 * askedOf(tree, ['follow'], { 'each-wrd': '1' }, { name: 'books' })
 * // { _tag: 'Refused', …, sentence: 'books follow takes no --each-wrd. Did you mean --each-word?\nUsage: books follow [words|screen] [--each-word]' }
 * askedOf(tree, ['pause'], {}) // { _tag: 'NotDeclared' }
 * ```
 */
export const askedOf = (
  nodes: ReadonlyArray<Node>,
  words: ReadonlyArray<string>,
  flags: Readonly<Record<string, string>>,
  options: AskedOptions = {},
): Asked => {
  const found = foundIn(nodes, words)
  if (found === undefined) {
    return { _tag: 'NotDeclared' }
  }
  const { addressed, rest } = found
  const { path, declaration } = addressed
  const usage = `Usage: ${prefixed(options.name, usageOf(path, declaration))}`
  const refused = (sentence: string): Asked => ({
    _tag: 'Refused',
    path,
    declaration,
    sentence: `${sentence}\n${usage}`,
  })
  const subject = Object.entries(declaration.parameters).find(
    ([, parameter]) => parameter.isSubject,
  )
  if (rest.length > 0 && subject === undefined) {
    return refused(
      `${prefixed(options.name, commandOf(path))} takes nothing after it, and got "${rest.join(' ')}".`,
    )
  }
  const everywhere = new Set(
    Object.keys(options.everywhere ?? {}).map(name => dashed(name)),
  )
  const said: Readonly<Record<string, unknown>> = {
    ...(subject === undefined || rest.length === 0
      ? {}
      : { [subject[0]]: rest.join(' ') }),
    ...Object.fromEntries(
      Object.entries(flags)
        .filter(([flag]) => !everywhere.has(flag))
        .map(([flag, value]) => [`--${flag}`, value]),
    ),
  }
  const parsed = parse(declaration, said, spellingOf(options.name, addressed))
  return parsed._tag === 'Refused'
    ? refused(parsed.sentence)
    : { _tag: 'Asked', path, declaration, given: parsed.given }
}

/**
 * What was given, typed, when this declaration is the one asked for;
 * undefined otherwise. The type is the declaration's own, so a handler
 * cannot read a parameter that is not declared.
 *
 * @example
 * ```typescript
 * const follow = givenFor(asked, Follow)
 * if (follow !== undefined) {
 *   follow.topic // 'words' | 'screen'
 * }
 * ```
 */
export const givenFor = <D extends Declaration<string, any>>(
  asked: Asked,
  declaration: D,
): GivenOf<D> | undefined =>
  asked._tag === 'Asked' && asked.declaration === declaration
    ? /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      (asked.given as GivenOf<D>)
    : undefined

// HELP

const helpWidth = 80

const indent = '  '

const columnGap = 2

const widestUsageColumn = 30

const narrowestUsageColumn = 4

const wrapped = (text: string, width: number): ReadonlyArray<string> =>
  text
    .split(' ')
    .filter(word => word !== '')
    .reduce((lines: ReadonlyArray<string>, word) => {
      const last = lines.at(-1)
      return last === undefined || last.length + 1 + word.length > width
        ? [...lines, word]
        : [...lines.slice(0, -1), `${last} ${word}`]
    }, [])

/** One line of help before it is laid out: what to type, and what it does. */
export type HelpRow = Readonly<{ usage: string; what: string }>

/**
 * A declaration as a row of help: its usage after the command's name,
 * and its `what`.
 *
 * @example
 * ```typescript
 * helpRowOf('books', { path: ['Devices'], declaration: Devices })
 * // { usage: 'books devices', what: 'Lists the audio outputs, by number' }
 * ```
 */
export const helpRowOf = (
  name: string,
  { path, declaration }: Addressed,
): HelpRow => ({
  usage: `${name} ${usageOf(path, declaration)}`,
  what: declaration.what,
})

/**
 * Rows of help laid out in two columns to 80 columns: what to type, then
 * what it does, wrapped under itself. A usage too long for its column
 * puts what it does on the next line, so one long usage never pushes
 * every description off the screen.
 *
 * @example
 * ```typescript
 * helpLines([{ usage: 'books devices', what: 'Lists the audio outputs, by number' }])
 * // ['  books devices  Lists the audio outputs, by number']
 * ```
 */
export const helpLines = (
  rows: ReadonlyArray<HelpRow>,
): ReadonlyArray<string> => {
  const column = Math.min(
    Math.max(
      narrowestUsageColumn,
      ...rows
        .map(row => row.usage.length + columnGap)
        .filter(width => width <= widestUsageColumn),
    ),
    widestUsageColumn,
  )
  const under = ' '.repeat(indent.length + column)
  return rows.flatMap(row => {
    const lines = wrapped(row.what, helpWidth - under.length)
    const [first = '', ...rest] = lines
    return row.usage.length + columnGap > column
      ? [`${indent}${row.usage}`, ...lines.map(line => `${under}${line}`)]
      : [
          `${indent}${row.usage.padEnd(column)}${first}`,
          ...rest.map(line => `${under}${line}`),
        ]
  })
}

const sentenceOf = (text: string): string =>
  /[.!?…]$/u.test(text.trim()) ? text.trim() : `${text.trim()}.`

const parameterRowOf = (
  name: string,
  parameter: Parameter.Parameter,
): HelpRow => {
  const shown =
    parameter.default === undefined || parameter.kind._tag === 'Toggle'
      ? sentenceOf(parameter.what)
      : `${sentenceOf(parameter.what)} Left out, it is ${String(parameter.default)}.`
  if (parameter.isSubject) {
    return { usage: subjectPlaceholderOf(name, parameter), what: shown }
  } else if (parameter.kind._tag === 'Toggle') {
    return { usage: flagOf(name), what: shown }
  } else {
    return {
      usage: `${flagOf(name)} ${placeholderOf(name, parameter)}`,
      what: shown,
    }
  }
}

/**
 * Everything one declaration says, for a person who asks about that
 * command: its usage, what it does and why the user would want it, each
 * parameter with what it is for, and its examples as lines to type.
 *
 * @example
 * ```typescript
 * commandHelpOf('books', { path: ['Search'], declaration: Search })
 * // 'books search <words> [--json]\n  Finds where words are spoken. To get back to a passage …\n\n  <words>  The words to look for.\n…'
 * ```
 */
export const commandHelpOf = (name: string, addressed: Addressed): string => {
  const { path, declaration } = addressed
  const parameters = orderedOf(declaration.parameters)
  return [
    `${name} ${usageOf(path, declaration)}`,
    ...wrapped(
      `${sentenceOf(declaration.what)} ${sentenceOf(declaration.why)}`,
      helpWidth - indent.length,
    ).map(line => `${indent}${line}`),
    ...(otherNamesOf(path, declaration).length === 0
      ? []
      : [
          `${indent}Also: ${otherNamesOf(path, declaration)
            .map(other => `${name} ${commandOf([...path.slice(0, -1), other])}`)
            .join(', ')}`,
        ]),
    ...(parameters.length === 0
      ? []
      : [
          '',
          ...helpLines(
            parameters.map(([parameterName, parameter]) =>
              parameterRowOf(parameterName, parameter),
            ),
          ),
        ]),
    ...(declaration.examples.length === 0
      ? []
      : [
          '',
          'Examples',
          ...helpLines(
            declaration.examples.map(example => ({
              usage: `${name} ${exampleOf(path, declaration, example)}`,
              what: example.what,
            })),
          ),
        ]),
  ].join('\n')
}
