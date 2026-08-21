/// <reference types="node" />
import { Array, Effect, Exit, Option, Schema as S, Tracer } from 'effect'

/** One ended Effect span collected for a CLI invocation. */
export const CliTraceSpan = S.Struct({
  durationMs: S.Number,
  name: S.String,
  notes: S.Array(S.String),
  parentSpanId: S.Option(S.String),
  spanId: S.String,
})

/** One ended Effect span collected for a CLI invocation. */
export type CliTraceSpan = typeof CliTraceSpan.Type

const collected: Array<CliTraceSpan> = []

class CollectingSpan extends Tracer.NativeSpan {
  override end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    super.end(endTime, exit)
    const parentSpanId = Option.flatMap(this.parent, parent =>
      parent._tag === 'Span' ? Option.some(parent.spanId) : Option.none(),
    )
    collected.push(
      CliTraceSpan.make({
        durationMs: Number(endTime - this.startTime) / 1_000_000,
        name: this.name,
        notes: notesFrom(this.attributes),
        parentSpanId,
        spanId: this.spanId,
      }),
    )
  }
}

const notesFrom = (
  attributes: ReadonlyMap<string, unknown>,
): ReadonlyArray<string> => {
  const maybeListening = attributes.get('daemonWasListening')
  if (maybeListening === true) {
    return ['daemon already listening']
  }
  if (maybeListening === false) {
    return ['daemon cold: spawn and Instant Ready']
  }
  const maybeRequest = attributes.get('request')
  if (maybeRequest === 'Read') {
    return ['socket Read']
  }
  if (maybeRequest === 'Run') {
    return ['socket Run']
  }
  return []
}

/** Effect Tracer that keeps NativeSpan timing and records ended spans. */
export const collectingTracer: Tracer.Tracer = Tracer.make({
  span: options => new CollectingSpan(options),
})

/** True when this process should print the Effect span report. */
export const isCliTraceEnabled = (): boolean =>
  process.env['FOLDKIT_CLI_TRACE'] === '1'

const formatMs = (durationMs: number): string =>
  durationMs.toFixed(1).padStart(8)

const printTree = (
  spans: ReadonlyArray<CliTraceSpan>,
  parentSpanId: Option.Option<string>,
  depth: number,
): ReadonlyArray<string> => {
  const children = Array.filter(spans, span =>
    Option.match(span.parentSpanId, {
      onNone: () => Option.isNone(parentSpanId),
      onSome: childParentId =>
        Option.match(parentSpanId, {
          onNone: () => false,
          onSome: expected => childParentId === expected,
        }),
    }),
  )
  return Array.flatMap(children, span => {
    const indent = '  '.repeat(depth)
    const noteText = Array.match(span.notes, {
      onEmpty: () => '',
      onNonEmpty: notes => `  ${notes.join(', ')}`,
    })
    const line = `${indent}${span.name.padEnd(24)}${formatMs(span.durationMs)}ms${noteText}`
    return [line, ...printTree(spans, Option.some(span.spanId), depth + 1)]
  })
}

const leftoverMs = (
  parent: CliTraceSpan,
  spans: ReadonlyArray<CliTraceSpan>,
): number => {
  const children = Array.filter(spans, span =>
    Option.match(span.parentSpanId, {
      onNone: () => false,
      onSome: parentId => parentId === parent.spanId,
    }),
  )
  const childTotal = Array.reduce(
    children,
    0,
    (total, child) => total + child.durationMs,
  )
  return Math.max(0, parent.durationMs - childTotal)
}

/** Prints the collected Effect spans plus process.uptime wall time. */
export const printCliTrace = (runtime: NodeJS.Process): void => {
  const totalMs = runtime.uptime() * 1_000
  const maybeRoot = Array.findFirst(
    collected,
    span => span.name === 'counter.invoke',
  )
  const beforeEffectMs = Option.match(maybeRoot, {
    onNone: () => totalMs,
    onSome: root => Math.max(0, totalMs - root.durationMs),
  })
  const parseMs = Option.match(maybeRoot, {
    onNone: () => 0,
    onSome: root => leftoverMs(root, collected),
  })
  const lines = [
    'TRACE FOLDKIT_CLI_TRACE',
    `total                     ${formatMs(totalMs)}ms  process.uptime`,
    `process.start              ${formatMs(beforeEffectMs)}ms  node boot + ESM import`,
    `cli.parse                  ${formatMs(parseMs)}ms  Effect CLI argv (leftover under counter.invoke)`,
    ...printTree(collected, Option.none(), 0),
  ]
  runtime.stderr.write(`${lines.join('\n')}\n`)
}

/** Installs the collecting Tracer and prints spans after the CLI exits. */
export const withCliTrace = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  if (!isCliTraceEnabled()) {
    return effect
  }
  return effect.pipe(
    Effect.ensuring(Effect.sync(() => printCliTrace(process))),
    Effect.withTracer(collectingTracer),
  )
}
