import { Array, Option, Schema as S, String as String_, pipe } from 'effect'
import type { Position } from 'unist'

// FRONTMATTER

/**
 * Schema for a document's frontmatter: a struct that decodes the flat string
 * fields into typed values. Use transforming field schemas to decode past
 * strings, for example `S.NumberFromString` for numeric fields.
 */
export type FrontmatterDefinition = S.Struct<S.Struct.Fields> &
  Readonly<{ DecodingServices: never; EncodingServices: never }>

const FRONTMATTER_ENTRY_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/

const sourceLocation = (
  maybePosition: Position | undefined,
  lineOffset: number,
): string => {
  const startLine = maybePosition?.start.line
  if (startLine === undefined) {
    return ''
  } else {
    return ` (line ${startLine + lineOffset})`
  }
}

const isWrappedIn = (value: string, quote: string): boolean =>
  value.length >= 2 && value.startsWith(quote) && value.endsWith(quote)

const unquote = (value: string): string =>
  isWrappedIn(value, '"') || isWrappedIn(value, "'")
    ? value.slice(1, -1)
    : value

/**
 * Parses a frontmatter block's raw text into its string fields. The supported
 * shape is deliberately flat: one `key: value` pair per line, every value a
 * string, with optional surrounding quotes for values that contain special
 * characters. Nesting, lists, and multi-line values all fail with guidance.
 */
export const parseFrontmatterFields = (
  value: string,
  maybePosition: Position | undefined,
): Record<string, string> => {
  const fields: Record<string, string> = {}

  const entryLines = pipe(
    String_.split(value, '\n'),
    Array.map((line, lineIndex) => ({ line, lineIndex })),
    Array.filter(({ line }) => String_.isNonEmpty(line.trim())),
  )

  for (const { line, lineIndex } of entryLines) {
    const location = sourceLocation(maybePosition, lineIndex + 1)
    const [fieldName, rawFieldValue] = Option.match(
      String_.match(FRONTMATTER_ENTRY_PATTERN)(line),
      {
        onNone: (): readonly [string, string] => {
          throw new Error(
            `Invalid frontmatter entry${location}. ` +
              'Frontmatter supports flat `key: value` pairs of strings only. ' +
              'Nesting, lists, and multi-line values are not supported.',
          )
        },
        onSome: ([, name = '', fieldValue = '']): readonly [string, string] => [
          name,
          fieldValue,
        ],
      },
    )
    if (fieldName in fields) {
      throw new Error(`Duplicate frontmatter field "${fieldName}"${location}.`)
    }
    fields[fieldName] = unquote(rawFieldValue.trim())
  }

  return fields
}

/**
 * Validates parsed frontmatter fields against the plugin's frontmatter schema.
 * Unknown fields and values outside the schema both fail with an error naming
 * the offender, mirroring how island attributes are validated.
 */
export const validateFrontmatterFields = (
  definition: FrontmatterDefinition,
  fields: Readonly<Record<string, string>>,
  maybePosition: Position | undefined,
): void => {
  const allowedFieldNames = Object.keys(definition.fields)
  const unknownFieldNames = Object.keys(fields).filter(
    fieldName => !allowedFieldNames.includes(fieldName),
  )
  if (Array.isArrayNonEmpty(unknownFieldNames)) {
    const allowedDescription = Array.match(allowedFieldNames, {
      onEmpty: () => 'It takes no fields.',
      onNonEmpty: names => `Allowed fields: ${names.join(', ')}.`,
    })
    throw new Error(
      `Unknown frontmatter field "${Array.headNonEmpty(unknownFieldNames)}"${sourceLocation(maybePosition, 0)}. ` +
        allowedDescription,
    )
  }

  try {
    S.decodeUnknownSync(definition)(fields)
  } catch (error) {
    throw new Error(
      `Invalid frontmatter${sourceLocation(maybePosition, 0)}. ` +
        `${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
