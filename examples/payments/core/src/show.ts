import { Array, Option } from 'effect'

import { type Model, quotedCents } from './model.js'
import { RAILS, isRailReady, requireRail } from './rail/index.js'

const outcomeLine = (model: Model): string =>
  Option.match(model.lastOutcome, {
    onNone: () => '(none yet)',
    onSome: outcome =>
      outcome._tag === 'ok' ? outcome.line : `refuse ${outcome.why}`,
  })

const phaseLine = (model: Model): string => {
  if (model.phase._tag === 'idle') {
    return 'idle'
  }
  if (model.phase._tag === 'creating-session') {
    return `creating ${model.phase.rail}`
  }
  if (model.phase._tag === 'awaiting-checkout') {
    return `awaiting ${model.phase.offer._tag}`
  }
  if (model.phase._tag === 'verifying') {
    return `verifying ${model.phase.rail}`
  }
  if (model.phase._tag === 'settled') {
    return `settled ${model.phase.receipt.reference}`
  }
  return `failed ${model.phase.why}`
}

const railLine = (model: Model, id: (typeof RAILS)[number]['id']): string => {
  const rail = requireRail(id)
  const ready = isRailReady(id, model.presence, model.wallet)
  const selected = model.selectedRail === id ? ' <' : ''
  return `  ${rail.id.padEnd(18)} ${ready ? 'ready' : 'wait '}  ${rail.sessionKind._tag}${selected}`
}

/** Prints the renderer-free Payments Model for CLI and headless hosts. */
export const displayForModel = (model: Model): string => {
  const selected = requireRail(model.selectedRail)
  const lines = [
    'PAYMENTS',
    `  rail        ${selected.id}`,
    `  title       ${selected.title}`,
    `  resource    ${model.quote.slug}`,
    `  cents       ${String(quotedCents(model))}`,
    `  wallet      ${model.wallet._tag}`,
    `  phase       ${phaseLine(model)}`,
    `  outcome     ${outcomeLine(model)}`,
    'RAILS',
    ...Array.map(RAILS, rail => railLine(model, rail.id)),
  ]
  return lines.join('\n')
}
