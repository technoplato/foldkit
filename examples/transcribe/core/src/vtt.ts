/** One caption cue after VTT tags are stripped. */
export type CaptionCue = Readonly<{
  endMs: number
  startMs: number
  text: string
}>

const TIMESTAMP = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/

/** Parses a VTT timestamp into milliseconds. */
export const parseTimestampMs = (value: string): number => {
  const match = TIMESTAMP.exec(value)
  if (match === null) {
    return 0
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number(match[4])
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds
}

const cueTiming = /(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/

const stripTags = (value: string): string =>
  value
    .replace(/<[^>]+>/g, '')
    .replace(/\n+/g, ' ')
    .trim()

/** Parses YouTube or standard WebVTT into de-duplicated caption cues. */
export const parseVtt = (source: string): ReadonlyArray<CaptionCue> => {
  const cues: Array<CaptionCue> = []
  const blocks = source.replace(/\r\n/g, '\n').split(/\n\n+/)
  for (const block of blocks) {
    const match = cueTiming.exec(block)
    if (match === null || match[1] === undefined || match[2] === undefined) {
      continue
    }
    const newline = block.indexOf('\n')
    const raw = newline === -1 ? '' : block.slice(newline + 1)
    if (raw.includes('<c>')) {
      continue
    }
    const text = stripTags(raw)
    if (text.length === 0) {
      continue
    }
    const previous = cues[cues.length - 1]
    if (previous !== undefined && previous.text === text) {
      continue
    }
    cues.push({
      endMs: parseTimestampMs(match[2]),
      startMs: parseTimestampMs(match[1]),
      text,
    })
  }
  return cues
}

/** Joins caption cues into a single transcript string. */
export const transcriptTextFromCues = (
  cues: ReadonlyArray<CaptionCue>,
): string => cues.map(cue => cue.text).join(' ')
