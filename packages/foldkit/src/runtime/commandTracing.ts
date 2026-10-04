import { Array, Effect, Option, Tracer } from 'effect'

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
 * args as span attributes. With no tracer installed this is exactly
 * `Effect.withSpan`. With tracers installed, the span also reaches each of
 * them, while the Effect's own nested spans keep going only to the tracer
 * already in context, so an installed tracer sees Command spans and
 * nothing else.
 */
export const traceCommand = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  name: string,
  attributes: Readonly<Record<string, unknown>>,
  installedTracers: ReadonlyArray<Tracer.Tracer>,
): Effect.Effect<A, E, R> => {
  const withCommandSpan = Effect.withSpan(name, { attributes })
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
