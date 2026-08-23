import { Array, Option, Schema as S } from 'effect'

/** Twelve pitch classes. Display uses sharps. */
export const Pitch = S.Literals([
  'C',
  'CSharp',
  'D',
  'DSharp',
  'E',
  'F',
  'FSharp',
  'G',
  'GSharp',
  'A',
  'ASharp',
  'B',
])
/** A pitch class. */
export type Pitch = typeof Pitch.Type

/** Every pitch class in chromatic order. */
export const PITCHES: ReadonlyArray<Pitch> = [
  'C',
  'CSharp',
  'D',
  'DSharp',
  'E',
  'F',
  'FSharp',
  'G',
  'GSharp',
  'A',
  'ASharp',
  'B',
]

const PITCH_TOKEN: Readonly<Record<Pitch, string>> = {
  C: 'C',
  CSharp: 'C#',
  D: 'D',
  DSharp: 'D#',
  E: 'E',
  F: 'F',
  FSharp: 'F#',
  G: 'G',
  GSharp: 'G#',
  A: 'A',
  ASharp: 'A#',
  B: 'B',
}

const TOKEN_PITCH: Readonly<Record<string, Pitch>> = {
  C: 'C',
  'C#': 'CSharp',
  Db: 'CSharp',
  D: 'D',
  'D#': 'DSharp',
  Eb: 'DSharp',
  E: 'E',
  F: 'F',
  'F#': 'FSharp',
  Gb: 'FSharp',
  G: 'G',
  'G#': 'GSharp',
  Ab: 'GSharp',
  A: 'A',
  'A#': 'ASharp',
  Bb: 'ASharp',
  B: 'B',
}

/** Printed pitch token. */
export const printPitch = (pitch: Pitch): string => PITCH_TOKEN[pitch]

/** Parses a pitch token. */
export const parsePitch = (token: string): Option.Option<Pitch> =>
  Option.fromNullishOr(TOKEN_PITCH[token])

const wrapSemitone = (index: number): number => {
  const remainder = index % 12
  return remainder < 0 ? remainder + 12 : remainder
}

/** Shifts a pitch by semitones. */
export const transposePitch = (pitch: Pitch, semitones: number): Pitch =>
  Option.getOrThrow(
    Array.get(PITCHES, wrapSemitone(PITCHES.indexOf(pitch) + semitones)),
  )
