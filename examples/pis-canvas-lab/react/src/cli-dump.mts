/**
 * Non-captive CLI: print ASCII frames from a Foldkit multi-counters Model.
 *
 *   cd examples/pis-canvas-lab/react && pnpm cli:dump
 *
 * Pure stdout — no raw mode, no stdin (agent-friendly).
 */
import * as Counter from 'counter-core-example'
import * as Counters from 'counters-core-example'

import {
  type CountersActions,
  CountersDetailPhone,
  CountersListPhone,
  renderAscii,
} from './ascii-ui/index.js'

const noopActions: CountersActions = {
  clickedAddCounter: () => {},
  selectedCounter: () => {},
  clickedIncrementCounter: () => {},
  clickedDecrementCounter: () => {},
  clickedResetCounter: () => {},
  dismissedCounterDetail: () => {},
  clickedDeleteCounter: () => {},
  cancelledDeleteCounter: () => {},
  confirmedDeleteCounter: () => {},
}

const [model0] = Counters.init()
let model = model0

const step = (message: Counters.Message) => {
  const [next] = Counters.update(model, message)
  model = next
}

const id1 = model.rows[0]!.id
const id2 = model.rows[1]!.id

step(
  Counters.GotCounterMessage({
    counterId: id1,
    message: Counter.ClickedIncrement(),
  }),
)
step(
  Counters.GotCounterMessage({
    counterId: id1,
    message: Counter.ClickedIncrement(),
  }),
)
step(
  Counters.GotCounterMessage({
    counterId: id2,
    message: Counter.ClickedDecrement(),
  }),
)

const rule = (title: string) => {
  console.log('')
  console.log(`══ ${title} ══`)
  console.log('')
}

rule('non-captive CLI · AsciiSurface · multi-counters (Foldkit Model)')
console.log('Model snapshot:')
for (const r of model.rows) {
  console.log(`  ${r.id} → count ${r.counter.count}`)
}

const listFrame = renderAscii(CountersListPhone(model, noopActions))
rule('phone: counters.list  (atomic VStack/HStack/Text/Button)')
console.log(listFrame.lines.join('\n'))
console.log('')
console.log(
  'hotspots:',
  listFrame.hotspots.map(h => `${h.label}@r${h.row}c${h.col}`).join(' · ') ||
    '(none)',
)

const detailEmpty = renderAscii(CountersDetailPhone(model, noopActions))
rule('phone: counters.detail  (list destination → placeholder)')
console.log(detailEmpty.lines.join('\n'))

step(
  Counters.SelectedCounter({
    counterId: id1,
    detailPresentationId: 'detail-cli-proto-1',
  }),
)

const detailSel = renderAscii(CountersDetailPhone(model, noopActions))
rule(`phone: counters.detail  (selected ${id1})`)
console.log(detailSel.lines.join('\n'))
console.log('')
console.log(
  'hotspots:',
  detailSel.hotspots.map(h => `${h.label}@r${h.row}c${h.col}`).join(' · '),
)

rule('done')
console.log('Non-captive: stdout only. Canvas: http://127.0.0.1:5199/counters')
