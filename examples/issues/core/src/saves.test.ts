import { Array, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  IssueTracker,
} from '@foldkit/instant-tools/issues'

import { findingsOf } from './graphFacts.js'
import { modelForNavigation } from './init.js'
import { IssueIdentity } from './issueIdentity.js'
import {
  ClickedPromoteFinding,
  FailedSaveIssue,
  LinkedCatalogIssue,
  ObservedFindings,
  ObservedIssues,
  ObservedProducts,
  OpenedNavigation,
  SubmittedIssue,
  SubmittedIssueComment,
  SucceededFileIssueDraft,
  SucceededSaveIssue,
  UpdatedIssueTitle,
  UpdatedLeftoverComment,
  UpdatedLeftoverLink,
} from './message.js'
import {
  FailedIssueMutation,
  FileIssue,
  IssueDetail,
  IssueList,
  type Model,
} from './model.js'
import { makeMemoryIssueTracker } from './resources.js'
import { pathToNavigation } from './route.js'
import { update } from './update.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

const storedIssue = (id: string, createdAtMs: number): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs,
    details: 'x',
    id,
    issueType: Option.none(),
    mentions: [],
    priority: 'P2',
    product: scribe,
    projectId: Option.none(),
    reportedDate: Option.none(),
    sourceDocument: Option.none(),
    status: 'Open',
    successCriteria: [],
    title: `Issue ${id}`,
    updatedAtMs: createdAtMs,
    viewerURL: Option.none(),
    workLog: [],
  })

const issues = [
  storedIssue('102', 3_000),
  storedIssue('101', 2_000),
  storedIssue('100', 1_000),
]

const at = (path: string): Model =>
  Array.reduce(
    [
      ObservedIssues.make({ issues }),
      ObservedProducts.make({ products: [{ product: scribe, updatedAtMs: 1 }] }),
    ],
    modelForNavigation(pathToNavigation(path)),
    (model, message) => update(model, message)[0],
  )

const FINDING = '1adc23b2-451d-5dd5-9cf9-3b79405661fe'

const promotedFinding = (): Model => {
  const [findings] = update(
    at('/findings'),
    ObservedFindings.make({
      findings: findingsOf({
        agentFindings: [
          {
            agentID: 'claude-code/x@ld',
            id: FINDING,
            issueNumber: 100,
            kind: 'environment',
            occurredAtMs: 1_000,
            quote: 'The socket went deaf.',
            source: 'agentRunStop',
            status: 'open',
          },
        ],
      }),
    }),
  )
  return update(findings, ClickedPromoteFinding.make({ findingId: FINDING }))[0]
}

const commandNames = (
  commands: ReadonlyArray<Readonly<{ name: string }>>,
): ReadonlyArray<string> => Array.map(commands, command => command.name)

const landed100 = Issue.make({ ...storedIssue('100', 1_000), updatedAtMs: 5_000 })

describe('a save that returns after the page moved', () => {
  it('a comment that lands after he went back to the list leaves him on the list', () => {
    const [saving] = update(
      at('/issues/100'),
      SubmittedIssueComment.make({ issueId: '100', summary: 'hello' }),
    )
    const [onList] = update(
      saving,
      OpenedNavigation.make({ navigation: IssueList.make({}) }),
    )

    const [after, commands] = update(
      onList,
      SucceededSaveIssue.make({ issue: landed100 }),
    )

    expect(after.navigation._tag).toBe('IssueList')
    expect(commandNames(commands)).not.toContain('MarkFindingPromoted')
  })

  it('a comment that lands while he files a finding leaves the draft and the finding alone', () => {
    const promoted = promotedFinding()
    expect(promoted.navigation).toEqual(FileIssue.make({}))

    const [after, commands] = update(
      promoted,
      SucceededSaveIssue.make({ issue: landed100 }),
    )

    expect(after.navigation).toEqual(FileIssue.make({}))
    expect(after.draft.title).toContain('The socket went deaf')
    expect(after.maybeDraftFindingId).toEqual(Option.some(FINDING))
    expect(commandNames(commands)).not.toContain('MarkFindingPromoted')
  })

  it('the filing marks the finding it was promoted from with the Issue it filed, and opens it', () => {
    const [saving, filing] = update(promotedFinding(), SubmittedIssue.make({}))
    expect(commandNames(filing)).toEqual(['FileIssueDraft'])
    const filed = Issue.make({ ...storedIssue('103', 9_000), title: 'Mine' })

    const [after, commands] = update(
      saving,
      SucceededFileIssueDraft.make({
        issue: filed,
        maybeFindingId: Option.some(FINDING),
      }),
    )

    expect(after.navigation).toEqual(IssueDetail.make({ issueId: '103' }))
    const mark = Array.findFirst(
      commands,
      command => command.name === 'MarkFindingPromoted',
    )
    expect(Option.map(mark, command => command.args)).toEqual(
      Option.some({ findingId: FINDING, issueId: '103' }),
    )
  })

  it('a filing that returns after he left the form does not drag him to the new Issue', () => {
    const form = update(
      at('/issues/new'),
      UpdatedIssueTitle.make({ value: 'Mine' }),
    )[0]
    const [saving] = update(form, SubmittedIssue.make({}))
    const [onList] = update(
      saving,
      OpenedNavigation.make({ navigation: IssueList.make({}) }),
    )

    const [after] = update(
      onList,
      SucceededFileIssueDraft.make({
        issue: storedIssue('103', 9_000),
        maybeFindingId: Option.none(),
      }),
    )

    expect(after.navigation._tag).toBe('IssueList')
  })
})

describe('filing once', () => {
  it('a second Submit while the first is saving files nothing more', () => {
    const form = update(
      at('/issues/new'),
      UpdatedIssueTitle.make({ value: 'Mine' }),
    )[0]
    const [first, firstCommands] = update(form, SubmittedIssue.make({}))
    const [second, secondCommands] = update(first, SubmittedIssue.make({}))

    expect(commandNames(firstCommands)).toEqual(['FileIssueDraft'])
    expect(secondCommands).toEqual([])
    expect(second.draftState._tag).toBe('SavingIssueDraft')
  })

  it('two presses of Submit file one Issue', async () => {
    const tracker = await Effect.runPromise(makeMemoryIssueTracker(issues))
    const resources = Layer.mergeAll(
      Layer.succeed(IssueTracker, tracker),
      Layer.succeed(IssueIdentity, {
        author: Effect.succeed('me'),
        next: Effect.succeed({ id: 'x', nowMs: 9_000 }),
      }),
    )
    const form = update(
      at('/issues/new'),
      UpdatedIssueTitle.make({ value: 'Mine' }),
    )[0]
    const [first, firstCommands] = update(form, SubmittedIssue.make({}))
    const [, secondCommands] = update(first, SubmittedIssue.make({}))

    for (const command of [...firstCommands, ...secondCommands]) {
      await Effect.runPromise(
        // oxlint-disable-next-line typescript/consistent-type-assertions
        command.effect.pipe(Effect.provide(resources)) as Effect.Effect<unknown>,
      )
    }

    const all = await Effect.runPromise(
      tracker.fetch({
        limit: 100,
        productId: Option.none(),
        projectId: Option.none(),
        statuses: [],
      }),
    )
    expect(Array.filter(all, issue => issue.title === 'Mine')).toHaveLength(1)
  })
})

describe('the comment and link boxes', () => {
  it('keep a comment in the box while it saves and after its write fails', () => {
    const typed = update(
      at('/issues/100'),
      UpdatedLeftoverComment.make({ value: 'hello' }),
    )[0]
    const [saving] = update(
      typed,
      SubmittedIssueComment.make({ issueId: '100', summary: 'hello' }),
    )
    expect(saving.leftoverComment).toBe('hello')

    const [failed] = update(
      saving,
      FailedSaveIssue.make({ reason: 'Update: Issue 100: offline' }),
    )

    expect(failed.leftoverComment).toBe('hello')
  })

  it('keep a link in the box while it saves and after its write fails', () => {
    const typed = update(
      at('/issues/100'),
      UpdatedLeftoverLink.make({ value: '101' }),
    )[0]
    const [saving] = update(
      typed,
      LinkedCatalogIssue.make({ sourceIssueId: '100', targetIssueId: '101' }),
    )
    expect(saving.leftoverLink).toBe('101')

    const [failed] = update(
      saving,
      FailedSaveIssue.make({ reason: 'Update: Issue 100: offline' }),
    )

    expect(failed.leftoverLink).toBe('101')
  })
})

describe('linking a related Issue', () => {
  const linking = (target: string) =>
    update(
      at('/issues/100'),
      LinkedCatalogIssue.make({ sourceIssueId: '100', targetIssueId: target }),
    )

  it('links a number the catalog holds, in any spelling', () => {
    const [, commands] = linking('#101')
    expect(
      Array.map(commands, command => [command.name, command.args]),
    ).toEqual([
      ['LinkCatalogIssue', { sourceIssueId: '100', targetIssueId: '101' }],
    ])
  })

  it('writes nothing and says why for words or for itself', () => {
    for (const [target, reason] of [
      ['hello', '“hello” is not an Issue number.'],
      ['#100', 'An Issue does not link to itself.'],
    ] as const) {
      const [after, commands] = linking(target)
      expect(commands).toEqual([])
      expect(after.issueMutation).toEqual(
        FailedIssueMutation.make({ reason }),
      )
    }
  })
})

