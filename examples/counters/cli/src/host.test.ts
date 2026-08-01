import { destinationForModel } from 'counters-core-example'
import { Array, Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { executeCounters, formatDestination } from './host.js'

describe('Multiple Counters CLI host', () => {
  it('boots the default carrier through exactly one journaled Program Message', async () => {
    const execution = await Effect.runPromise(executeCounters([]))

    expect(execution.initialModel.navigation._tag).toBe('CounterList')
    expect(execution.messages).toHaveLength(1)
    const maybeMessage = Array.head(execution.messages)
    expect(Option.isSome(maybeMessage)).toBe(true)
    if (Option.isNone(maybeMessage)) {
      throw new Error('Expected one default navigation Message')
    }
    expect(maybeMessage.value).toMatchObject({
      _tag: 'OpenedNavigation',
      opening: { _tag: 'CounterListOpening' },
    })
    expect(execution.journal.transitions).toHaveLength(1)
    expect(execution.journal.transitions).toMatchObject([
      { message: maybeMessage.value },
    ])
    expect(execution.replayTape.transitions).toHaveLength(1)
    expect(execution.replayTape.transitions).toMatchObject([
      { message: maybeMessage.value },
    ])
  })

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
      executeCounters([], Option.some('/counters/counter-1/delete')),
    )

    expect(execution.initialModel.navigation._tag).toBe('CounterList')
    expect(execution.messages).toHaveLength(1)
    expect(Option.getOrUndefined(Array.head(execution.messages))?._tag).toBe(
      'OpenedNavigation',
    )
    expect(
      formatDestination(destinationForModel(execution.finalModel)),
    ).toStrictEqual(['Delete counter-1?', 'This cannot be undone.'])
  })

  it('preserves typed strict-carrier failures', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        executeCounters(
          [],
          Option.some('https://counters.test/counters/counter-1'),
        ),
      ),
    )

    expect(error._tag).toBe('NonCanonicalNavigationCarrierUriError')
  })

  it('derives stable identities from each local semantic occurrence', async () => {
    const execution = await Effect.runPromise(
      executeCounters(['add', 'open:counter-cli-action-1']),
    )

    expect(execution.messages).toMatchObject([
      {
        _tag: 'OpenedNavigation',
        opening: { _tag: 'CounterListOpening' },
      },
      {
        _tag: 'ClickedAddCounter',
        counterId: 'counter-cli-action-1',
      },
      {
        _tag: 'SelectedCounter',
        counterId: 'counter-cli-action-1',
        detailPresentationId: 'detail-cli-action-2',
      },
    ])
    expect(
      formatDestination(destinationForModel(execution.finalModel)),
    ).toStrictEqual(['counter-cli-action-1', 'Count: 0'])
  })
})
