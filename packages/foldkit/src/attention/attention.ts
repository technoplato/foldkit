import { Function, Schema as S } from 'effect'

import { ts } from '../schema/index.js'

/** The player is walking. No overlay owns input. */
export type Roaming = Readonly<{ _tag: 'Roaming' }>

/** The player is reading a sign. Walking is closed. */
export type Reading<Subject> = Readonly<{
  _tag: 'Reading'
  subject: Subject
}>

/** The player is operating a tool. Walking is closed. */
export type Operating<Tool> = Readonly<{
  _tag: 'Operating'
  tool: Tool
}>

/** Exclusive player attention: roaming, reading one subject, or operating one tool. */
export type Attention<Subject, Tool> =
  | Roaming
  | Reading<Subject>
  | Operating<Tool>

/** Constructs the roaming attention. A parameter-free callable Schema. */
export const Roaming = ts('Roaming')

/** Constructs a reading attention that holds one subject. */
export const Reading = <Subject>(
  payload: Readonly<{ subject: Subject }>,
): Attention<Subject, never> => ({
  _tag: 'Reading',
  subject: payload.subject,
})

/** Constructs an operating attention that holds one tool. */
export const Operating = <Tool>(
  payload: Readonly<{ tool: Tool }>,
): Attention<never, Tool> => ({
  _tag: 'Operating',
  tool: payload.tool,
})

/** Encoded form of `Attention<Subject, Tool>`. */
export type AttentionEncoded<SubjectEncoded, ToolEncoded> =
  | Readonly<{ _tag: 'Roaming' }>
  | Readonly<{ _tag: 'Reading'; subject: SubjectEncoded }>
  | Readonly<{ _tag: 'Operating'; tool: ToolEncoded }>

/** Schema factory result for one subject and one tool codec. */
export type AttentionSchema<Subject, SubjectEncoded, Tool, ToolEncoded> =
  Readonly<{
    schema: S.Codec<
      Attention<Subject, Tool>,
      AttentionEncoded<SubjectEncoded, ToolEncoded>
    >
    Roaming: typeof Roaming
    Reading: (
      payload: Readonly<{ subject: Subject }>,
    ) => Attention<Subject, Tool>
    Operating: (
      payload: Readonly<{ tool: Tool }>,
    ) => Attention<Subject, Tool>
  }>

/** Builds the three-state Attention Schema for the given subject and tool. */
export const Schema = <Subject, SubjectEncoded, Tool, ToolEncoded>(
  subjectSchema: S.Codec<Subject, SubjectEncoded>,
  toolSchema: S.Codec<Tool, ToolEncoded>,
): AttentionSchema<Subject, SubjectEncoded, Tool, ToolEncoded> => {
  const ReadingSchema = ts('Reading', { subject: subjectSchema })
  const OperatingSchema = ts('Operating', { tool: toolSchema })
  const schema = S.Union([Roaming, ReadingSchema, OperatingSchema])
  return {
    schema,
    Roaming,
    Reading: ReadingSchema,
    Operating: OperatingSchema,
  }
}

/** True when attention is roaming. */
export const isRoaming = <Subject, Tool>(
  attention: Attention<Subject, Tool>,
): attention is Roaming => attention._tag === 'Roaming'

/** True when attention is reading. */
export const isReading = <Subject, Tool>(
  attention: Attention<Subject, Tool>,
): attention is Reading<Subject> => attention._tag === 'Reading'

/** True when attention is operating a tool. */
export const isOperating = <Subject, Tool>(
  attention: Attention<Subject, Tool>,
): attention is Operating<Tool> => attention._tag === 'Operating'

/** Exhaustive match on exclusive attention. */
export const match: {
  <Subject, Tool, A, B = A, C = A>(
    handlers: Readonly<{
      onRoaming: Function.LazyArg<A>
      onReading: (subject: Subject) => B
      onOperating: (tool: Tool) => C
    }>,
  ): (attention: Attention<Subject, Tool>) => A | B | C
  <Subject, Tool, A, B = A, C = A>(
    attention: Attention<Subject, Tool>,
    handlers: Readonly<{
      onRoaming: Function.LazyArg<A>
      onReading: (subject: Subject) => B
      onOperating: (tool: Tool) => C
    }>,
  ): A | B | C
} = ((
  attentionOrHandlers:
    | Attention<unknown, unknown>
    | Readonly<{
        onRoaming: Function.LazyArg<unknown>
        onReading: (subject: unknown) => unknown
        onOperating: (tool: unknown) => unknown
      }>,
  maybeHandlers?: Readonly<{
    onRoaming: Function.LazyArg<unknown>
    onReading: (subject: unknown) => unknown
    onOperating: (tool: unknown) => unknown
  }>,
) => {
  if (maybeHandlers === undefined) {
    const handlers = attentionOrHandlers as Readonly<{
      onRoaming: Function.LazyArg<unknown>
      onReading: (subject: unknown) => unknown
      onOperating: (tool: unknown) => unknown
    }>
    return (attention: Attention<unknown, unknown>) =>
      match(attention, handlers)
  }
  const attention = attentionOrHandlers as Attention<unknown, unknown>
  const handlers = maybeHandlers
  if (attention._tag === 'Roaming') {
    return handlers.onRoaming()
  }
  if (attention._tag === 'Reading') {
    return handlers.onReading(attention.subject)
  }
  return handlers.onOperating(attention.tool)
}) as typeof match

/** Leaves reading or operating and returns roaming. Roaming stays roaming. */
export const dismiss = <Subject, Tool>(
  _attention: Attention<Subject, Tool>,
): Roaming => Roaming()

/** True when the value is an Attention tagged union. */
export const isAttention = (
  value: unknown,
): value is Attention<unknown, unknown> => {
  if (typeof value !== 'object' || value === null || !('_tag' in value)) {
    return false
  }
  return (
    value._tag === 'Roaming' ||
    value._tag === 'Reading' ||
    value._tag === 'Operating'
  )
}
