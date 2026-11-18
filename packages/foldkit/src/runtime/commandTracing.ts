import { Array, Context, Effect, Option, Tracer } from 'effect'

/**
 * The runtime operation a Command span runs for: the Message a client sent
 * and the Commands it caused, which share `operationId` with every
 * journal transition of that operation. A tracer finds it in the span's
 * annotations, as telemetry does to record a Command on the surface of the
 * client that caused it, such as `terminal-tui` for a `books tui` key.
 */
export class CommandOperation extends Context.Service<
  CommandOperation,
  Readonly<{ operationId: number }>
>()('@foldkit/CommandOperation') {}

const reportTracerDefect = (error: unknown): void => {
  console.error('[foldkit] An installed Command tracer threw:', error)
}

const callEach = <A>(
  values: ReadonlyArray<A>,
  call: (value: A) => void,
): void => {
  Array.forEach(values, value => {
    try {
      call(value)
    } catch (error) {
      reportTracerDefect(error)
    }
  })
}

const fanOutSpan = (
  primary: Tracer.Span,
  others: ReadonlyArray<Tracer.Span>,
): Tracer.Span => ({
  _tag: 'Span',
  name: primary.name,
  spanId: primary.spanId,
  traceId: primary.traceId,
  parent: primary.parent,
  annotations: primary.annotations,
  sampled: primary.sampled,
  kind: primary.kind,
  get status() {
    return primary.status
  },
  get attributes() {
    return primary.attributes
  },
  get links() {
    return primary.links
  },
  end: (endTime, exit) => {
    primary.end(endTime, exit)
    callEach(others, span => span.end(endTime, exit))
  },
  attribute: (key, value) => {
    primary.attribute(key, value)
    callEach(others, span => span.attribute(key, value))
  },
  event: (name, startTime, attributes) => {
    primary.event(name, startTime, attributes)
    callEach(others, span => span.event(name, startTime, attributes))
  },
  addLinks: links => {
    primary.addLinks(links)
    callEach(others, span => span.addLinks(links))
  },
})

const spanOf = (
  tracer: Tracer.Tracer,
  options: Parameters<Tracer.Tracer['span']>[0],
): Option.Option<Tracer.Span> => {
  try {
    return Option.some(tracer.span(options))
  } catch (error) {
    reportTracerDefect(error)
    return Option.none()
  }
}

const fanOutTracer = (
  primary: Tracer.Tracer,
  others: ReadonlyArray<Tracer.Tracer>,
): Tracer.Tracer =>
  Tracer.make({
    span: options => {
      const primarySpan = primary.span(options)
      const otherSpans = Array.getSomes(
        Array.map(others, tracer => spanOf(tracer, options)),
      )
      return Array.isReadonlyArrayEmpty(otherSpans)
        ? primarySpan
        : fanOutSpan(primarySpan, otherSpans)
    },
    context: primary.context,
  })

/**
 * Wraps one Command's Effect in its span, named for the Command, with its
 * args as span attributes and, when it runs for an operation, a
 * {@link CommandOperation} in the span's annotations. With no tracer
 * installed this is exactly `Effect.withSpan`. With tracers installed, the
 * span also reaches each of them, while the Effect's own nested spans keep
 * going only to the tracer already in context, so an installed tracer sees
 * Command spans and nothing else.
 */
export const traceCommand = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  name: string,
  attributes: Readonly<Record<string, unknown>>,
  installedTracers: ReadonlyArray<Tracer.Tracer>,
  maybeOperationId: Option.Option<number> = Option.none(),
): Effect.Effect<A, E, R> => {
  const withCommandSpan = Effect.withSpan(name, {
    attributes,
    ...Option.match(maybeOperationId, {
      onNone: () => ({}),
      onSome: operationId => ({
        annotations: Context.make(CommandOperation, { operationId }),
      }),
    }),
  })
  if (Array.isReadonlyArrayEmpty(installedTracers)) {
    return withCommandSpan(effect)
  }
  return Effect.flatMap(Effect.tracer, currentTracer =>
    effect.pipe(
      Effect.withTracer(currentTracer),
      withCommandSpan,
      Effect.withTracer(fanOutTracer(currentTracer, installedTracers)),
    ),
  )
}
