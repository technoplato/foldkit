import { Effect, Option, Schema as S, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ParseError,
  here,
  int,
  literal,
  param,
  query,
  rest,
  root,
  schemaSegment,
  shapeOf,
  slash,
  string,
} from './parser.js'

const TitleSlug = S.String.check(
  S.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
).pipe(S.brand('TitleSlug'))

const segmentsOf = (parser: Parameters<typeof shapeOf>[0]) =>
  Option.map(shapeOf(parser), shape =>
    shape.segments.map(segment =>
      segment._tag === 'Literal'
        ? segment.segment
        : `${segment._tag}:${segment.name}`,
    ),
  )

describe('the shape a route says of itself', () => {
  it('says its exact words', () => {
    expect(segmentsOf(literal('listen'))).toEqual(Option.some(['listen']))
  })

  it('says each value it reads by the name of the field it fills', () => {
    expect(segmentsOf(string('slug'))).toEqual(Option.some(['Param:slug']))
    expect(segmentsOf(int('page'))).toEqual(Option.some(['Param:page']))
    expect(segmentsOf(schemaSegment('slug', TitleSlug))).toEqual(
      Option.some(['Param:slug']),
    )
  })

  it('keeps the Schema of a value read through one, so a sample of it can be made', () => {
    const shape = Option.getOrThrow(shapeOf(schemaSegment('slug', TitleSlug)))
    const segment = shape.segments[0]
    expect(segment?._tag === 'Param' && segment.kind).toBe('Schema')
    expect(segment?._tag === 'Param' && segment.maybeSchema !== undefined).toBe(
      true,
    )
    const whole = Option.getOrThrow(shapeOf(string('slug'))).segments[0]
    expect(whole?._tag === 'Param' && whole.kind).toBe('String')
    const count = Option.getOrThrow(shapeOf(int('page'))).segments[0]
    expect(count?._tag === 'Param' && count.kind).toBe('Int')
  })

  it('is empty for the place a stack is already at', () => {
    expect(segmentsOf(here)).toEqual(Option.some([]))
    expect(segmentsOf(root)).toEqual(Option.some([]))
  })

  it('says everything after it by one name', () => {
    expect(segmentsOf(rest('path'))).toEqual(Option.some(['Rest:path']))
  })

  it('composes in the order the address is written', () => {
    expect(
      segmentsOf(
        pipe(literal('bookmarks'), slash(schemaSegment('slug', TitleSlug))),
      ),
    ).toEqual(Option.some(['bookmarks', 'Param:slug']))
  })

  it('keeps its path and names its query keys when it reads a query', () => {
    const searched = pipe(
      literal('search'),
      query(S.Struct({ q: S.String, page: S.optional(S.String) })),
    )
    expect(segmentsOf(searched)).toEqual(Option.some(['search']))
    expect(Option.getOrThrow(shapeOf(searched)).queryKeys).toEqual([
      'q',
      'page',
    ])
  })

  it('names a hand-made value by its label', () => {
    const handMade = param(
      'place',
      segment =>
        segment === ''
          ? Effect.fail(new ParseError({ message: 'empty' }))
          : Effect.succeed({ place: segment }),
      value => value.place,
    )
    expect(segmentsOf(handMade)).toEqual(Option.some(['Param:place']))
    const segment = Option.getOrThrow(shapeOf(handMade)).segments[0]
    expect(segment?._tag === 'Param' && segment.kind).toBe('Custom')
  })

  it('has none for a parser written without the combinators', () => {
    expect(
      shapeOf({
        parse: segments => Effect.succeed([{}, segments]),
        print: (_value, state) => Effect.succeed(state),
      }),
    ).toEqual(Option.none())
  })
})
