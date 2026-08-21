/**
 * Counters product UI as atomic tree (organisms → templates).
 * Same structure for canvas phones; DomSurface can map later.
 */
import type { CounterRow, Model } from 'counters-core-example'
import { destinationForModel } from 'counters-core-example'
import { Option } from 'effect'

import { Button, HStack, Phone, Spacer, Text, VStack } from './elements.js'
import type { HotspotAction, UiNode } from './types.js'

export type CountersActions = {
  clickedAddCounter: () => void
  selectedCounter: (id: string) => void
  clickedIncrementCounter: (id: string) => void
  clickedDecrementCounter: (id: string) => void
  clickedResetCounter: (id: string) => void
  dismissedCounterDetail: () => void
  clickedDeleteCounter: () => void
  cancelledDeleteCounter: () => void
  confirmedDeleteCounter: () => void
}

const sum = (rows: ReadonlyArray<CounterRow>) =>
  rows.reduce((s, r) => s + r.counter.count, 0)

const shortId = (id: string) => (id.length > 9 ? id.slice(0, 9) : id)

/** Organism: one list row */
const CounterRowView = (row: CounterRow, actions: CountersActions): UiNode =>
  HStack(
    { gap: 1 },
    Button({
      label: shortId(row.id),
      onPress: () => actions.selectedCounter(row.id),
      action: { _tag: 'open', counterId: row.id },
    }),
    Text(String(row.counter.count).padStart(3), { mono: true, width: 3 }),
    Button({
      // ASCII hyphen (not U+2212) so mono cell width stays exact
      label: '-',
      onPress: () => actions.clickedDecrementCounter(row.id),
      action: { _tag: 'dec', counterId: row.id },
    }),
    Button({
      label: '+',
      onPress: () => actions.clickedIncrementCounter(row.id),
      action: { _tag: 'inc', counterId: row.id },
    }),
  )

/** Screen: list phone (always model.rows) */
export const CountersListPhone = (
  model: Model,
  actions: CountersActions,
): UiNode => {
  const rows = model.rows
  return Phone(
    { cols: 28, title: `Counters  Σ ${sum(rows)}` },
    VStack(
      { gap: 0 },
      Spacer(0),
      rows.length === 0
        ? Text('  No counters yet')
        : VStack(
            { gap: 0 },
            ...rows.slice(0, 6).map(r => CounterRowView(r, actions)),
          ),
      Spacer(1),
      Button({
        label: '+ Add',
        onPress: actions.clickedAddCounter,
        action: { _tag: 'add' as const } satisfies HotspotAction,
        variant: 'primary',
      }),
    ),
  )
}

/** Screen: detail phone */
export const CountersDetailPhone = (
  model: Model,
  actions: CountersActions,
): UiNode => {
  const dest = destinationForModel(model)
  if (dest._tag !== 'CounterDetailDestination') {
    return Phone(
      { cols: 28, title: 'Detail' },
      VStack(
        { gap: 0 },
        Spacer(1),
        Text('  (select a row)'),
        Text('  list stays live →'),
        Spacer(1),
      ),
    )
  }

  const row = dest.counter
  const deleteMode =
    Option.isSome(dest.maybeMode) &&
    dest.maybeMode.value._tag === 'DeleteCounterConfirmation'

  return Phone(
    { cols: 28, title: 'Detail' },
    VStack(
      { gap: 0 },
      Button({
        label: '< Back',
        onPress: actions.dismissedCounterDetail,
        action: { _tag: 'back' },
      }),
      Spacer(1),
      Text(`  ${shortId(row.id)}`, { mono: true }),
      Text(`       ${row.counter.count}`, { mono: true }),
      Spacer(1),
      HStack(
        { gap: 2 },
        Button({
          label: '-',
          onPress: () => actions.clickedDecrementCounter(row.id),
          action: { _tag: 'dec', counterId: row.id },
        }),
        Button({
          label: '+',
          onPress: () => actions.clickedIncrementCounter(row.id),
          action: { _tag: 'inc', counterId: row.id },
        }),
      ),
      Spacer(1),
      HStack(
        { gap: 1 },
        Button({
          label: 'Reset',
          onPress: () => actions.clickedResetCounter(row.id),
          action: { _tag: 'reset', counterId: row.id },
        }),
        Button({
          label: 'Delete',
          onPress: actions.clickedDeleteCounter,
          action: { _tag: 'delete' },
          variant: 'destructive',
        }),
      ),
      ...(deleteMode
        ? [
            Spacer(1),
            Text('  Delete this counter?'),
            HStack(
              { gap: 1 },
              Button({
                label: 'Cancel',
                onPress: actions.cancelledDeleteCounter,
                action: { _tag: 'cancelDelete' },
              }),
              Button({
                label: 'OK',
                onPress: actions.confirmedDeleteCounter,
                action: { _tag: 'confirmDelete' },
                variant: 'destructive',
              }),
            ),
          ]
        : []),
    ),
  )
}

export type CanvasNodeSpec = {
  uri: string
  title: string
  summary: string
  x: number
  y: number
  active: boolean
  tree: UiNode
}

/** Template: CanvasNodes — map territory for multi-counters */
export const countersCanvasNodes = (
  model: Model,
  actions: CountersActions,
): CanvasNodeSpec[] => {
  const dest = destinationForModel(model)
  const listActive = dest._tag === 'CounterListDestination'
  let deleteActive = false
  let detailActive = false
  if (dest._tag === 'CounterDetailDestination') {
    detailActive = true
    if (
      Option.isSome(dest.maybeMode) &&
      dest.maybeMode.value._tag === 'DeleteCounterConfirmation'
    ) {
      deleteActive = true
      detailActive = false
    }
  }

  return [
    {
      uri: 'counters.list',
      title: 'List',
      summary: `${model.rows.length} rows · Σ ${sum(model.rows)} · atomic AsciiSurface`,
      x: 40,
      y: 40,
      active: listActive,
      tree: CountersListPhone(model, actions),
    },
    {
      uri: 'counters.detail',
      title: 'Detail',
      summary:
        dest._tag === 'CounterDetailDestination'
          ? `${dest.counter.id} = ${dest.counter.counter.count}`
          : 'select a row (list is live)',
      x: 400,
      y: 40,
      active: detailActive || (!listActive && !deleteActive),
      tree: CountersDetailPhone(model, actions),
    },
  ]
}
