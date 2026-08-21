/**
 * SpotSound — Ctrl+F for audio
 * Public, reviewable. No hidden network calls in demo mode.
 *
 * Demo: keyword + synonym search over a timed transcript.
 * Production: swap searchTranscript() for a temporal-grounding model.
 */

export type Segment = {
  t0: number
  t1: number
  text: string
  tags: string[]
}

export type Hit = {
  t0: number
  t1: number
  score: number
  excerpt: string
  reason: string
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(w => w.length > 1)
}

const SYN: Record<string, string[]> = {
  laugh: ['giggle', 'gassy', 'giggle gas', 'silly'],
  dino: [
    'dinosaur',
    'brachiosaurus',
    'apatosaurus',
    'ankylosaurus',
    'tyrannosaurus',
    'archaeopteryx',
  ],
  bus: ['wheels', 'wipers', 'horn', 'blink'],
  book: ['dinos', 'pooh', 'winnie', 'read'],
  space: ['saturn', 'planet', 'telescope', 'astronaut'],
  sleep: ['night', 'tuck', 'dreams', 'sleepy'],
}

export function expandQuery(q: string): string[] {
  const base = tokens(q)
  const extra = base.flatMap(t => SYN[t] ?? [])
  return [...new Set([...base, ...extra.map(normalize).flatMap(tokens)])]
}

export function searchTranscript(segments: Segment[], query: string): Hit[] {
  const q = expandQuery(query)
  if (!q.length) return []
  const hits: Hit[] = []
  for (const seg of segments) {
    const hay = normalize(seg.text + ' ' + seg.tags.join(' '))
    let score = 0
    const matched: string[] = []
    for (const t of q) {
      if (hay.includes(t)) {
        score += t.length > 6 ? 3 : 2
        matched.push(t)
      }
    }
    if (score > 0) {
      hits.push({
        t0: seg.t0,
        t1: seg.t1,
        score,
        excerpt: seg.text.slice(0, 180),
        reason: 'matched ' + matched.join(', '),
      })
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.t0 - b.t0)
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
}
