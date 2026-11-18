import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { ApplicationProduct, Issue } from '@foldkit/instant-tools/issues'

import { modelForNavigation } from './init.js'
import {
  MovedCardAcross,
  ObservedIssues,
  ObservedProducts,
  OpenedRowField,
  DismissedLayer,
  ToggledRowUnderCursor,
} from './message.js'
import { type Model } from './model.js'
import { pathToNavigation } from './route.js'
import { update } from './update.js'

const scribe = ApplicationProduct.make({ id: 'scribe', name: 'Scribe' })

const openIssue = (id: string, createdAtMs: number): Issue =>
  Issue.make({
    area: Option.none(),
    attachments: [],
    claimantId: Option.none(),
    complexity: Option.none(),
    createdAtMs,
    details: '',
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

const cursorOn = (model: Model, issueId: string): Model =>
  Array.reduce(
    [
      OpenedRowField.make({ issueId, menu: 'SetStatus' }),
      DismissedLayer.make({}),
    ],
    model,
    (current, message) => update(current, message)[0],
  )

const board = (): Model =>
  Array.reduce(
    [
      ObservedIssues.make({
        issues: [openIssue('102', 3_000), openIssue('101', 2_000)],
      }),
      ObservedProducts.make({ products: [{ product: scribe, updatedAtMs: 1 }] }),
    ],
    modelForNavigation(pathToNavigation('/issues?view=board')),
    (model, message) => update(model, message)[0],
  )

describe('moving a card across the board with Shift+L', () => {
  it('moves the card under the cursor when the selection does not hold it', () => {
    const selected102 = update(
      cursorOn(board(), '102'),
      ToggledRowUnderCursor.make({}),
    )[0]
    const onUnselected101 = cursorOn(selected102, '101')

    const [moved] = update(
      onUnselected101,
      MovedCardAcross.make({ direction: 'Next' }),
    )

    expect(Array.map(moved.rowEdits, edit => edit.issueId)).toEqual(['101'])
  })

  it('moves the whole selection when the cursor is on a selected card', () => {
    const selected102 = update(
      cursorOn(board(), '102'),
      ToggledRowUnderCursor.make({}),
    )[0]

    const [moved] = update(
      selected102,
      MovedCardAcross.make({ direction: 'Next' }),
    )

    expect(Array.map(moved.rowEdits, edit => edit.issueId)).toEqual(['102'])
  })
})
