// KIND

/** Free text, such as the words to search for. */
export type Text = Readonly<{ _tag: 'Text' }>

/** A number, such as how many paragraphs to keep. */
export type Number = Readonly<{ _tag: 'Number' }>

/**
 * On or off, and off unless it is given. A terminal derives a flag from
 * it, a page a checkbox, an agent a boolean.
 */
export type Toggle = Readonly<{ _tag: 'Toggle' }>

/** One of a fixed set of words, such as `words` or `screen`. */
export type OneOf<
  Options extends ReadonlyArray<string> = ReadonlyArray<string>,
> = Readonly<{ _tag: 'OneOf'; options: Options }>

/**
 * A thing the Program holds now, chosen by what a person calls it.
 * `noun` is that word: `title` for a field that holds a slug.
 */
export type Named = Readonly<{ _tag: 'Named'; noun: string }>

/** A place in time, such as an hour and two minutes into a recording. */
export type Place = Readonly<{ _tag: 'Place' }>

/** A link, to a place inside the Program or outside it. */
export type Link = Readonly<{ _tag: 'Link' }>

/** A value with parts, which a program gives and a person does not say. */
export type Structured = Readonly<{ _tag: 'Structured' }>

/**
 * What kind of value a parameter takes. A kind is plain data, so a Client
 * that has never seen the declaration can still say how to give it.
 *
 * @example
 * ```typescript
 * const kind: Parameter.Kind = { _tag: 'OneOf', options: ['words', 'screen'] }
 * ```
 */
export type Kind =
  | Text
  | Number
  | Toggle
  | OneOf
  | Named
  | Place
  | Link
  | Structured

/**
 * The value a kind takes, as a type: on or off for a Toggle, a number
 * for a Number, one of its words for a OneOf, and text for the rest.
 *
 * @example
 * ```typescript
 * type Topic = Parameter.ValueOf<Parameter.OneOf<readonly ['words', 'screen']>>
 * // 'words' | 'screen'
 * ```
 */
export type ValueOf<K extends Kind> = K extends Toggle
  ? boolean
  : K extends Number
    ? number
    : K extends OneOf<infer Options>
      ? Options[number]
      : K extends Structured
        ? unknown
        : string

// PARAMETER

/**
 * Whether a parameter must be given. `Required`: the declaration cannot
 * run without it. `Optional`: it may be left out, and the handler sees
 * that it was. `Defaulted`: left out, it takes its `default`, so the
 * handler always has a value; a Toggle is always this, off.
 */
export type Presence = 'Required' | 'Optional' | 'Defaulted'

/**
 * One thing a declaration takes. `what` says what it is for, in a few
 * words. `isSubject` marks the one thing the declaration is about, the
 * title to listen to or the topic to follow: a person says it right
 * after the name and a menu asks for it second, while every other
 * parameter is given by its own name. `default` is the value it takes
 * when it is left out.
 *
 * @example
 * ```typescript
 * const before: Parameter.Parameter = {
 *   kind: { _tag: 'Number' },
 *   what: 'How many paragraphs to keep before',
 *   presence: 'Defaulted',
 *   isSubject: false,
 *   default: 1,
 * }
 * ```
 */
export type Parameter<
  K extends Kind = Kind,
  P extends Presence = Presence,
> = Readonly<{
  kind: K
  what: string
  presence: P
  isSubject: boolean
  default?: ValueOf<K>
}>

const optional = <K extends Kind>(
  kind: K,
  what: string,
): Parameter<K, 'Optional'> => ({
  kind,
  what,
  presence: 'Optional',
  isSubject: false,
})

/**
 * A parameter of free text.
 *
 * @example
 * ```typescript
 * Parameter.text('A note to keep with the bookmark')
 * ```
 */
export const text = (what: string): Parameter<Text, 'Optional'> =>
  optional({ _tag: 'Text' }, what)

/**
 * A parameter that is a number.
 *
 * @example
 * ```typescript
 * Parameter.number('How many paragraphs to keep before')
 * ```
 */
export const number = (what: string): Parameter<Number, 'Optional'> =>
  optional({ _tag: 'Number' }, what)

/**
 * A parameter that is on or off, and off unless it is given.
 *
 * @example
 * ```typescript
 * Parameter.toggle('Says each word as it is spoken')
 * ```
 */
export const toggle = (what: string): Parameter<Toggle, 'Defaulted'> => ({
  kind: { _tag: 'Toggle' },
  what,
  presence: 'Defaulted',
  isSubject: false,
  default: false,
})

/**
 * A parameter that is one of a fixed set of words.
 *
 * @example
 * ```typescript
 * Parameter.oneOf(['words', 'screen'], 'What to follow')
 * ```
 */
export const oneOf = <const Options extends ReadonlyArray<string>>(
  options: Options,
  what: string,
): Parameter<OneOf<Options>, 'Optional'> =>
  optional({ _tag: 'OneOf', options }, what)

/**
 * A parameter that is a thing the Program holds now, chosen by what a
 * person calls it.
 *
 * @example
 * ```typescript
 * Parameter.named('title', 'Which title?')
 * ```
 */
export const named = (
  noun: string,
  what: string,
): Parameter<Named, 'Optional'> => optional({ _tag: 'Named', noun }, what)

/**
 * A parameter that is a place in time.
 *
 * @example
 * ```typescript
 * Parameter.place('Where to play from')
 * ```
 */
export const place = (what: string): Parameter<Place, 'Optional'> =>
  optional({ _tag: 'Place' }, what)

/**
 * A parameter that is a link.
 *
 * @example
 * ```typescript
 * Parameter.link('The page to open')
 * ```
 */
export const link = (what: string): Parameter<Link, 'Optional'> =>
  optional({ _tag: 'Link' }, what)

/**
 * A parameter that is a value with parts, which only a program gives.
 *
 * @example
 * ```typescript
 * Parameter.structured('How the place is shared')
 * ```
 */
export const structured = (what: string): Parameter<Structured, 'Optional'> =>
  optional({ _tag: 'Structured' }, what)

/**
 * The same parameter, required: the declaration cannot run without it.
 *
 * @example
 * ```typescript
 * Parameter.required(Parameter.text('The words to look for'))
 * ```
 */
export const required = <K extends Kind>(
  parameter: Parameter<K, 'Optional'>,
): Parameter<K, 'Required'> => ({
  kind: parameter.kind,
  what: parameter.what,
  presence: 'Required',
  isSubject: parameter.isSubject,
})

/**
 * The same parameter as the one thing its declaration is about.
 *
 * @example
 * ```typescript
 * Parameter.subject(Parameter.oneOf(['words', 'screen'], 'What to follow'))
 * ```
 */
export const subject = <K extends Kind, P extends Presence>(
  parameter: Parameter<K, P>,
): Parameter<K, P> => ({ ...parameter, isSubject: true })

/**
 * The same parameter with the value it takes when it is left out, so
 * `follow` alone follows the words and a handler always has a topic.
 *
 * @example
 * ```typescript
 * Parameter.withDefault(Parameter.oneOf(['words', 'screen'], 'What to follow'), 'words')
 * ```
 */
export const withDefault = <K extends Kind>(
  parameter: Parameter<K, 'Optional'>,
  value: ValueOf<K>,
): Parameter<K, 'Defaulted'> => ({
  kind: parameter.kind,
  what: parameter.what,
  presence: 'Defaulted',
  isSubject: parameter.isSubject,
  default: value,
})
