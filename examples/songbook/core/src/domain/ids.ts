import { NonEmptyString } from 'foldkit/adt'

/** Opaque song id. Emptiness is never switched on. */
export const SongId = NonEmptyString
/** Opaque song id. */
export type SongId = typeof SongId.Type

/** Opaque section id. Emptiness is never switched on. */
export const SectionId = NonEmptyString
/** Opaque section id. */
export type SectionId = typeof SectionId.Type

/** Opaque line id. Emptiness is never switched on. */
export const LineId = NonEmptyString
/** Opaque line id. */
export type LineId = typeof LineId.Type

/** Opaque word id. Emptiness is never switched on. */
export const WordId = NonEmptyString
/** Opaque word id. */
export type WordId = typeof WordId.Type

/** Section id derived from a song and its index. Replay-safe. */
export const sectionIdAt = (songId: SongId, index: number): SectionId =>
  SectionId.make(`${songId}:s:${String(index)}`)

/** Line id derived from a section and its index. Replay-safe. */
export const lineIdAt = (sectionId: SectionId, index: number): LineId =>
  LineId.make(`${sectionId}:${String(index)}`)

/** Word id derived from a line and its start. Replay-safe. */
export const wordIdAt = (lineId: LineId, start: number): WordId =>
  WordId.make(`${lineId}:${String(start)}`)
