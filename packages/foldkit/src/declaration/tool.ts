import {
  type Declaration,
  type Node,
  type Touches,
  changesSomething,
  pathsOf,
  wordsOf,
} from './declaration.js'
import type { Kind, Parameter } from './parameter.js'

// TOOL

/** One parameter as JSON Schema says it. */
export type ToolProperty = Readonly<{
  type?: 'string' | 'number' | 'boolean'
  enum?: ReadonlyArray<string>
  description: string
  default?: string | number
}>

/**
 * What a call touches, in the words agent protocols use: `readOnlyHint`
 * is true when nothing changes, and `openWorldHint` when the call
 * reaches past the Program or costs something.
 */
export type ToolAnnotations = Readonly<{
  readOnlyHint: boolean
  openWorldHint: boolean
}>

/**
 * A declaration as an agent reads a tool: a name, what it is for and
 * why it would be called, the parameters as JSON Schema, and what a call
 * touches, once that has been derived. It is the shape the Model Context
 * Protocol lists tools in, so a server for a Program is this list and a
 * transport.
 *
 * @example
 * ```typescript
 * const tool: Tool = {
 *   name: 'follow',
 *   title: 'Follow',
 *   description: 'Prints a topic each time it changes. To read along somewhere else.',
 *   inputSchema: { type: 'object', properties: { topic: { type: 'string', enum: ['words', 'screen'], description: 'What to follow' } }, required: [], additionalProperties: false },
 *   annotations: { readOnlyHint: true, openWorldHint: false },
 * }
 * ```
 */
export type Tool = Readonly<{
  name: string
  title: string
  description: string
  inputSchema: Readonly<{
    type: 'object'
    properties: Readonly<Record<string, ToolProperty>>
    required: ReadonlyArray<string>
    additionalProperties: false
  }>
  annotations?: ToolAnnotations
}>

const sentenceOf = (text: string): string => {
  const trimmed = text.trim()
  return /[.!?…]$/u.test(trimmed) ? trimmed : `${trimmed}.`
}

const typeOf = (kind: Kind): Pick<ToolProperty, 'type' | 'enum'> => {
  if (kind._tag === 'Number') {
    return { type: 'number' }
  } else if (kind._tag === 'Toggle') {
    return { type: 'boolean' }
  } else if (kind._tag === 'OneOf') {
    return { type: 'string', enum: kind.options }
  } else if (kind._tag === 'Structured') {
    return {}
  } else {
    return { type: 'string' }
  }
}

const descriptionOf = (parameter: Parameter): string => {
  if (parameter.kind._tag === 'Named') {
    return `${sentenceOf(parameter.what)} Give the ${parameter.kind.noun} by its name or part of it.`
  } else if (parameter.kind._tag === 'Place') {
    return `${sentenceOf(parameter.what)} A place in time.`
  } else if (parameter.kind._tag === 'Link') {
    return `${sentenceOf(parameter.what)} A link.`
  } else {
    return parameter.what
  }
}

const defaultOf = (parameter: Parameter): Pick<ToolProperty, 'default'> => {
  const value: unknown = parameter.default
  return parameter.kind._tag !== 'Toggle' &&
    (typeof value === 'string' || typeof value === 'number')
    ? { default: value }
    : {}
}

const propertyOf = (parameter: Parameter): ToolProperty => ({
  ...typeOf(parameter.kind),
  description: descriptionOf(parameter),
  ...defaultOf(parameter),
})

const annotationsOf = (touches: Touches): ToolAnnotations => ({
  readOnlyHint: !changesSomething(touches),
  openWorldHint: touches.reaches.some(reach => reach.isOutside),
})

const titleOf = (path: ReadonlyArray<string>): string => {
  const words = path.flatMap(wordsOf).join(' ')
  return words.slice(0, 1).toUpperCase() + words.slice(1)
}

/**
 * One declaration as a tool an agent may call, named by its whole path:
 * `Menu` then `Type` is `menu_type`. The description is the `what` and
 * the `why`, so the agent knows when to reach for it.
 *
 * @example
 * ```typescript
 * toolOf(['Follow'], Follow).name // 'follow'
 * toolOf(['Follow'], Follow).annotations // { readOnlyHint: true, openWorldHint: false }
 * ```
 */
export const toolOf = (
  path: ReadonlyArray<string>,
  declaration: Declaration<string, any>,
): Tool => {
  const whole: Declaration = declaration
  return {
    name: path.flatMap(wordsOf).join('_'),
    title: titleOf(path),
    description: `${sentenceOf(whole.what)} ${sentenceOf(whole.why)}`,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(whole.parameters).map(([name, parameter]) => [
          name,
          propertyOf(parameter),
        ]),
      ),
      required: Object.entries(whole.parameters)
        .filter(([, parameter]) => parameter.presence === 'Required')
        .map(([name]) => name),
      additionalProperties: false,
    },
    ...(whole.touches === undefined
      ? {}
      : { annotations: annotationsOf(whole.touches) }),
  }
}

/**
 * Every declaration of a tree as a tool, in order: what an agent reads
 * to know what it may call and why.
 *
 * @example
 * ```typescript
 * toolsOf([Listen, Account]).map(tool => tool.name) // ['listen', 'account_sign_in']
 * ```
 */
export const toolsOf = (nodes: ReadonlyArray<Node>): ReadonlyArray<Tool> =>
  pathsOf(nodes).map(({ path, declaration }) => toolOf(path, declaration))
