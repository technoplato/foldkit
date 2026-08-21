/** Evocation tokens on the full-file clock (chapter start + chapter-relative). */
export const EVOCATION_START_SECONDS = 18.669

const offset = (seconds: number): number => seconds + EVOCATION_START_SECONDS

/** First spoken window of Evocation. Times already include chapter start. */
export const newEarthEvocationWords: ReadonlyArray<{
  readonly id: string
  readonly text: string
  readonly start: number
  readonly end: number
}> = [
  { id: 'w0', text: 'Evocation', start: offset(0.64), end: offset(1.24) },
  { id: 'w1', text: 'Earth,', start: offset(4.08), end: offset(4.76) },
  { id: 'w2', text: '114', start: offset(4.76), end: offset(5.44) },
  { id: 'w3', text: 'million', start: offset(5.44), end: offset(5.9) },
  { id: 'w4', text: 'years', start: offset(5.9), end: offset(6.24) },
  { id: 'w5', text: 'ago,', start: offset(6.24), end: offset(6.64) },
  { id: 'w6', text: 'one', start: offset(7.0), end: offset(7.3) },
  { id: 'w7', text: 'morning', start: offset(7.3), end: offset(7.7) },
  { id: 'w8', text: 'just', start: offset(7.7), end: offset(8.0) },
  { id: 'w9', text: 'after', start: offset(8.0), end: offset(8.4) },
  { id: 'w10', text: 'sunrise.', start: offset(8.4), end: offset(9.0) },
  { id: 'w11', text: 'The', start: offset(10.16), end: offset(10.84) },
  { id: 'w12', text: 'first', start: offset(10.84), end: offset(11.16) },
  { id: 'w13', text: 'flower', start: offset(11.16), end: offset(11.56) },
  { id: 'w14', text: 'ever', start: offset(11.56), end: offset(11.9) },
  { id: 'w15', text: 'to', start: offset(11.9), end: offset(12.1) },
  { id: 'w16', text: 'appear', start: offset(12.1), end: offset(12.38) },
  { id: 'w17', text: 'on', start: offset(12.38), end: offset(12.54) },
  { id: 'w18', text: 'the', start: offset(12.54), end: offset(12.64) },
  { id: 'w19', text: 'planet', start: offset(12.64), end: offset(13.02) },
]
