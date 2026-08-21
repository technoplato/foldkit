/**
 * Reverse Refs — walk a transcript backward and lift callbacks
 */

export type Ref = {
  n: number
  kind: 'temporal' | 'semantic' | 'person' | 'tool' | 'money' | 'ethic'
  text: string
}

export const SESSION_REFS: Ref[] = [
  {
    n: 1,
    kind: 'tool',
    text: 'SpotSound — Ctrl+F for sound (HuggingApps video)',
  },
  { n: 2, kind: 'tool', text: 'Orbit terminal aesthetic / Wait Inspector' },
  {
    n: 3,
    kind: 'tool',
    text: 'Pixel stitcher for voice + photos + screen actions',
  },
  { n: 4, kind: 'tool', text: 'definitions.sh machine-public schema' },
  { n: 5, kind: 'tool', text: 'Agent leaderboard (capital disabled)' },
  { n: 6, kind: 'money', text: 'boomerang.nofi.com / $14.28 / TJ / Achilles' },
  {
    n: 7,
    kind: 'ethic',
    text: 'Inspector generals; refuse exploitation and violence',
  },
  {
    n: 8,
    kind: 'semantic',
    text: '3 Rs = L (references, recitation, rules = learning)',
  },
  { n: 9, kind: 'semantic', text: 'GED → master agent ladder; GEB; QED' },
  { n: 10, kind: 'tool', text: 'FoldKit view-layer separation / origami' },
  {
    n: 11,
    kind: 'person',
    text: 'Ren — bedtime dinos, Wheels on the Bus, Saturn',
  },
  {
    n: 12,
    kind: 'ethic',
    text: 'Be nice. Change the world for the better. Hero’s journey.',
  },
  {
    n: 13,
    kind: 'temporal',
    text: 'Process the recording backwards, 3–7 hours, then 3–6 weeks',
  },
  {
    n: 14,
    kind: 'person',
    text: 'technoplato / Michael Lustig / museum-grade builder card',
  },
  {
    n: 15,
    kind: 'tool',
    text: 'FoldKit core + Three.js host — counters then vending; degree if 3JS only renders',
  },
  {
    n: 16,
    kind: 'semantic',
    text: 'ASR: nofi/nofee/nophy/knophi = Knophy (knophy.com). vending.knophy.com, store.knophy.com — not nofi.com',
  },
]

export function reverse(refs: Ref[]): Ref[] {
  return [...refs].sort((a, b) => b.n - a.n)
}
