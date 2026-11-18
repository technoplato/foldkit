import {
  Array,
  Equal,
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
  make,
  wordsOf,
} from './declaration.js'
import { type ModelPath, segmentsOf } from './modelPath.js'
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
  triggers?: ReadonlyArray<Readonly<{ name: string }>>
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
 * A host holds no Model, so it mutates no state; `triggers` names the
 * side effects it runs, each by its own definition, such as a sign-in.
 * A Program's Actions are declared with `Catalog.action`, which gives
 * the same two things.
 *
 * @example
 * ```typescript
 * const SignIn = Declaration.declare('SignIn', {
 *   what: 'Signs the user in to the library',
 *   why: 'A request was refused because the sign-in ran out',
 *   triggers: [OpenSignInPage],
 * })
 * SignIn.declaration.touches // { mutates: [], triggers: ['OpenSignInPage'] }
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
      touches: {
        mutates: [],
        triggers: Array.map(config.triggers ?? [], triggered => triggered.name),
      },
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

// STATE

const whyKey = 'foldkitWhy'

/**
 * Annotations that say what a field of the Model is and why the user
 * cares, the way an Action says its own. State that says both is state
 * a Client may list and show.
 *
 * @example
 * ```typescript
 * const Model = S.Struct({
 *   count: S.Number.annotate(described({ what: 'The count', why: 'It is what the user is counting' })),
 * })
 * ```
 */
export const described = (
  said: Readonly<{ what: string; why: string }>,
): Readonly<Record<string, string>> => ({
  description: said.what,
  [whyKey]: said.why,
})

/** One part of a Model a Client may list and show: where, what, and why. */
export type Observable = Readonly<{
  path: ReadonlyArray<string>
  what: string
  why: string
}>

const observablesUnder = (
  ast: SchemaAST.AST,
  parents: ReadonlyArray<string>,
): ReadonlyArray<Observable> =>
  SchemaAST.isObjects(ast)
    ? Array.flatMap(ast.propertySignatures, signature => {
        const path = [...parents, globalThis.String(signature.name)]
        const what = SchemaAST.resolveAt<unknown>('description')(signature.type)
        const why = SchemaAST.resolveAt<unknown>(whyKey)(signature.type)
        return [
          ...(Predicate.isString(what) && Predicate.isString(why)
            ? [{ path, what, why }]
            : []),
          ...observablesUnder(signature.type, path),
        ]
      })
    : []

/**
 * The state a Model says what and why for, each by its path, in the
 * Model's own order. It is read from the Model's Schema, so there is no
 * list beside the Model to keep in step. These are the same paths an
 * Action says it mutates.
 *
 * @example
 * ```typescript
 * observablesOf(Model) // [{ path: ['count'], what: 'The count', why: 'It is what the user is counting' }]
 * ```
 */
export const observablesOf = (
  model: Readonly<{ ast: SchemaAST.AST }>,
  computedFields: Readonly<Record<string, Computed<any, unknown>>> = {},
): ReadonlyArray<Observable> => [
  ...observablesUnder(model.ast, []),
  ...Array.map(Record.toEntries(computedFields), ([name, field]) => ({
    path: [name],
    what: field.what,
    why: field.why,
  })),
]

// COMPUTED

/**
 * A value the user cares about that the Model does not store: a pure
 * function of stored state, declared beside the Model's fields with the
 * same `what` and `why`, and `from`, the typed paths it is computed
 * from. The view stays the only place that turns state into display;
 * this only names a value and says where it comes from.
 *
 * @example
 * ```typescript
 * const ahead = computed({
 *   what: 'The count one step on',
 *   why: 'To see where the count is heading',
 *   from: [at.count, at.step],
 *   read: (model: Model) => model.count + model.step,
 * })
 * ```
 */
export type Computed<Model, A> = Readonly<{
  what: string
  why: string
  from: ReadonlyArray<ModelPath<unknown>>
  read: (model: Model) => A
}>

/**
 * Declares a computed field. `observablesOf(Model, { ahead })` lists it
 * with the stored state, and {@link undeclaredSources} holds it to the
 * paths it says it is computed from.
 *
 * @example
 * ```typescript
 * const ahead = computed({ what: '…', why: '…', from: [at.count], read: model => model.count + 1 })
 * ```
 */
export const computed = <Model, A>(
  field: Computed<Model, A>,
): Computed<Model, A> => field

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Predicate.isObject(value) &&
  !globalThis.Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype

const valueAt = (value: unknown, path: ReadonlyArray<string>): unknown =>
  Array.reduce(path, value, (inner, key) =>
    isRecord(inner) ? inner[key] : undefined,
  )

const withValueAt = (
  value: unknown,
  path: ReadonlyArray<string>,
  replacement: unknown,
): unknown =>
  Array.matchLeft(path, {
    onEmpty: () => replacement,
    onNonEmpty: (key, rest) =>
      isRecord(value)
        ? { ...value, [key]: withValueAt(value[key], rest, replacement) }
        : value,
  })

const topLevelDifferences = (
  self: unknown,
  that: unknown,
): ReadonlyArray<string> =>
  isRecord(self) && isRecord(that)
    ? Array.filter(
        Array.dedupe([...Record.keys(self), ...Record.keys(that)]),
        key => !Equal.equals(self[key], that[key]),
      )
    : []

/**
 * What a computed field reads that it did not say, a sentence each;
 * empty when every field is computed only from its `from` paths. For
 * each pair of sample Models it keeps the first Model's values at the
 * `from` paths, takes everything else from the second, and reads: the
 * value must be what the first Model gave, because only other state
 * changed. A Program's test calls this, so `from` is checked, not
 * trusted.
 *
 * @example
 * ```typescript
 * undeclaredSources({ ahead }, [initialModel, laterModel]) // []
 * // when `ahead` reads `step` and says only `count`:
 * // ['ahead changed when only step changed, which it does not say it is computed from.']
 * ```
 */
export const undeclaredSources = <Model>(
  computedFields: Readonly<Record<string, Computed<Model, unknown>>>,
  models: ReadonlyArray<Model>,
): ReadonlyArray<string> =>
  Array.dedupe(
    Array.flatMap(Record.toEntries(computedFields), ([name, field]) =>
      Array.flatMap(models, first =>
        Array.flatMap(models, second => {
          const start: unknown = second
          const folded = Array.reduce(field.from, start, (model, path) =>
            withValueAt(
              model,
              segmentsOf(path),
              valueAt(first, segmentsOf(path)),
            ),
          )
          /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
          const mixed = folded as Model
          return Equal.equals(field.read(mixed), field.read(first))
            ? []
            : [
                `${name} changed when only ${Array.join(topLevelDifferences(first, mixed), ', ')} changed, which it does not say it is computed from.`,
              ]
        }),
      ),
    ),
  )
