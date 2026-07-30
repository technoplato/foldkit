import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  ApplicationProduct,
  Issue,
  ProductCatalogEntry,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import {
  ClickedFileIssue,
  ObservedIssue,
  ObservedProducts,
  SelectedIssue,
  SubmittedIssue,
  UpdatedIssueTitle,
} from './message.js'
import {
  FileIssue,
  IssueDetail,
  IssueList,
  LoadingIssue,
  TriageInbox,
} from './model.js'
import { destinationForModel } from './presentation.js'
import { navigationToPath, pathToNavigation } from './route.js'
import { update } from './update.js'

const product = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })
const productEntry = ProductCatalogEntry.make({
  product,
  updatedAtMs: 1_000,
})
const issue = Issue.make({
  attachments: [],
  createdAtMs: 1_000,
  details: 'The transcript shifted sideways.',
  id: 'issue-021',
  mentions: [],
  priority: 'P1',
  product,
  projectId: Option.none(),
  sourceDocument: Option.none(),
  status: 'Open',
  successCriteria: [],
  title: 'Keep transcript aligned',
  updatedAtMs: 1_000,
  workLog: [],
})

describe('Issue Tracker Program', () => {
  it.each([
    IssueList.make({}),
    IssueDetail.make({ issueId: 'issue-021' }),
    FileIssue.make({}),
    TriageInbox.make({}),
  ])('round trips each navigation path', navigation => {
    const path = navigationToPath(navigation)
    expect(pathToNavigation(path)).toEqual(navigation)
    expect(navigationToPath(pathToNavigation(path))).toBe(path)
  })

  it('models list, detail, and independent detail observation as state', () => {
    const initial = modelForNavigation(IssueList.make({}))
    const [selected] = update(
      initial,
      SelectedIssue.make({ issueId: issue.id }),
    )
    expect(selected.navigation).toEqual(IssueDetail.make({ issueId: issue.id }))
    expect(selected.issueDetail).toEqual(
      LoadingIssue.make({ issueId: issue.id }),
    )

    const [observed] = update(
      selected,
      ObservedIssue.make({ issue: Option.some(issue), issueId: issue.id }),
    )
    expect(destinationForModel(observed)).toMatchObject({
      _tag: 'IssueDetailDestination',
      state: {
        _tag: 'LoadedIssue',
        issue: Option.some(issue),
      },
    })

    const [ignored] = update(
      observed,
      ObservedIssue.make({
        issue: Option.none(),
        issueId: 'different-issue',
      }),
    )
    expect(ignored).toEqual(observed)
  })

  it('requires a first-class product and title before filing', () => {
    const initial = modelForNavigation(IssueList.make({}))
    const [withProducts] = update(
      initial,
      ObservedProducts.make({ products: [productEntry] }),
    )
    const [filing] = update(withProducts, ClickedFileIssue.make({}))
    const [invalid, invalidCommands] = update(filing, SubmittedIssue.make({}))
    expect(invalid.draftState).toMatchObject({
      _tag: 'FailedIssueDraft',
      reason: 'A title is required.',
    })
    expect(invalidCommands).toEqual([])

    const [titled] = update(
      invalid,
      UpdatedIssueTitle.make({ value: 'Audio stops unexpectedly' }),
    )
    const [saving, commands] = update(titled, SubmittedIssue.make({}))
    expect(saving.draftState._tag).toBe('SavingIssueDraft')
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('SaveIssue')
  })
})
