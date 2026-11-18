import { Schema as S } from 'effect'
import { m } from 'foldkit/message'

import { AudibleProblem } from './problem.js'
import {
  AudibleTitle,
  AudioStatus,
  ImportProgress,
  ImportSummary,
  SkippedCount,
} from './title.js'

// FACT

/** The server started an Amazon sign-in, to open at `loginUrl`. */
export const StartedAudibleSignIn = m('StartedAudibleSignIn', {
  loginUrl: S.String,
})
/** The Amazon sign-in could not start, and why. */
export const FailedStartAudibleSignIn = m('FailedStartAudibleSignIn', {
  problem: AudibleProblem,
})
/** The server saved the family member's Audible login. */
export const ConnectedAudible = m('ConnectedAudible')
/** The pasted address did not connect, and why. */
export const FailedConnectAudible = m('FailedConnectAudible', {
  problem: AudibleProblem,
})
/** The family member's Audible titles arrived, and what the importer leaves out. */
export const ReceivedAudibleLibrary = m('ReceivedAudibleLibrary', {
  titles: S.Array(AudibleTitle),
  skipped: S.Array(SkippedCount),
})
/** The Audible titles could not be read, and why. */
export const FailedReadAudibleLibrary = m('FailedReadAudibleLibrary', {
  problem: AudibleProblem,
})
/** The import moved on. */
export const AdvancedAudibleImport = m('AdvancedAudibleImport', {
  progress: ImportProgress,
})
/** The import finished, and what it did. */
export const ImportedAudibleTitles = m('ImportedAudibleTitles', {
  summary: ImportSummary,
})
/** The import stopped before it was done, and why. */
export const FailedImportAudibleTitles = m('FailedImportAudibleTitles', {
  problem: AudibleProblem,
})

/** Every owned title's audio arrived, and what the queue does next. */
export const ReceivedAudiobookAudio = m('ReceivedAudiobookAudio', {
  status: AudioStatus,
})
/** The owned titles' audio could not be read, and why. */
export const FailedReadAudiobookAudio = m('FailedReadAudiobookAudio', {
  problem: AudibleProblem,
})
/** The queue took the book first; the audio as it stands now. */
export const QueuedAudiobookAudio = m('QueuedAudiobookAudio', {
  status: AudioStatus,
})
/** The queue did not take the book, and why. */
export const FailedQueueAudiobookAudio = m('FailedQueueAudiobookAudio', {
  problem: AudibleProblem,
})
