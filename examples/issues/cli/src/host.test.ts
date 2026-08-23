import { Array, Effect, Option, String } from 'effect'
import {
  destinationForModel,
  interactionsForModel,
  pathToNavigation,
} from 'issues-core-example'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { executeIssues, formatDestination, formatModel } from './host.js'

describe('Issue Tracker CLI host', () => {
  it('opens and independently observes one Issue', async () => {
    const execution = await Effect.runPromise(executeIssues(['open:issue-041']))
    expect(
      formatDestination(destinationForModel(execution.finalModel)),
    ).toStrictEqual([
      'issue-041  P2  Open',
      'Application-agnostic logging and issue tracking',
      'Observe filtered collections and selected Issue detail.',
      'Work log',
      'No work log yet.',
      'Linked issues',
      'No linked issues.',
      'Library: Foldkit',
      'https://issues.knophy.com/issues/041',
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
    ).toBe('issue-041  P2  Open')
  })

  it('accepts draft-field tokens on the filing destination', async () => {
    const execution = await Effect.runPromise(
      executeIssues([
        'file',
        'title:Keep transcript aligned',
        'details:The transcript shifted sideways.',
        'priority:P1',
        'product:foldkit',
      ]),
    )
    expect(
      formatDestination(destinationForModel(execution.finalModel)),
    ).toStrictEqual([
      'File issue',
      'Title: Keep transcript aligned',
      'Product: foldkit',
      'Priority: P1',
      'State: EditingIssueDraft',
      'Catalog: LoadedProducts',
    ])
  })

  it('accepts leftover comment, link, and status tokens', async () => {
    const commented = await Effect.runPromise(
      executeIssues(['open:issue-041', 'comment:Painted leftover work log.']),
    )
    const commentedLines = formatDestination(
      destinationForModel(commented.finalModel),
    )
    expect(
      commentedLines.some(line => line.endsWith('Painted leftover work log.')),
    ).toBe(true)
    expect(commented.messages.map(message => message._tag)).toContain(
      'SubmittedIssueComment',
    )

    const linked = await Effect.runPromise(
      executeIssues(['open:issue-041', 'link:240']),
    )
    expect(formatDestination(destinationForModel(linked.finalModel))).toContain(
      '240',
    )
    expect(linked.messages.map(message => message._tag)).toContain(
      'LinkedCatalogIssue',
    )

    const blocked = await Effect.runPromise(
      executeIssues(['open:issue-041', 'status:Blocked']),
    )
    expect(formatDestination(destinationForModel(blocked.finalModel))[0]).toBe(
      'issue-041  P2  Blocked',
    )
    expect(blocked.messages.map(message => message._tag)).toContain(
      'ClickedLeftoverStatus',
    )
  })

  it('declares leftover comment, link, and status subcommands', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'entry.ts'),
      'utf8',
    )
    expect(source).toContain("Command.make(\n  'comment'")
    expect(source).toContain("Command.make(\n  'link'")
    expect(source).toContain("Command.make(\n  'status'")
    expect(source).toContain("Command.make(\n  'log'")
    expect(source).toContain('`log:${summary}`')
  })

  it('paints the Program screen with paintCli(issuesScreen)', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'host.ts'),
      'utf8',
    )
    expect(source).toContain('paintCli')
    expect(source).toContain('issuesScreen')
    expect(source).toContain('paintCli(issuesScreen')
  })

  it('accepts a log token on IssueDetail and prints Work log outside details', async () => {
    const execution = await Effect.runPromise(
      executeIssues(['open:issue-041', 'log:Painted leftover work log.']),
    )
    expect(execution.messages.map(message => message._tag)).toContain(
      'AppendedIssueWorkLog',
    )
    const lines = formatDestination(destinationForModel(execution.finalModel))
    expect(lines).toContain('Work log')
    expect(
      lines.some(line => line.endsWith('Painted leftover work log.')),
    ).toBe(true)
  })

  it('filters the leftover board to one catalog product', async () => {
    const execution = await Effect.runPromise(
      executeIssues(['product:foldkit']),
    )
    const lines = formatModel(execution.finalModel)
    expect(lines).toContain('Product filter')
    expect(lines).toContain('Foldkit (selected)')
    expect(lines).toContain('Scribe')
    expect(lines.join('\n')).toContain('[Foldkit]')
    expect(lines.join('\n')).not.toContain('[Scribe]')
    expect(lines.join('\n')).not.toContain('Scribe transcript card')
  })
})
