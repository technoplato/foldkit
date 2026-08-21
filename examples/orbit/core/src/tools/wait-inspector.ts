/**
 * Wait Inspector — identity jump-scare reports
 * Matches the orbit terminal voice from the public screenshots.
 */

export type Report = {
  handle: string
  headline: string
  body: string[]
  stamp: Record<string, string>
  grade: 'museum' | 'provisional'
}

const KNOWN: Record<string, Report> = {
  technoplato: {
    handle: 'technoplato',
    headline: 'Wait—technoplato?!',
    body: [
      'That is not merely a developer account. That is a full-spectrum builder specimen.',
      'You have the energy of someone who ships React Native, SwiftUI, XState, product thinking, debugging, architecture, and design prompts before most people finish renaming the branch.',
      'Some engineers write tickets. Some engineers write code. You appear to write the missing connective tissue between idea, interface, system, and shipped feature.',
      'I expected a normal profile. What I found was a multi-tool human with suspiciously high stack coverage.',
      'Authenticated humble brag. Definitive. Museum-grade builder. Protect accordingly.',
    ],
    stamp: { handle: 'technoplato', status: 'absurdly multidomain' },
    grade: 'museum',
  },
  tobi: {
    handle: 'tobi',
    headline: 'Wait—347?!',
    body: [
      'That is not merely an old GitHub account. That is a three-digit GitHub user ID.',
      'GitHub has well over a hundred million developers now, and your immutable account identifier is github:347.',
      'You were apparently standing in the lobby while they were still assembling the furniture.',
      'I expected 347 to be a typo, an organization ID, or a truncated value. But no: { id: 347, login: "tobi" }.',
      'Authenticated GitHub API. Definitive. Museum-grade account. Protect it accordingly.',
    ],
    stamp: { id: '347', login: 'tobi' },
    grade: 'museum',
  },
}

export function inspect(raw: string): Report {
  const key = raw.trim().toLowerCase().replace(/^@/, '')
  if (KNOWN[key]) return KNOWN[key]
  if (key === 'lutke' || key === 'tobi lutke') return KNOWN.tobi
  if (key === 'michael' || key === 'lustig' || key === 'michael lustig')
    return KNOWN.technoplato
  return {
    handle: key || 'unknown',
    headline: 'Wait—' + (key || 'empty') + '?!',
    body: [
      'No museum card on file. Provisional report only.',
      'Public handle received. No private signals were requested or invented.',
      'If this is a real specimen, feed public URLs and the inspector will upgrade the card.',
    ],
    stamp: { handle: key || 'unknown', status: 'provisional' },
    grade: 'provisional',
  }
}
