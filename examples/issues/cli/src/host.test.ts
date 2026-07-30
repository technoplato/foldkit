import { Array, Effect, Option } from 'effect'
import {
  destinationForModel,
  interactionsForModel,
  pathToNavigation,
} from 'issues-core-example'
import { describe, expect, it } from 'vitest'

import { executeIssues, formatDestination } from './host.js'

describe('Issue Tracker CLI host', () => {
  it('opens and independently observes one Issue', async () => {
    const execution = await Effect.runPromise(executeIssues(['open:issue-041']))
    expect(
      formatDestination(destinationForModel(execution.finalModel)),
    ).toStrictEqual([
      'issue-041  P2  InProgress',
      'Application-agnostic logging and issue tracking',
      'Observe filtered collections and selected Issue detail.',
      'Library: Foldkit',
    ])
  })

  it('exposes only state-valid interaction tokens', async () => {
    const execution = await Effect.runPromise(executeIssues(['triage']))
    expect(
      Array.map(
        interactionsForModel(execution.finalModel),
        interaction => interaction.token,
      ),
    ).toStrictEqual(['back'])
  })

  it('opens a portable detail URI before actions run', async () => {
    const execution = await Effect.runPromise(
      executeIssues([], Option.some(pathToNavigation('/issues/issue-041'))),
    )
    expect(
      formatDestination(destinationForModel(execution.finalModel))[0],
    ).toBe('issue-041  P2  InProgress')
  })
})
