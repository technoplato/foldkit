import { Effect, Option } from 'effect'
import { issuesScreen } from 'issues-core-example'
import { writeFileSync } from 'node:fs'

import { executeIssues } from './dist/host.js'
import { liveIssueTrackerResources } from './dist/resources.js'

const collect = (node, acc = []) => {
  if (node == null) return acc
  if (node._tag === 'Text') acc.push('TEXT ' + node.content)
  else if (node._tag === 'Button')
    acc.push('BTN ' + node.token + ' ' + node.label)
  const kids = node.children ?? []
  for (const child of kids) collect(child, acc)
  return acc
}

const resources = liveIssueTrackerResources()
const execution = await Effect.runPromise(
  executeIssues(['product:foldkit'], Option.none(), resources, '20 seconds'),
)
const lines = collect(issuesScreen(execution.finalModel))
const cards = lines.filter(l => l.startsWith('BTN open:'))
const scribeCards = cards.filter(l => l.includes('[Scribe]'))
const foldkitCards = cards.filter(l => l.includes('[Foldkit]'))
const filter = lines.filter(
  l => l.includes('product:') || l.includes('Product filter'),
)
const report = [
  'issuesScreen product:foldkit',
  'filter chips: ' + filter.join(' | '),
  'open cards: ' + cards.length,
  'foldkit cards: ' + foldkitCards.length,
  'scribe cards: ' + scribeCards.length,
  scribeCards.length === 0
    ? 'PASS Foldkit filter hides Scribe cards'
    : 'FAIL Scribe cards visible',
  ...cards,
].join('\n')
writeFileSync(
  '/Users/laptop/Development/foldkit/examples/issues/.look/PAINT-FOLDKIT-FILTER.txt',
  report,
)
console.log(report)
