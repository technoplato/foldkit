import type { Kind, Parameter, ValueOf } from './parameter.js'

// NOTE: This module and `parameter.ts`, `tool.ts` and `plain.ts` import
// nothing at run time, Effect included. A declaration is plain data that
// knows no terminal, browser, or application, and a terminal's slim view
// reads it before anything else has loaded. `schema.ts` is the layer out
// that turns the same data into an Effect Schema.

// TOUCHES

/**
 * What asking for a declaration touches, in two relations: the state it
 * `mutates`, as paths of the Model, and the things it `triggers`, as the
 * names of the Commands whose side effects run. An author never types
 * these strings: an Action names typed paths and the Command definitions
 * themselves, a pure check holds `update` to them, and this is the plain
 * form every Client reads. Both empty means it only looks.
 *
 * @example
 * ```typescript
 * const touches: Declaration.Touches = { mutates: ['count'], triggers: [] }
 * ```
 */
export type Touches = Readonly<{
  mutates: ReadonlyArray<string>
  triggers: ReadonlyArray<string>
}>

/**
 * Whether what is touched changes anything: some state is mutated, or a
 * side effect is triggered.
 *
 * @example
 * ```typescript
 * Declaration.changesSomething({ mutates: [], triggers: [] }) // false
 * ```
 */
export const changesSomething = (touches: Touches): boolean =>
  touches.mutates.length > 0 || touches.triggers.length > 0

// DECLARATION

/** The parameters of a declaration, each under its name, in order. */
export type Parameters = Readonly<Record<string, Parameter>>

type PresentNames<P extends Parameters> = {
  [Name in keyof P]: P[Name] extends Parameter<Kind, 'Required' | 'Defaulted'>
    ? Name
    : never
}[keyof P]

type Simplified<T> = { readonly [Key in keyof T]: T[Key] }

/**
 * What a handler is handed for these parameters: each required one,
 * each one with a default, and each of the others when it was given.
 *
 * @example
 * ```typescript
 * type Given = Declaration.GivenOfParameters<typeof Follow.parameters>
 * // Readonly<{ topic: 'words' | 'screen'; eachWord: boolean; before?: number }>
 * ```
 */
export type GivenOfParameters<P extends Parameters> = Simplified<
  { [Name in PresentNames<P>]: ValueOf<P[Name]['kind']> } & {
    [Name in Exclude<keyof P, PresentNames<P>>]?: ValueOf<P[Name]['kind']>
  }
>

/**
 * One way a declaration is asked for, as data: the parameters given and
 * what that does. Every Client spells it its own way, so an example can
 * never name a parameter the declaration does not take.
 *
 * @example
 * ```typescript
 * const example = { given: { topic: 'words' }, what: 'The words as they are read' }
 * ```
 */
export type Example<P extends Parameters = Parameters> = Readonly<{
  given: Partial<GivenOfParameters<P>>
  what: string
}>

/**
 * One thing a person or a program can ask for, said once, as plain data
 * that knows no terminal, browser, or application.
 *
 * `what` says what it does, in the person's terms. `why` says why a
 * person would want that. Both are written for the person, never for a
 * program and never in one Client's words:
 *
 * - Good: what `Plays a title from the last place the user listened`,
 *   why `To hear the book`.
 * - Bad: what `Sends Listen with a slug`, why `To pipe the words to
 *   another program from a terminal`. The first describes the code; the
 *   second names a Client and a program's wish, not a person's.
 *
 * Both name the actor in the third person, the user, never `you`.
 *
 * `name` is its identity, in the words of a tag: `AddBookmark`.
 * `aliases` are other names it answers to, `Bookmark`. `touches` says
 * what asking for it changes, when that has been derived; it is absent
 * until then. `parameters` are derived from Effect
 * Schema fields, never written beside them. Help, a terminal's reader
 * and usage, a menu row, a hint, an accessible description, a form's
 * check, and an agent's tool are all read from this value; none is
 * typed beside it.
 *
 * @example
 * ```typescript
 * const Listen: Declaration.Declaration = {
 *   _tag: 'Declaration',
 *   name: 'Listen',
 *   aliases: [],
 *   what: 'Plays a title from the last place the user listened',
 *   why: 'To hear the book',
 *   parameters: {
 *     slug: { kind: { _tag: 'Named', noun: 'title' }, what: 'Which title?', presence: 'Required', isSubject: true },
 *   },
 *   examples: [],
 * }
 * ```
 */
export type Declaration<
  Name extends string = string,
  P extends Parameters = Parameters,
> = Readonly<{
  _tag: 'Declaration'
  name: Name
  title?: string
  aliases: ReadonlyArray<string>
  what: string
  why: string
  touches?: Touches
  parameters: P
  examples: ReadonlyArray<Example<P>>
}>

/** What a handler of this declaration is handed. */
export type GivenOf<D> =
  D extends Declaration<string, infer P> ? GivenOfParameters<P> : never

/** What {@link make} takes beside the name. */
export type Config<P extends Parameters> = Readonly<{
  title?: string
  aliases?: ReadonlyArray<string>
  what: string
  why: string
  touches?: Touches
  parameters?: P
  examples?: ReadonlyArray<Example<P>>
}>

/**
 * Builds the plain declaration from parameters that are already plain
 * data. Declarations are authored with Effect Schema fields
 * (`Catalog.action`, `Reading.declare`, `Declaration.declare`), which
 * derive their parameters and call this; a test builds one directly.
 *
 * @example
 * ```typescript
 * const Devices = make('Devices', {
 *   what: 'Lists the audio outputs, by number',
 *   why: 'To pick which speakers a book plays on',
 * })
 * ```
 */
export const make = <
  const Name extends string,
  const P extends Parameters = {},
>(
  name: Name,
  config: Config<P>,
): Declaration<Name, P> => ({
  _tag: 'Declaration',
  name,
  ...(config.title === undefined ? {} : { title: config.title }),
  aliases: config.aliases ?? [],
  what: config.what,
  why: config.why,
  ...(config.touches === undefined ? {} : { touches: config.touches }),
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  parameters: config.parameters ?? ({} as P),
  examples: config.examples ?? [],
})

/**
 * The same declaration with more parameters after its own, such as the
 * audio output a terminal lets `Listen` take when it starts the player.
 *
 * @example
 * ```typescript
 * Declaration.withParameters(Listen, { device: Parameter.number('The audio output to play on') })
 * ```
 */
export const withParameters = <
  Name extends string,
  P extends Parameters,
  const More extends Parameters,
>(
  declaration: Declaration<Name, P>,
  more: More,
): Declaration<Name, P & More> => ({
  ...declaration,
  parameters: { ...declaration.parameters, ...more },
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  examples: declaration.examples as ReadonlyArray<Example<P & More>>,
})

// NAME

/**
 * A name as the words every Client spells its own way: a terminal joins
 * them with a dash, an agent with an underscore, a title with spaces.
 *
 * @example
 * ```typescript
 * Declaration.wordsOf('AddBookmark') // ['add', 'bookmark']
 * Declaration.wordsOf('eachWord') // ['each', 'word']
 * ```
 */
export const wordsOf = (name: string): ReadonlyArray<string> =>
  (name.slice(0, 1) + name.slice(1).replace(/([A-Z])/g, '_$1'))
    .toLowerCase()
    .split('_')
    .filter(word => word !== '')

const spokenOf = (name: string): string => wordsOf(name).join(' ')

const wordsSaidIn = (text: string): ReadonlyArray<string> =>
  text
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter(word => word !== '')

/**
 * The name people say for a thing that has a name, a title, and other
 * names it answers to. It is the name, unless the title ends with what
 * the thing chooses, `noun`, and the rest of the title is one of its
 * other names; then it is that name. An Action named `Listen`, titled
 * `Play title`, that chooses a title and answers to `Play` is said
 * `Play`, while `Listen` stays the Message's identity. A title it does
 * not answer to changes nothing, so no Client says a name that would not
 * be understood.
 *
 * @example
 * ```typescript
 * saidNameOf({ name: 'Listen', title: 'Play title', aliases: ['Play'] }, 'title') // 'Play'
 * saidNameOf({ name: 'Listen', title: 'Play title', aliases: [] }, 'title') // 'Listen'
 * ```
 */
export const saidNameOf = (
  named: Readonly<{
    name: string
    title?: string | undefined
    aliases: ReadonlyArray<string>
  }>,
  noun: string | undefined,
): string => {
  const titleWords = wordsSaidIn(named.title ?? '')
  const nounWords = wordsSaidIn(noun ?? '')
  const restWords = titleWords.slice(0, titleWords.length - nounWords.length)
  const endsWithNoun =
    nounWords.length > 0 &&
    restWords.length > 0 &&
    titleWords.slice(restWords.length).join(' ') === nounWords.join(' ')
  const answered = endsWithNoun
    ? named.aliases.find(alias => spokenOf(alias) === restWords.join(' '))
    : undefined
  return answered ?? named.name
}

// GROUP

/**
 * Declarations held under one name, such as everything the action menu
 * takes under `Menu`. A child is addressed by its path, `Menu` then
 * `Type`, so two groups may each hold an `Open`.
 *
 * @example
 * ```typescript
 * const Menu: Declaration.Group = { _tag: 'Group', name: 'Menu', what: 'The action menu', children: [Open, Type] }
 * ```
 */
export type Group = Readonly<{
  _tag: 'Group'
  name: string
  what: string
  children: ReadonlyArray<Node>
}>

/** A declaration, or a group of them. */
export type Node = Declaration<string, any> | Group

/**
 * Composes declarations under one name. A parent composes its children's
 * the same way, so a Client reads the whole tree.
 *
 * @example
 * ```typescript
 * const Menu = Declaration.group('Menu', { what: 'The action menu', children: [Open, Type] })
 * ```
 */
export const group = (
  name: string,
  config: Readonly<{ what: string; children: ReadonlyArray<Node> }>,
): Group => ({
  _tag: 'Group',
  name,
  what: config.what,
  children: config.children,
})

/** One declaration of a tree, with the names that lead to it. */
export type Addressed = Readonly<{
  path: ReadonlyArray<string>
  declaration: Declaration
}>

const addressedUnder = (
  nodes: ReadonlyArray<Node>,
  parents: ReadonlyArray<string>,
): ReadonlyArray<Addressed> =>
  nodes.flatMap(node =>
    node._tag === 'Group'
      ? addressedUnder(node.children, [...parents, node.name])
      : [{ path: [...parents, node.name], declaration: node }],
  )

/**
 * Every declaration of a tree in order, each with its path.
 *
 * @example
 * ```typescript
 * Declaration.pathsOf([Follow, Menu]).map(({ path }) => path)
 * // [['Follow'], ['Menu', 'Open'], ['Menu', 'Type']]
 * ```
 */
export const pathsOf = (nodes: ReadonlyArray<Node>): ReadonlyArray<Addressed> =>
  addressedUnder(nodes, [])

const answersOf = (node: Node): ReadonlyArray<string> =>
  node._tag === 'Group' ? [node.name] : [node.name, ...node.aliases]

const answersTo = (node: Node, name: string): boolean =>
  answersOf(node).some(answer => spokenOf(answer) === spokenOf(name))

const findUnder = (
  nodes: ReadonlyArray<Node>,
  path: ReadonlyArray<string>,
  parents: ReadonlyArray<string>,
): Addressed | undefined => {
  const [head, ...rest] = path
  if (head === undefined) {
    return undefined
  }
  const found = nodes.find(node => answersTo(node, head))
  if (found === undefined) {
    return undefined
  } else if (found._tag === 'Group') {
    return findUnder(found.children, rest, [...parents, found.name])
  } else if (rest.length === 0) {
    return { path: [...parents, found.name], declaration: found }
  } else {
    return undefined
  }
}

/**
 * The declaration a path names, by its name or an alias, whatever the
 * spelling of the words. Undefined when the tree holds none there.
 *
 * @example
 * ```typescript
 * Declaration.findByPath([Search, Menu], ['Find']) // { path: ['Search'], declaration: Search }
 * Declaration.findByPath([Search, Menu], ['menu', 'type'])?.declaration.name // 'Type'
 * ```
 */
export const findByPath = (
  nodes: ReadonlyArray<Node>,
  path: ReadonlyArray<string>,
): Addressed | undefined => findUnder(nodes, path, [])

/**
 * The names two declarations of one group both answer to, a sentence
 * each. A name is taken once inside a group; the same name in another
 * group is a different path and collides with nothing.
 *
 * @example
 * ```typescript
 * Declaration.collisionsOf([Search, Find]) // ['Find is answered by both Search and Find.']
 * ```
 */
export const collisionsOf = (
  nodes: ReadonlyArray<Node>,
): ReadonlyArray<string> => {
  const here = nodes.flatMap((node, index) =>
    answersOf(node).flatMap(answer =>
      nodes
        .slice(0, index)
        .filter(earlier => answersTo(earlier, answer))
        .map(
          earlier =>
            `${answer} is answered by both ${earlier.name} and ${node.name}.`,
        ),
    ),
  )
  const below = nodes.flatMap(node =>
    node._tag === 'Group' ? collisionsOf(node.children) : [],
  )
  return [...here, ...below]
}

// CHECK

const fillerWords: ReadonlySet<string> = new Set([
  'a',
  'an',
  'and',
  'it',
  'its',
  'of',
  'or',
  'that',
  'the',
  'this',
  'to',
])

const contentWordsOf = (sentence: string): ReadonlyArray<string> =>
  sentence
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter(word => word !== '' && !fillerWords.has(word))

const endingLength = 2

const isSameWord = (self: string, that: string): boolean =>
  self === that ||
  (Math.abs(self.length - that.length) <= endingLength &&
    Math.min(self.length, that.length) > 1 &&
    (self.startsWith(that) || that.startsWith(self)))

/**
 * Whether a `why` only says its `what` again: every word of it that
 * carries meaning is already in the `what`, whatever its ending. A why
 * earns its place by saying why a person would want this.
 *
 * @example
 * ```typescript
 * Declaration.restates('Sets the count to 0', 'To set the count to 0') // true
 * Declaration.restates('Sets the count to 0', 'To start over') // false
 * ```
 */
export const restates = (what: string, why: string): boolean => {
  const said = contentWordsOf(what)
  return contentWordsOf(why).every(word =>
    said.some(other => isSameWord(word, other)),
  )
}

const clientWordPattern =
  /\b(terminal|cli|argv|flag|flags|stdout|stdin|stderr|pipe|piped|json|browser|click|clicks|tap|taps|command line|shell|dom|html|react|socket|daemon|process)\b/iu

/**
 * The words of a Client in a declaration's `what`, its `why`, or what a
 * parameter is for, a sentence each; empty when there are none. A
 * declaration in a core is written for the person: what it does, and
 * why they would want it. It never says how one Client reaches it, so
 * `terminal`, `flag`, `click`, `browser`, and `JSON` fail a core's
 * test. A host's own declarations may name their host.
 *
 * @example
 * ```typescript
 * Declaration.clientWordsOf(Listen) // []
 * // why: 'To pipe the words to another program'
 * // ['Follow: its why says "pipe", a word of one Client. Say it for the person.']
 * ```
 */
export const clientWordsOf = (
  declaration: Declaration<string, any>,
): ReadonlyArray<string> => {
  const whole: Declaration = declaration
  const said: ReadonlyArray<readonly [string, string]> = [
    ['what', whole.what],
    ['why', whole.why],
    ...Object.entries(whole.parameters).map(
      ([name, parameter]): readonly [string, string] => [name, parameter.what],
    ),
  ]
  return said.flatMap(([part, text]) => {
    const found = clientWordPattern.exec(text)
    return found === null
      ? []
      : [
          `${whole.name}: its ${part} says "${found[0]}", a word of one Client. Say it for the person.`,
        ]
  })
}

const secondPersonPattern = /\b(you|your|yours|yourself)\b/iu

const secondPersonProblemsOf = (
  declaration: Declaration,
): ReadonlyArray<string> => {
  const said: ReadonlyArray<readonly [string, string]> = [
    ['what', declaration.what],
    ['why', declaration.why],
  ]
  return said.flatMap(([part, text]) => {
    const found = secondPersonPattern.exec(text)
    return found === null
      ? []
      : [
          `${declaration.name}: its ${part} says "${found[0]}". Name the user, in the third person.`,
        ]
  })
}

const subjectProblemsOf = (declaration: Declaration): ReadonlyArray<string> => {
  const subjects = Object.entries(declaration.parameters)
    .filter(([, parameter]) => parameter.isSubject)
    .map(([name]) => name)
  return subjects.length > 1
    ? [
        `${declaration.name}: ${subjects.join(' and ')} are both its subject. A declaration is about one thing; the rest are given by name.`,
      ]
    : []
}

const exampleProblemsOf = (
  declaration: Declaration,
  example: Example,
): ReadonlyArray<string> => {
  const given: Readonly<Record<string, unknown>> = example.given
  const unknown = Object.keys(given)
    .filter(name => declaration.parameters[name] === undefined)
    .map(
      name =>
        `${declaration.name}: an example gives ${name}, which is not one of its parameters.`,
    )
  const missing = Object.entries(declaration.parameters)
    .filter(
      ([name, parameter]) =>
        parameter.presence === 'Required' && given[name] === undefined,
    )
    .map(
      ([name]) =>
        `${declaration.name}: an example leaves out ${name}, which is required.`,
    )
  const outside = Object.entries(declaration.parameters).flatMap(
    ([name, parameter]) => {
      const value = given[name]
      return parameter.kind._tag === 'OneOf' &&
        value !== undefined &&
        !parameter.kind.options.includes(String(value))
        ? [
            `${declaration.name}: an example gives ${name} as ${String(value)}, which is not one of ${parameter.kind.options.join(', ')}.`,
          ]
        : []
    },
  )
  return [...unknown, ...missing, ...outside]
}

/**
 * What a declaration gets wrong, a sentence each; empty when it is
 * sound. A test asks this of every declaration a Program and its hosts
 * make, so a why that repeats its what, two subjects, or an example
 * that names a parameter that is gone fails the build.
 *
 * @example
 * ```typescript
 * Declaration.problemsOf(Follow) // []
 * ```
 */
export const problemsOf = (
  declaration: Declaration<string, any>,
): ReadonlyArray<string> => {
  const whole: Declaration = declaration
  return [
    ...(whole.what.trim() === ''
      ? [`${whole.name}: it does not say what it is used for.`]
      : []),
    ...(whole.why.trim() === ''
      ? [`${whole.name}: it does not say why it would be asked.`]
      : []),
    ...(whole.why.trim() !== '' && restates(whole.what, whole.why)
      ? [
          `${whole.name}: its why only repeats its what. Say when or for what it would be asked.`,
        ]
      : []),
    ...(whole.why.trim() === '' || /^To\s/u.test(whole.why)
      ? []
      : [
          `${whole.name}: its why is told about someone or something. Say the reason itself, as the user would give it, such as \`To leave this screen\`.`,
        ]),
    ...secondPersonProblemsOf(whole),
    ...whole.aliases
      .filter(alias => spokenOf(alias) === spokenOf(whole.name))
      .map(alias => `${whole.name}: the alias ${alias} is its own name.`),
    ...subjectProblemsOf(whole),
    ...Object.entries(whole.parameters)
      .filter(
        ([, parameter]) =>
          parameter.kind._tag === 'Toggle' &&
          parameter.presence !== 'Defaulted',
      )
      .map(
        ([name]) =>
          `${whole.name}: ${name} is on or off, and off unless it is given, so it is neither required nor optional.`,
      ),
    ...whole.examples.flatMap(example => exampleProblemsOf(whole, example)),
  ]
}
