import { Effect } from 'effect'
import { Program } from 'foldkit'
import {
  CounterDestination,
  Workbench,
  defaultReplayDestination,
  printReplayDestination,
} from 'replayability-core-example'
import { describe, expect, it } from 'vitest'

import { executeReplayUri } from './host.js'

describe('replay CLI host', () => {
  it('runs an absolute carrier through the shared typed workbench', async () => {
    const destination = await Effect.runPromise(
      defaultReplayDestination('Counter'),
    )
    if (destination._tag !== 'Counter' || destination.route._tag !== 'Replay') {
      throw new Error('Expected the default Counter replay destination')
    }
    const completedDestination = CounterDestination.make({
      route: Program.replay(
        destination.route.tape,
        destination.route.tape.transitions.length,
      ),
    })
    const relativeRoute = await Effect.runPromise(
      printReplayDestination(completedDestination),
    )
    const model = await Effect.runPromise(
      executeReplayUri(`https://reactdemo.knophy.com${relativeRoute}`),
    )

    expect(Workbench.displayForModel(model)).toBe('1')
    expect(model.currentFrame).toBe(3)
    expect(model.replayUri).toBe(relativeRoute)
  })
})
