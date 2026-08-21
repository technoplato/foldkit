/**
 * Derive ASCII frames from a live Multiple Counters Model.
 * Foldkit Model changes → lines and hotspots change (not inert sketches).
 */
import {
  type CounterRow,
  type Model,
  destinationForModel,
} from 'counters-core-example'
import { Match as M, Option } from 'effect'

export type LiveHotspot = {
  id: string
  label: string
  /** 0-based row within `lines` */
  row: number
  col: number
  width: number
  height?: number
  action:
    | { _tag: 'add' }
    | { _tag: 'open'; counterId: string }
    | { _tag: 'inc'; counterId: string }
    | { _tag: 'dec'; counterId: string }
    | { _tag: 'reset'; counterId: string }
    | { _tag: 'back' }
    | { _tag: 'delete' }
    | { _tag: 'cancelDelete' }
    | { _tag: 'confirmDelete' }
}

export type LiveFrame = {
  device: 'phone'
  lines: string[]
  hotspots: LiveHotspot[]
}

export type LiveNode = {
  uri: string
  title: string
  summary: string
  x: number
  y: number
  active: boolean
  frame: LiveFrame
}

const W = 28

const pad = (s: string, w = W) =>
  s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length)

const phone = (content: string[], hotspots: LiveHotspot[]): LiveFrame => {
  // content rows are phone interior; wrap with border → line indices shift +1
  const lines = [
    '┌' + '─'.repeat(W) + '┐',
    ...content.map(l => '│' + pad(l) + '│'),
    '└' + '─'.repeat(W) + '┘',
  ]
  return {
    device: 'phone',
    lines,
    hotspots: hotspots.map(h => ({ ...h, row: h.row + 1 })),
  }
}

const listFrame = (rows: ReadonlyArray<CounterRow>): LiveFrame => {
  const hotspots: LiveHotspot[] = []
  const content: string[] = [
    '  ·  ·  ·          9:41  ⚡ ',
    '  Counters                 ',
    '                           ',
  ]

  if (rows.length === 0) {
    content.push(
      '  No counters yet          ',
      '                           ',
      '   ┌────────────────────┐  ',
      '   │   + Add counter    │  ',
      '   └────────────────────┘  ',
      '                           ',
    )
    hotspots.push({
      id: 'add',
      label: 'Add counter',
      row: 5,
      col: 4,
      width: 22,
      height: 3,
      action: { _tag: 'add' },
    })
  } else {
    const total = rows.reduce((s, r) => s + r.counter.count, 0)
    content[1] = pad(`  Counters          Σ ${total}`)
    let r = 3
    for (const row of rows.slice(0, 5)) {
      const idShort = row.id.length > 12 ? row.id.slice(0, 12) : row.id
      content.push(
        pad(
          `  ${idShort.padEnd(12)} ${String(row.counter.count).padStart(3)} [−][+]`,
        ),
      )
      hotspots.push({
        id: `open-${row.id}`,
        label: `Open ${row.id}`,
        row: r,
        col: 2,
        width: 14,
        action: { _tag: 'open', counterId: row.id },
      })
      hotspots.push({
        id: `dec-${row.id}`,
        label: `Decrement ${row.id}`,
        row: r,
        col: 20,
        width: 3,
        action: { _tag: 'dec', counterId: row.id },
      })
      hotspots.push({
        id: `inc-${row.id}`,
        label: `Increment ${row.id}`,
        row: r,
        col: 23,
        width: 3,
        action: { _tag: 'inc', counterId: row.id },
      })
      r += 1
    }
    content.push('                           ')
    content.push('   [ + Add counter ]       ')
    hotspots.push({
      id: 'add',
      label: 'Add counter',
      row: r + 1,
      col: 4,
      width: 18,
      action: { _tag: 'add' },
    })
  }

  return phone(content, hotspots)
}

const detailFrame = (row: CounterRow, mode: 'plain' | 'delete'): LiveFrame => {
  const hotspots: LiveHotspot[] = []
  const content: string[] = [
    '  ·  ·  ·          9:41  ⚡ ',
    '  ← Counters               ',
    '                           ',
    pad(`  ${row.id}`),
    pad(`           ${row.counter.count}`),
    '                           ',
    '      [ − ]     [ + ]      ',
    '                           ',
    '   [ Reset ]  [ Delete ]   ',
  ]

  hotspots.push(
    {
      id: 'back',
      label: 'Back',
      row: 1,
      col: 2,
      width: 12,
      action: { _tag: 'back' },
    },
    {
      id: 'dec',
      label: 'Decrement',
      row: 6,
      col: 6,
      width: 5,
      action: { _tag: 'dec', counterId: row.id },
    },
    {
      id: 'inc',
      label: 'Increment',
      row: 6,
      col: 16,
      width: 5,
      action: { _tag: 'inc', counterId: row.id },
    },
    {
      id: 'reset',
      label: 'Reset',
      row: 8,
      col: 4,
      width: 9,
      action: { _tag: 'reset', counterId: row.id },
    },
    {
      id: 'delete',
      label: 'Delete',
      row: 8,
      col: 16,
      width: 10,
      action: { _tag: 'delete' },
    },
  )

  if (mode === 'delete') {
    content.push('                           ')
    content.push('  Delete? [Cancel][OK]     ')
    hotspots.push(
      {
        id: 'cancel',
        label: 'Cancel delete',
        row: 10,
        col: 11,
        width: 8,
        action: { _tag: 'cancelDelete' },
      },
      {
        id: 'confirm',
        label: 'Confirm delete',
        row: 10,
        col: 19,
        width: 4,
        action: { _tag: 'confirmDelete' },
      },
    )
  }

  return phone(content, hotspots)
}

export const liveNodesFromModel = (model: Model): LiveNode[] => {
  const destination = destinationForModel(model)
  const listActive = destination._tag === 'CounterListDestination'

  let detailRow: CounterRow | null = null
  let deleteMode = false
  if (destination._tag === 'CounterDetailDestination') {
    detailRow = destination.counter
    if (
      Option.isSome(destination.maybeMode) &&
      destination.maybeMode.value._tag === 'DeleteCounterConfirmation'
    ) {
      deleteMode = true
    }
  }

  const nodes: LiveNode[] = [
    {
      uri: 'counters.list',
      title: 'List',
      summary: `${model.rows.length} rows · Σ ${model.rows.reduce((s, r) => s + r.counter.count, 0)} · live Model`,
      x: 40,
      y: 40,
      active: listActive,
      frame: listFrame(model.rows),
    },
    {
      uri: 'counters.detail',
      title: 'Detail',
      summary: detailRow
        ? `${detailRow.id} = ${detailRow.counter.count}`
        : 'Open a row from the list',
      x: 400,
      y: 40,
      active: !listActive && !deleteMode,
      frame: detailRow
        ? detailFrame(detailRow, 'plain')
        : phone(
            [
              '  ·  ·  ·          9:41  ⚡ ',
              '  Detail                   ',
              '                           ',
              '  (none selected)          ',
              '  open a row from list     ',
              '                           ',
            ],
            [],
          ),
    },
  ]

  if (detailRow && deleteMode) {
    nodes.push({
      uri: 'counters.delete.confirm',
      title: 'Delete · Confirm',
      summary: `Confirm delete ${detailRow.id}`,
      x: 400,
      y: 400,
      active: true,
      frame: detailFrame(detailRow, 'delete'),
    })
  }

  return nodes
}

export const activeUriFromModel = (model: Model): string => {
  const destination = destinationForModel(model)
  return M.value(destination).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      CounterListDestination: () => 'counters.list',
      CounterDetailDestination: ({ maybeMode }) => {
        if (
          Option.isSome(maybeMode) &&
          maybeMode.value._tag === 'DeleteCounterConfirmation'
        ) {
          return 'counters.delete.confirm'
        }
        return 'counters.detail'
      },
    }),
  )
}
