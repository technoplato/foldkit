import {
  Array,
  Option,
  Predicate,
  Record,
  Result,
  Schema as S,
  SchemaAST,
  String,
} from 'effect'

import {
  type Declaration,
  type Parameters,
  type Reach,
  make,
  wordsOf,
} from './declaration.js'
import type { Kind, Parameter } from './parameter.js'
import { type Parsed, type Spelling, declaredSpelling, parse } from './parse.js'

// KIND

const kindKey = 'foldkitParameterKind'

/**
 * Annotations that say a field is a thing the Program holds now, chosen
 * by what a person calls it: a title, a counter. The Schema says the
 * type; this says what a person names.
 *
 * @example
 * ```typescript
 * const slug = TitleSlug.annotate({ description: 'Which title?', ...named('title') })
 * ```
 */
export const named = (noun: string): Readonly<Record<string, Kind>> => ({
  [kindKey]: { _tag: 'Named', noun },
})

/**
 * Annotations that say a field is a place in time.
 *
 * @example
 * ```typescript
 * const from = S.String.annotate({ description: 'Where to play from', ...place })
 * ```
 */
export const place: Readonly<Record<string, Kind>> = {
  [kindKey]: { _tag: 'Place' },
}

/**
 * Annotations that say a field is a link.
 *
 * @example
 * ```typescript
 * const page = S.String.annotate({ description: 'The page to open', ...link })
 * ```
 */
export const link: Readonly<Record<string, Kind>> = {
  [kindKey]: { _tag: 'Link' },
}

// FIELDS

const optionsOf = (
  ast: SchemaAST.AST,
): Option.Option<ReadonlyArray<string>> => {
  if (SchemaAST.isLiteral(ast)) {
    return Predicate.isString(ast.literal)
      ? Option.some([ast.literal])
      : Option.none()
  } else if (SchemaAST.isUnion(ast)) {
    return Option.map(
      Option.all(Array.map(ast.types, optionsOf)),
      Array.flatten,
    )
  } else {
    return Option.none()
  }
}

const isKind = (value: unknown): value is Kind =>
  Predicate.hasProperty(value, '_tag') && Predicate.isString(value._tag)

type Field = S.Struct.Fields[string]

const annotatedKindOf = (field: Field): Option.Option<Kind> =>
  Option.filter(
    Option.fromNullishOr(SchemaAST.resolveAt<unknown>(kindKey)(field.ast)),
    isKind,
  )

const kindOfAst = (ast: SchemaAST.AST): Kind => {
  if (SchemaAST.isString(ast)) {
    return { _tag: 'Text' }
  } else if (SchemaAST.isNumber(ast)) {
    return { _tag: 'Number' }
  } else if (SchemaAST.isBoolean(ast)) {
    return { _tag: 'Toggle' }
  } else {
    return Option.match(optionsOf(ast), {
      onNone: (): Kind => ({ _tag: 'Structured' }),
      onSome: options => ({ _tag: 'OneOf', options }),
    })
  }
}

const sentenceCaseOf = (name: string): string => {
  const words = Array.join(wordsOf(name), ' ')
  return String.toUpperCase(words.slice(0, 1)) + words.slice(1)
}

const descriptionOf = (field: Field): Option.Option<string> =>
  Option.filter(
    Option.fromNullishOr(
      SchemaAST.resolveAt<unknown>('description')(field.ast),
    ),
    Predicate.isString,
  )

type Presented = Pick<Parameter, 'presence' | 'default'>

const aloneOf = (
  name: string,
  field: Field,
): S.Codec<Readonly<Record<string, unknown>>, unknown> =>
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  S.Struct(Record.singleton(name, field)) as unknown as S.Codec<
    Readonly<Record<string, unknown>>,
    unknown
  >

const presentedOf = (name: string, field: Field): Presented =>
  Option.match(S.decodeUnknownOption(aloneOf(name, field))({}), {
    onNone: (): Presented => ({ presence: 'Required' }),
    onSome: (decoded: Readonly<Record<string, unknown>>): Presented =>
      Record.has(decoded, name)
        ? { presence: 'Defaulted', default: decoded[name] }
        : { presence: 'Optional' },
  })

const parameterOfField = (
  name: string,
  field: Field,
  isSubject: boolean,
): Parameter => {
  const kind = Option.getOrElse(annotatedKindOf(field), () =>
    kindOfAst(SchemaAST.toType(field.ast)),
  )
  const what = Option.getOrElse(descriptionOf(field), () =>
    sentenceCaseOf(name),
  )
  return kind._tag === 'Toggle'
    ? { kind, what, presence: 'Defaulted', isSubject, default: false }
    : { kind, what, isSubject, ...presentedOf(name, field) }
}

/**
 * The parameters a record of Effect Schema fields takes, read from the
 * Schemas, so whatever declares its fields says nothing twice. A string
 * is Text, a number a Number, a boolean a Toggle, a set of literal words
 * a OneOf, and anything with parts is Structured; {@link named},
 * {@link place} and {@link link} annotate the rest. `what` is the
 * Schema's `description`, or the field's name in words. Whether a field
 * is required, optional, or has a default is read by decoding nothing:
 * a field that decodes to a value has that default. `subject` names the
 * one field the declaration is about.
 *
 * @example
 * ```typescript
 * parametersOfFields({ count: S.Number, note: S.optionalKey(S.String) })
 * // { count: { kind: { _tag: 'Number' }, what: 'Count', presence: 'Required', isSubject: false },
 * //   note: { kind: { _tag: 'Text' }, what: 'Note', presence: 'Optional', isSubject: false } }
 * ```
 */
export const parametersOfFields = (
  fields: S.Struct.Fields,
  subject?: string,
): Parameters =>
  Record.map(fields, (field, name) =>
    parameterOfField(name, field, name === subject),
  )

// DECLARE

/**
 * Something declared with Effect Schema fields: the plain declaration
 * every Client reads, derived from the fields, and `Given`, the Schema
 * of what its handler takes. The fields are the one source of the type;
 * the declaration is their description.
 */
export type Declared<
  Name extends string = string,
  Fields extends S.Struct.Fields = S.Struct.Fields,
> = Readonly<{
  declaration: Declaration<Name>
  Given: S.Struct<Fields>
}>

/** What a handler of something declared is handed. */
export type GivenOfDeclared<D> =
  D extends Readonly<{ Given: S.Struct<infer Fields> }>
    ? S.Struct<Fields>['Type']
    : never

/** What {@link declare} takes beside the name. */
export type DeclareConfig<Fields extends S.Struct.Fields> = Readonly<{
  aliases?: ReadonlyArray<string>
  what: string
  why: string
  reaches?: ReadonlyArray<Reach>
  fields?: Fields
  subject?: keyof Fields & string
  examples?: ReadonlyArray<
    Readonly<{ given: Partial<S.Struct<Fields>['Type']>; what: string }>
  >
}>

/**
 * Declares one thing a host does itself, with its parameters as Effect
 * Schema fields. `what` says what it does and `why` says why the user
 * would want that, in the third person and never in a Client's words.
 * A host holds no Model, so it touches no state; `reaches` says what it
 * reaches instead, such as a sign-in. A Program's Actions are declared
 * with `Catalog.action`, which gives the same two things.
 *
 * @example
 * ```typescript
 * const SignIn = Declaration.declare('SignIn', {
 *   what: 'Signs the user in to the library',
 *   why: 'A request was refused because the sign-in ran out',
 *   reaches: [{ entity: 'sign-in', access: 'Writes', isOutside: true }],
 * })
 * SignIn.declaration.touches // { state: [], reaches: [{ entity: 'sign-in', … }] }
 * ```
 */
export const declare = <
  const Name extends string,
  Fields extends S.Struct.Fields = {},
>(
  name: Name,
  config: DeclareConfig<Fields>,
): Declared<Name, Fields> => {
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  const fields = config.fields ?? ({} as Fields)
  return {
    declaration: make(name, {
      ...(config.aliases === undefined ? {} : { aliases: config.aliases }),
      what: config.what,
      why: config.why,
      touches: { state: [], reaches: config.reaches ?? [] },
      parameters: parametersOfFields(fields, config.subject),
      examples: config.examples ?? [],
    }),
    Given: S.Struct(fields),
  }
}

// PARSE

const expectedPattern = /^Expected (.*), got (.*)$/u

const refinedSentenceOf = (spelled: string, message: string): string => {
  const [firstLine = ''] = message.split('\n')
  const matched = expectedPattern.exec(firstLine)
  return matched === null
    ? `${spelled}: ${firstLine}.`
    : `${spelled} must be ${matched[1] ?? ''}; got ${matched[2] ?? ''}.`
}

const refinementOf = (
  fields: S.Struct.Fields,
  given: Readonly<Record<string, unknown>>,
  spelling: Spelling,
): Option.Option<Readonly<{ parameter: string; sentence: string }>> =>
  Array.findFirst(Record.toEntries(fields), ([name, field]) => {
    if (given[name] === undefined) {
      return Option.none()
    }
    const checked = S.decodeUnknownResult(S.toType(aloneOf(name, field)))(
      Record.singleton(name, given[name]),
    )
    return Result.isFailure(checked)
      ? Option.some({
          parameter: name,
          sentence: refinedSentenceOf(
            spelling.parameter(name),
            checked.failure.message,
          ),
        })
      : Option.none()
  })

/**
 * Reads what any Client collected for something declared: the typed
 * value its handler takes, or one sentence about the first thing that
 * was wrong. It is {@link parse}, then the fields' own Schema, so a
 * number that must be whole, or a text that must match, is refused in
 * the same kind of sentence.
 *
 * @example
 * ```typescript
 * parseDeclared(Words, { before: '2' }) // { _tag: 'Given', given: { before: 2 } }
 * parseDeclared(Words, { before: '-1' })
 * // { _tag: 'Refused', parameter: 'before', sentence: 'before must be a value greater than or equal to 0; got -1.' }
 * ```
 */
export const parseDeclared = <
  Name extends string,
  Fields extends S.Struct.Fields,
>(
  declared: Declared<Name, Fields>,
  said: Readonly<Record<string, unknown>>,
  spelling: Spelling = declaredSpelling(declared.declaration),
): Parsed<S.Struct<Fields>['Type']> => {
  const parsed = parse(declared.declaration, said, spelling)
  if (parsed._tag === 'Refused') {
    return parsed
  }
  const given: Readonly<Record<string, unknown>> = parsed.given
  return Option.match(refinementOf(declared.Given.fields, given, spelling), {
    onNone: (): Parsed<S.Struct<Fields>['Type']> => ({
      _tag: 'Given',
      /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
      given: given as S.Struct<Fields>['Type'],
    }),
    onSome: refined => ({ _tag: 'Refused', ...refined }),
  })
}
