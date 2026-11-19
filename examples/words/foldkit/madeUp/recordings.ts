import { Array, Option } from 'effect'
import {
  type RecordingDetail,
  type Section,
  StoredAudio,
} from 'words-core-example'

// NOTE: Every word here is made up for this page. Nothing is from a real
// recording, a real person, or a real book.
const sentences: ReadonlyArray<string> = [
  'The keeper climbed the stairs at dusk, one hand on the cold rail.',
  'He trimmed the wick and lit the lamp before the light went out of the sky.',
  'Far out a bell answered, slow and low, from somewhere past the point.',
  'Gulls settled on the gallery and watched the water turn from grey to black.',
  'A boat rounded the point with its own small lantern swinging at the bow.',
  'The tide came in over the rocks the way it had every night of his life.',
  'He wrote the hour in the log, and the wind, and the name of the boat.',
  'Nobody had asked him to keep the lamp, and nobody had ever asked him to stop.',
  'When the fog came he rang the bell by hand until his arm gave out.',
  'His daughter brought bread and stayed to watch the beam cross the bay.',
  'She asked why the light turned, and he said so that ships would know it from a star.',
  'Below them the harbour was a handful of windows and one long street.',
  'The storm that year took the jetty and left the tower standing.',
  'In the morning the lamp was still warm and the glass was white with salt.',
  'He cleaned each pane with vinegar and a rag, as his father had shown him.',
  'There is a kind of patience that is only another word for staying.',
]

const wordSeconds = 0.34

const pauseSeconds = 0.9

/** The made-up recording's audio file, by the id its detail names. */
export const madeUpAudioFileID = 'made-up-audio'

type Built = Readonly<{ sections: ReadonlyArray<Section>; endSeconds: number }>

const sectionAt = (
  recordingID: string,
  index: number,
  startSeconds: number,
): Section => {
  const texts = (sentences[index % sentences.length] ?? '').split(' ')
  const id = `${recordingID}-section-${index.toString()}`
  return {
    id,
    index,
    startSeconds,
    endSeconds: startSeconds + texts.length * wordSeconds,
    maybeSpeakerID: Option.none(),
    text: texts.join(' '),
    words: Array.map(texts, (text, at) => ({
      id: `${id}:${at.toString()}`,
      text,
      startSeconds: startSeconds + at * wordSeconds,
      endSeconds: startSeconds + at * wordSeconds + wordSeconds - 0.05,
    })),
    isFinal: true,
    maybeWordsSeal: Option.none(),
  }
}

const sectionsOf = (recordingID: string, count: number): Built =>
  Array.reduce(
    Array.range(0, count - 1),
    { sections: [], endSeconds: 2 },
    (built: Built, index): Built => {
      const section = sectionAt(recordingID, index, built.endSeconds)
      return {
        sections: [...built.sections, section],
        endSeconds: section.endSeconds + pauseSeconds,
      }
    },
  )

/**
 * A made-up recording of `sectionCount` sections, each one sentence with
 * a time for every word, with nothing playing and no pictures or copies.
 *
 * @example
 * ```typescript
 * madeUpRecordingOf('…0001', 'The Lantern Keeper', 40)
 * ```
 */
export const madeUpRecordingOf = (
  recordingID: string,
  title: string,
  sectionCount: number,
): RecordingDetail => {
  const { sections, endSeconds } = sectionsOf(recordingID, sectionCount)
  return {
    summary: {
      id: recordingID,
      title,
      startedAtMs: Date.UTC(2026, 0, 12, 14, 0, 0),
      durationSeconds: Math.ceil(endSeconds),
      maybeUpdatedAtMs: Option.none(),
      maybeOwnerUserID: Option.none(),
      activity: 'Idle',
      maybeDeviceIcon: Option.none(),
      previewLines: [],
      isLiveRoomSet: false,
      captureGaps: [],
    },
    sections,
    retiredLines: [],
    speakers: [],
    clipboard: [],
    images: [],
    audio: StoredAudio({ fileID: madeUpAudioFileID, byteCount: 1 }),
  }
}
