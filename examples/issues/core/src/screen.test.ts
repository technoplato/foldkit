import { Array, Effect, Option } from 'effect'
import { buttonsOf, inputsOf, textsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { InstantEntityStoreError } from '@foldkit/instant-tools/instant'
import {
  ApplicationProduct,
  IssueTracker,
  IssueTrackerError,
  type IssueTrackerService,
  LibraryProduct,
  ProductCatalogEntry,
} from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import {
  ClickedFileIssue,
  type Message,
  ObservedProducts,
  SelectedIssuePriority,
  SelectedIssueProduct,
  SubmittedIssue,
  UpdatedIssueDetails,
  UpdatedIssueTitle,
} from './message.js'
import { FileIssue, type Model } from './model.js'
import { messageForScreenToken } from './presentation.js'
import { type IssueTrackerResources, issuesScreen } from './program.js'
import {
  StaticIssueTrackerResources,
  makeMemoryIssueTracker,
} from './resources.js'
import { update } from './update.js'

const scribe = ProductCatalogEntry.make({
  product: ApplicationProduct.make({ id: 'scribe', name: 'Scribe' }),
  updatedAtMs: 1_000,
})
const foldkit = ProductCatalogEntry.make({
  product: LibraryProduct.make({ id: 'foldkit', name: 'Foldkit' }),
  updatedAtMs: 1_000,
})

const filingModel = (): Model =>
  update(
    modelForNavigation(FileIssue.make({})),
    ObservedProducts.make({ products: [scribe, foldkit] }),
  )[0]

const applyAll = (model: Model, messages: ReadonlyArray<Message>): Model =>
  Array.reduce(
    messages,
    model,
    (current, message) => update(current, message)[0],
  )

const contentsOf = (model: Model): ReadonlyArray<string> =>
  Array.map(textsOf(issuesScreen(model)), text => text.content)

const primaryTokensOf = (model: Model): ReadonlyArray<string> =>
  Array.flatMap(buttonsOf(issuesScreen(model)), button =>
    button.variant === 'Primary' && button.token !== undefined
      ? [button.token]
      : [],
  )

const runWith = <A>(
  tracker: IssueTrackerService,
  effect: Effect.Effect<A, never, IssueTrackerResources>,
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(IssueTracker, tracker),
      Effect.provide(StaticIssueTrackerResources),
    ),
  )

describe('Issue Tracker screen: the File form', () => {
  it('gives a person fields for the title and details and choices for the product and priority', () => {
    const screen = issuesScreen(filingModel())

    expect(Array.map(inputsOf(screen), input => input.token ?? '')).toEqual([
      'title:',
      'details:',
    ])
    expect(Array.map(buttonsOf(screen), button => button.token ?? '')).toEqual(
      expect.arrayContaining([
        'product:scribe',
        'product:foldkit',
        'priority:P0',
        'priority:P1',
        'priority:P2',
        'priority:P3',
        'priority:P4',
        'submit',
      ]),
    )
    expect(
      Array.filter(buttonsOf(screen), button => button.token === 'submit'),
    ).toHaveLength(1)
  })

  it('reads what the fields send as the draft Messages', () => {
    const filing = filingModel()

    expect(messageForScreenToken(filing, 'title:Audio stops: twice')).toEqual(
      Option.some(UpdatedIssueTitle.make({ value: 'Audio stops: twice' })),
    )
    expect(
      messageForScreenToken(filing, 'details:It stops after 30 s.'),
    ).toEqual(
      Option.some(UpdatedIssueDetails.make({ value: 'It stops after 30 s.' })),
    )
    expect(messageForScreenToken(filing, 'product:foldkit')).toEqual(
      Option.some(SelectedIssueProduct.make({ productId: 'foldkit' })),
    )
    expect(messageForScreenToken(filing, 'priority:P1')).toEqual(
      Option.some(SelectedIssuePriority.make({ priority: 'P1' })),
    )
    expect(messageForScreenToken(filing, 'priority:P9')).toEqual(Option.none())
  })

  it('shows what was typed and marks the chosen product and priority', () => {
    const filled = applyAll(filingModel(), [
      UpdatedIssueTitle.make({ value: 'Audio stops' }),
      UpdatedIssueDetails.make({ value: 'It stops after 30 s.' }),
      SelectedIssueProduct.make({ productId: 'Foldkit' }),
      SelectedIssuePriority.make({ priority: 'P1' }),
    ])

    expect(
      Array.map(inputsOf(issuesScreen(filled)), input => input.value),
    ).toEqual(['Audio stops', 'It stops after 30 s.'])
    expect(primaryTokensOf(filled)).toEqual(
      expect.arrayContaining(['product:foldkit', 'priority:P1']),
    )
    expect(primaryTokensOf(filled)).not.toContain('product:scribe')
    expect(primaryTokensOf(filled)).not.toContain('priority:P2')
  })

  it('says why an Issue was not filed, in words a person reads', async () => {
    const [untitled] = update(filingModel(), SubmittedIssue.make({}))
    expect(contentsOf(untitled)).toContain('Not filed: A title is required.')

    const titled = applyAll(filingModel(), [
      UpdatedIssueTitle.make({ value: 'Audio stops' }),
    ])
    const [saving, commands] = update(titled, SubmittedIssue.make({}))
    expect(contentsOf(saving)).toContain('Filing…')
    const working = await Effect.runPromise(makeMemoryIssueTracker([]))
    const refusing: IssueTrackerService = {
      ...working,
      file: () =>
        Effect.fail(
          new IssueTrackerError({
            cause: new InstantEntityStoreError({
              cause: new Error('Permission denied: instantToolsIssues'),
              operation: 'CreateIssue',
            }),
            operation: 'File',
          }),
        ),
    }

    const result = await runWith(
      refusing,
      Option.getOrThrow(Array.head(commands)).effect,
    )
    const [failed] = update(saving, result)

    expect(contentsOf(failed)).toContain(
      'Not filed: File: CreateIssue: Permission denied: instantToolsIssues',
    )
    expect(contentsOf(failed)).not.toContain('State: FailedIssueDraft')
  })

  it('starts the next Issue empty once one is filed', async () => {
    const filled = applyAll(filingModel(), [
      UpdatedIssueTitle.make({ value: 'Audio stops' }),
      UpdatedIssueDetails.make({ value: 'It stops after 30 s.' }),
      SelectedIssueProduct.make({ productId: 'foldkit' }),
    ])
    const [saving, commands] = update(filled, SubmittedIssue.make({}))
    const tracker = await Effect.runPromise(makeMemoryIssueTracker([]))

    const result = await runWith(
      tracker,
      Option.getOrThrow(Array.head(commands)).effect,
    )
    const [filed] = update(saving, result)
    const [next] = update(filed, ClickedFileIssue.make({}))

    expect(filed.navigation._tag).toBe('IssueDetail')
    expect(
      Array.map(inputsOf(issuesScreen(next)), input => input.value),
    ).toEqual(['', ''])
    expect(primaryTokensOf(next)).toContain('product:foldkit')
  })
})
