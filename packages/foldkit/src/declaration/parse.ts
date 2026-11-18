import type {
  Declaration,
  Example,
  GivenOfParameters,
  Parameters,
} from './declaration.js'
import type { Kind, Parameter } from './parameter.js'

// NEAREST

const editDistance = (first: string, second: string): number => {
  const firstRow: ReadonlyArray<number> = Array.from(
    { length: second.length + 1 },
    (_, column) => column,
  )
  const lastRow = [...first].reduce(
    (previous, letter, row) =>
      [...second].reduce(
        (current: ReadonlyArray<number>, other, column) => [
          ...current,
          Math.min(
            (previous.at(column + 1) ?? 0) + 1,
            (current.at(column) ?? 0) + 1,
            (previous.at(column) ?? 0) + (letter === other ? 0 : 1),
          ),
        ],
        [row + 1],
      ),
    firstRow,
  )
  return lastRow.at(-1) ?? second.length
}

const nearestShown = 3

const minimumPartLength = 3

const lettersPerAllowedSlip = 3

const farnessOf = (typed: string, name: string): number => {
  const isPart =
    Math.min(typed.length, name.length) >= minimumPartLength &&
    (name.includes(typed) || typed.includes(name))
  return Math.min(editDistance(typed, name), isPart ? 1 : Infinity)
}

/**
 * The names nearest what was typed, by spelling: up to three, the
 * nearest first, and only those close enough to be a slip of the hand.
 * A name that holds what was typed, as `next-chapter` holds `next`,
 * counts as near. Every Client's "did you mean" reads this.
 *
 * @example
 * ```typescript
 * nearestOf('each-wrd', ['each-word', 'before', 'json']) // ['each-word']
 * nearestOf('zzz', ['each-word', 'before']) // []
 * ```
 */
export const nearestOf = (
  typed: string,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const word = typed.toLowerCase()
  const allowed = Math.max(1, Math.floor(word.length / lettersPerAllowedSlip))
  return names
    .map((name, index) => ({
      name,
      index,
      farness: farnessOf(word, name.toLowerCase()),
    }))
    .filter(({ farness }) => farness <= allowed)
    .sort(
      (self, that) =>
        self.farness * names.length +
        self.index -
        (that.farness * names.length + that.index),
    )
    .slice(0, nearestShown)
    .map(({ name }) => name)
}

// SPELLING

/**
 * How one Client says a declaration's names inside a sentence. The
 * sentences are the same everywhere; only the spelling is the Client's:
 * a terminal says `follow` and `--each-word`, a form says the field's
 * label, and the default says the names as they are declared.
 *
 * @example
 * ```typescript
 * const terminal: Spelling = {
 *   name: 'books follow',
 *   parameter: name => `--${name}`,
 *   example: example => `books follow ${example.given.topic}`,
 * }
 * ```
 */
export type Spelling = Readonly<{
  name: string
  parameter: (name: string) => string
  example: (example: Example) => string
}>

/**
 * The names as they are declared, and an example as the values given.
 *
 * @example
 * ```typescript
 * declaredSpelling(Follow).parameter('eachWord') // 'eachWord'
 * ```
 */
export const declaredSpelling = (
  declaration: Declaration<string, any>,
): Spelling => ({
  name: declaration.name,
  parameter: name => name,
  example: example => JSON.stringify(example.given),
})

// PARSE

/**
 * What {@link parse} answers: the typed value a handler takes, or one
 * sentence about the first thing that was wrong, with the parameter it
 * is about when there is one, so a form can put the sentence beside it.
 */
export type Parsed<Given> =
  | Readonly<{ _tag: 'Given'; given: Given }>
  | Readonly<{ _tag: 'Refused'; sentence: string; parameter?: string }>

const keyWordsOf = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter(word => word !== '')
    .join(' ')

const saidOf = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : JSON.stringify(value)

const lowerFirst = (text: string): string =>
  text.slice(0, 1).toLowerCase() + text.slice(1)

const onWords: ReadonlySet<string> = new Set(['1', 'true', 'on', 'yes'])

const offWords: ReadonlySet<string> = new Set(['', '0', 'false', 'off', 'no'])

type Read =
  | Readonly<{ _tag: 'Value'; value: unknown }>
  | Readonly<{ _tag: 'Wrong'; must: string }>

const valueOf = (value: unknown): Read => ({ _tag: 'Value', value })

const wrong = (must: string): Read => ({ _tag: 'Wrong', must })

const textOf = (value: unknown, must: string): Read => {
  if (typeof value === 'string') {
    return valueOf(value)
  } else if (typeof value === 'number') {
    return valueOf(value.toString())
  } else {
    return wrong(must)
  }
}

const numberOf = (value: unknown): Read => {
  const must = 'must be a number'
  if (typeof value === 'number') {
    return Number.isFinite(value) ? valueOf(value) : wrong(must)
  } else if (typeof value === 'string' && value.trim() !== '') {
    return Number.isFinite(Number(value)) ? valueOf(Number(value)) : wrong(must)
  } else {
    return wrong(must)
  }
}

const toggleOf = (value: unknown): Read => {
  const must = 'is on or off'
  if (typeof value === 'boolean') {
    return valueOf(value)
  } else if (typeof value === 'string' && onWords.has(value.toLowerCase())) {
    return valueOf(true)
  } else if (typeof value === 'string' && offWords.has(value.toLowerCase())) {
    return valueOf(false)
  } else {
    return wrong(must)
  }
}

const optionOf = (value: unknown, options: ReadonlyArray<string>): Read => {
  const found =
    typeof value === 'string'
      ? options.find(option => option.toLowerCase() === value.toLowerCase())
      : undefined
  return found === undefined
    ? wrong(`must be one of ${options.join(', ')}`)
    : valueOf(found)
}

const readAs = (kind: Kind, value: unknown): Read => {
  if (kind._tag === 'Number') {
    return numberOf(value)
  } else if (kind._tag === 'Toggle') {
    return toggleOf(value)
  } else if (kind._tag === 'OneOf') {
    return optionOf(value, kind.options)
  } else if (kind._tag === 'Structured') {
    return valueOf(value)
  } else if (kind._tag === 'Named') {
    return textOf(value, `must be a ${kind.noun}, by its name`)
  } else if (kind._tag === 'Place') {
    return textOf(value, 'must be a place in time')
  } else if (kind._tag === 'Link') {
    return textOf(value, 'must be a link')
  } else {
    return textOf(value, 'must be text')
  }
}

type Step =
  | Readonly<{ _tag: 'Kept'; entry: readonly [string, unknown] }>
  | Readonly<{ _tag: 'LeftOut' }>
  | Readonly<{ _tag: 'Refused'; sentence: string; parameter: string }>

const missingSentenceOf = (
  declaration: Declaration,
  spelling: Spelling,
  name: string,
  parameter: Parameter,
): string => {
  const example = declaration.examples.at(0)
  const needs = `${spelling.name} needs ${spelling.parameter(name)}: ${lowerFirst(parameter.what)}.`
  return example === undefined
    ? needs
    : `${needs} For example: ${spelling.example(example)}`
}

const stepOf = (
  declaration: Declaration,
  spelling: Spelling,
  said: ReadonlyMap<string, unknown>,
  name: string,
  parameter: Parameter,
): Step => {
  const raw = said.get(keyWordsOf(name))
  if (raw === undefined) {
    if (parameter.presence === 'Required') {
      return {
        _tag: 'Refused',
        sentence: missingSentenceOf(declaration, spelling, name, parameter),
        parameter: name,
      }
    } else if (parameter.presence === 'Defaulted') {
      return { _tag: 'Kept', entry: [name, parameter.default] }
    } else {
      return { _tag: 'LeftOut' }
    }
  }
  const read = readAs(parameter.kind, raw)
  return read._tag === 'Value'
    ? { _tag: 'Kept', entry: [name, read.value] }
    : {
        _tag: 'Refused',
        sentence: `${spelling.parameter(name)} ${read.must}; got ${saidOf(raw)}.`,
        parameter: name,
      }
}

const unknownSentenceOf = (
  declaration: Declaration,
  spelling: Spelling,
  key: string,
): string => {
  const spelled = Object.keys(declaration.parameters).map(spelling.parameter)
  const nearest = nearestOf(key, spelled).at(0)
  const takesNo = `${spelling.name} takes no ${key}.`
  if (nearest !== undefined) {
    return `${takesNo} Did you mean ${nearest}?`
  } else if (spelled.length === 0) {
    return `${takesNo} It takes nothing.`
  } else {
    return `${takesNo} It takes ${spelled.join(', ')}.`
  }
}

/**
 * Reads what any Client collected for a declaration: the typed value its
 * handler takes, or one sentence about the first thing that was wrong.
 * `said` is a record of raw values under each parameter's name, spelled
 * any way (`eachWord`, `each-word`, `each_word`), with numbers and
 * toggles as values or as the text a terminal or a form holds. A name
 * the declaration does not have is refused with the nearest it does; a
 * required parameter left out, with an example; a value of the wrong
 * kind, or outside its set, with what it must be. A parameter with a
 * default takes it when left out. A terminal, a form, and an agent all
 * call this one function, so they refuse the same input with the same
 * sentence, each spelling the names its own way.
 *
 * @example
 * ```typescript
 * parse(Follow, { 'each-word': '1', before: '2' })
 * // { _tag: 'Given', given: { topic: 'words', eachWord: true, before: 2 } }
 * parse(Follow, { before: 'two' })
 * // { _tag: 'Refused', parameter: 'before', sentence: 'before must be a number; got "two".' }
 * parse(Follow, { eachWrd: true })
 * // { _tag: 'Refused', sentence: 'Follow takes no eachWrd. Did you mean eachWord?' }
 * ```
 */
export const parse = <Name extends string, P extends Parameters>(
  declaration: Declaration<Name, P>,
  said: Readonly<Record<string, unknown>>,
  spelling: Spelling = declaredSpelling(declaration),
): Parsed<GivenOfParameters<P>> => {
  const whole: Declaration = declaration
  const given = Object.entries(said).filter(([, value]) => value !== undefined)
  const names = new Set(Object.keys(whole.parameters).map(keyWordsOf))
  const unknown = given.find(([key]) => !names.has(keyWordsOf(key)))
  if (unknown !== undefined) {
    return {
      _tag: 'Refused',
      sentence: unknownSentenceOf(whole, spelling, unknown[0]),
    }
  }
  const saidByWords = new Map(
    given.map(([key, value]) => [keyWordsOf(key), value]),
  )
  const steps = Object.entries(whole.parameters).map(([name, parameter]) =>
    stepOf(whole, spelling, saidByWords, name, parameter),
  )
  const refused = steps.find(step => step._tag === 'Refused')
  if (refused !== undefined && refused._tag === 'Refused') {
    return refused
  }
  return {
    _tag: 'Given',
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    given: Object.fromEntries(
      steps.flatMap(step => (step._tag === 'Kept' ? [step.entry] : [])),
    ) as GivenOfParameters<P>,
  }
}
