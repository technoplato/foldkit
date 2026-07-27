import {
  destinationForModel,
  interactionsForModel,
  pathToNavigation,
} from 'counters-core-example'
import { Array, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { executeCounters, formatDestination } from './host.js'

describe('Multiple Counters CLI host', () => {
  it('routes a child Message to the selected counter identity', async () => {
    const execution = await Effect.runPromise(
      executeCounters([
        'increment:counter-2',
        'open:counter-2',
        'increment:counter-2',
      ]),
    )

    expect(
      formatDestination(destinationForModel(execution.finalModel)),
    ).toStrictEqual(['counter-2', 'Count: 2'])
  })

  it('exposes only fact dismissal while the fact alert is presented', async () => {
    const execution = await Effect.runPromise(
      executeCounters(['open:counter-1', 'increment:counter-1', 'fact']),
    )

    expect(
      Array.map(
        interactionsForModel(execution.finalModel),
        interaction => interaction.token,
      ),
    ).toStrictEqual(['dismiss'])
    expect(
      formatDestination(destinationForModel(execution.finalModel)),
    ).toStrictEqual([
      'Counter fact for 1',
      '1 is an integer and therefore has no fractional part.',
    ])
  })

  it('deletes only after entering the exclusive confirmation mode', async () => {
    const execution = await Effect.runPromise(
      executeCounters(['open:counter-1', 'delete', 'confirm-delete']),
    )

    expect(
      formatDestination(destinationForModel(execution.finalModel)),
    ).toStrictEqual(['Counters', 'counter-2: 0'])
  })

  it('opens a portable URI before running any requested actions', async () => {
    const execution = await Effect.runPromise(
      executeCounters(
        [],
        Option.some(pathToNavigation('/counters/counter-1/delete')),
      ),
    )

    expect(
      formatDestination(destinationForModel(execution.finalModel)),
    ).toStrictEqual(['Delete counter-1?', 'This cannot be undone.'])
  })
})
