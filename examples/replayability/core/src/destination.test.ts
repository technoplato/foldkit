import * as Counter from 'counter-core-example'
import { Effect } from 'effect'
import * as Fact from 'fact-core-example'
import { Program } from 'foldkit'
import { describe, expect, it } from 'vitest'

import {
  CounterDestination,
  FactDestination,
  defaultReplayDestination,
  parseReplayDestination,
  printReplayDestination,
} from './destination.js'

describe('typed replay destinations', () => {
  it('round trips a real-Message tape through the Program router', async () => {
    const destination = await Effect.runPromise(
      defaultReplayDestination('Counter'),
    )
    const uri = await Effect.runPromise(printReplayDestination(destination))
    const parsed = await Effect.runPromise(parseReplayDestination(uri))

    expect(uri.startsWith('/counter/replay?tape=')).toBe(true)
    expect(uri.endsWith('&frame=0')).toBe(true)
    expect(parsed).toStrictEqual(destination)
    if (destination._tag === 'Counter' && destination.route._tag === 'Replay') {
      expect(
        destination.route.tape.transitions.map(
          transition => transition.message._tag,
        ),
      ).toStrictEqual([
        'ClickedIncrement',
        'ClickedIncrement',
        'ClickedDecrement',
      ])
    }
  })

  it('round trips a portable state without a platform scheme or authority', async () => {
    const destination = CounterDestination.make({
      route: Program.state(Counter.Model.make({ count: 7 })),
    })
    const uri = await Effect.runPromise(printReplayDestination(destination))

    expect(uri).toBe('/counter/state?model=%7B%22count%22%3A7%7D')
    expect(await Effect.runPromise(parseReplayDestination(uri))).toStrictEqual(
      destination,
    )
  })

  it('uses the same portable Fact state route for every client', async () => {
    const destination = FactDestination.make({
      route: Program.state(Fact.initialModel),
    })
    const uri = await Effect.runPromise(printReplayDestination(destination))

    expect(uri).toBe('/fact/state?model=%7B%22_tag%22%3A%22Idle%22%7D')
    expect(await Effect.runPromise(parseReplayDestination(uri))).toStrictEqual(
      destination,
    )
  })
})
