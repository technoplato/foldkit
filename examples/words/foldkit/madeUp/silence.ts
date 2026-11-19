const SAMPLE_RATE = 4000

const HEADER_BYTES = 44

const writeText = (view: DataView, offset: number, text: string): void => {
  Array.from(text).forEach((character, at) => {
    view.setUint8(offset + at, character.charCodeAt(0))
  })
}

/**
 * The address of `seconds` of silence, a sound file made in the page: one
 * channel, eight bits, so an hour is a few megabytes. The made-up page
 * plays it, so the player, its clock and its position reports are the
 * real ones with nothing to hear.
 *
 * @example
 * ```typescript
 * silentAudioUrl(90)
 * ```
 */
export const silentAudioUrl = (seconds: number): string => {
  const sampleCount = Math.ceil(seconds * SAMPLE_RATE)
  const buffer = new ArrayBuffer(HEADER_BYTES + sampleCount)
  const view = new DataView(buffer)
  writeText(view, 0, 'RIFF')
  view.setUint32(4, 36 + sampleCount, true)
  writeText(view, 8, 'WAVE')
  writeText(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  writeText(view, 36, 'data')
  view.setUint32(40, sampleCount, true)
  // NOTE: eight-bit sound is unsigned, so silence is the middle value.
  new Uint8Array(buffer, HEADER_BYTES).fill(128)
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}
