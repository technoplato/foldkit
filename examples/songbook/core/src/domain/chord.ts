import { Array, Option, Schema as S, String as Str } from 'effect'
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

const restOfGroup = (maybeText: Option.Option<string>): Rest => {
  if (Option.isNone(maybeText) || Str.isEmpty(maybeText.value)) {
    return RestNone()
  }
  return RestSome.make({ text: NonEmptyString.make(maybeText.value) })
}

const parsePitchToken = (
  token: typeof NonEmptyString.Type,
): Option.Option<Readonly<{ pitch: Pitch; rest: Rest }>> => {
  const maybeParts = Option.fromNullishOr(PITCH_HEAD.exec(token))
  if (Option.isNone(maybeParts)) {
    return Option.none()
  }
  const groups = Array.fromIterable(maybeParts.value)
  const maybeRoot = Array.get(groups, 1)
  if (Option.isNone(maybeRoot) || Str.isEmpty(maybeRoot.value)) {
    return Option.none()
  }
  return Option.map(
    parsePitch(NonEmptyString.make(maybeRoot.value)),
    pitch => ({
      pitch,
      rest: restOfGroup(Array.get(groups, 2)),
    }),
  )
}

/** Parses a typed chord name. */
export const parseChord = (
  name: typeof NonEmptyString.Type,
): Option.Option<Chord> => {
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
  const nextName = NonEmptyString.make(trimmed)
  const maybeSlash = Str.indexOf('/')(nextName)
  if (Option.isNone(maybeSlash)) {
    return Option.map(parsePitchToken(nextName), ({ pitch, rest }) =>
      Sounding.make({
        root: pitch,
        rest,
        bass: BassNone(),
      }),
    )
  }
  const rootPart = nextName.slice(0, maybeSlash.value)
  const bassPart = nextName.slice(maybeSlash.value + 1)
  if (Str.isEmpty(rootPart) || Str.isEmpty(bassPart)) {
    return Option.none()
  }
  return Option.flatMap(
    parsePitchToken(NonEmptyString.make(rootPart)),
    ({ pitch, rest }) =>
      Option.map(parsePitch(NonEmptyString.make(bassPart)), bass =>
        Sounding.make({
          root: pitch,
          rest,
          bass: BassSome.make({ pitch: bass }),
        }),
      ),
  )
}

const printSounding = (
  root: Pitch,
  rest: Rest,
  bassPitch: Option.Option<Pitch>,
): string => {
  const rootText = printPitch(root)
  const quality = rest._tag === 'None' ? rootText : `${rootText}${rest.text}`
  if (Option.isNone(bassPitch)) {
    return quality
  }
  return `${quality}/${printPitch(bassPitch.value)}`
}

/** Prints a chord in the original key. */
export const printChord = (chord: Chord): string => {
  if (chord._tag === 'Silent') {
    return 'N.C.'
  }
  return printSounding(
    chord.root,
    chord.rest,
    chord.bass._tag === 'None' ? Option.none() : Option.some(chord.bass.pitch),
  )
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
  return printSounding(
    transposePitch(chord.root, shift),
    chord.rest,
    chord.bass._tag === 'None'
      ? Option.none()
      : Option.some(transposePitch(chord.bass.pitch, shift)),
  )
}
