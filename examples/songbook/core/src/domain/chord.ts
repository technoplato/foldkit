import { Option, Schema as S, String as Str } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

import { Pitch, parsePitch, printPitch, transposePitch } from './pitch.js'

const PITCH_HEAD = /^([A-G](?:#|b)?)(.*)$/

/** No remaining quality text. */
export const RestNone = ts('None')
/** Open quality text after the root. */
export const RestSome = ts('Some', { text: NonEmptyString })
/** Quality text after a sounding root. */
export const Rest = S.Union([RestNone, RestSome])
/** Quality text after a sounding root. */
export type Rest = typeof Rest.Type

/** No slash bass. */
export const BassNone = ts('None')
/** A slash bass pitch. */
export const BassSome = ts('Some', { pitch: Pitch })
/** Optional slash bass. */
export const Bass = S.Union([BassNone, BassSome])
/** Optional slash bass. */
export type Bass = typeof Bass.Type

/** No chord sounds. */
export const Silent = ts('Silent')
/** A sounding chord. Rest is open quality text. */
export const Sounding = ts('Sounding', {
  root: Pitch,
  rest: Rest,
  bass: Bass,
})
/** Chord names offered as Buttons when a word is focused. */
export const CHORD_CHOICES: ReadonlyArray<string> = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
  'Am',
  'Dm',
  'Em',
  'G7',
  'C7',
  'N.C.',
]

/** A placed chord. */
export const Chord = S.Union([Silent, Sounding])
/** A placed chord. */
export type Chord = typeof Chord.Type
/** A silent chord. */
export type Silent = typeof Silent.Type
/** A sounding chord. */
export type Sounding = typeof Sounding.Type

const restOf = (suffix: string): Rest => {
  if (Str.isEmpty(suffix)) {
    return RestNone()
  }
  return RestSome.make({ text: NonEmptyString.make(suffix) })
}

const parsePitchToken = (
  token: string,
): Option.Option<Readonly<{ pitch: Pitch; rest: string }>> => {
  const maybeParts = Option.fromNullishOr(PITCH_HEAD.exec(token))
  if (Option.isNone(maybeParts)) {
    return Option.none()
  }
  const root = maybeParts.value[1] ?? token
  const rest = maybeParts.value[2] ?? ''
  return Option.map(parsePitch(root), pitch => ({ pitch, rest }))
}

/** Parses a typed chord name. */
export const parseChord = (name: string): Option.Option<Chord> => {
  const trimmed = Str.trim(name)
  if (Str.isEmpty(trimmed)) {
    return Option.none()
  }
  if (
    trimmed === 'N.C.' ||
    trimmed === 'NC' ||
    trimmed === 'n.c.' ||
    trimmed === 'nc'
  ) {
    return Option.some(Silent())
  }
  const slashIndex = trimmed.indexOf('/')
  if (slashIndex === -1) {
    return Option.map(parsePitchToken(trimmed), ({ pitch, rest }) =>
      Sounding.make({
        root: pitch,
        rest: restOf(rest),
        bass: BassNone(),
      }),
    )
  }
  const rootPart = trimmed.slice(0, slashIndex)
  const bassPart = trimmed.slice(slashIndex + 1)
  return Option.flatMap(parsePitchToken(rootPart), ({ pitch, rest }) =>
    Option.map(parsePitch(bassPart), bass =>
      Sounding.make({
        root: pitch,
        rest: restOf(rest),
        bass: BassSome.make({ pitch: bass }),
      }),
    ),
  )
}

const printRest = (rest: Sounding['rest']): string => {
  if (rest._tag === 'None') {
    return ''
  }
  return rest.text
}

/** Prints a chord in the original key. */
export const printChord = (chord: Chord): string => {
  if (chord._tag === 'Silent') {
    return 'N.C.'
  }
  const bass =
    chord.bass._tag === 'None' ? '' : `/${printPitch(chord.bass.pitch)}`
  return `${printPitch(chord.root)}${printRest(chord.rest)}${bass}`
}

/** Display name after transpose and capo. Stored chords stay in the original key. */
export const displayChord = (
  chord: Chord,
  transposeSteps: number,
  capo: number,
): string => {
  if (chord._tag === 'Silent') {
    return 'N.C.'
  }
  const shift = transposeSteps - capo
  const root = transposePitch(chord.root, shift)
  const bass =
    chord.bass._tag === 'None'
      ? ''
      : `/${printPitch(transposePitch(chord.bass.pitch, shift))}`
  return `${printPitch(root)}${printRest(chord.rest)}${bass}`
}
