/**
 * Pixel Stitch — multimodal time-period stitcher
 * Events become a single, seekable timeline. No pixel streaming required:
 * the timeline is a state machine. A player renders the current event.
 */

export type Kind = "voice" | "photo" | "screen" | "note"

export type StitchEvent = {
  id: string
  t: number
  kind: Kind
  label: string
  detail: string
  src?: string
}

export type StitchFile = {
  title: string
  startedAt: string
  events: StitchEvent[]
}

export function sortEvents(events: StitchEvent[]): StitchEvent[] {
  return [...events].sort((a, b) => a.t - b.t)
}

export function eventAt(events: StitchEvent[], t: number): StitchEvent | null {
  const sorted = sortEvents(events)
  let cur: StitchEvent | null = null
  for (const e of sorted) {
    if (e.t <= t) cur = e
    else break
  }
  return cur
}

export function toStitchJson(file: StitchFile): string {
  return JSON.stringify({ ...file, events: sortEvents(file.events) }, null, 2)
}

export function semanticExtract(events: StitchEvent[]): string[] {
  const bag = new Map<string, number>()
  for (const e of events) {
    for (const w of (e.label + " " + e.detail).toLowerCase().match(/[a-z]{4,}/g) ?? []) {
      bag.set(w, (bag.get(w) ?? 0) + 1)
    }
  }
  return [...bag.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w)
}
