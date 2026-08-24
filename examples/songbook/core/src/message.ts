import { Array, Option, Schema as S, String as Str } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { type ActionContext, md } from 'foldkit/message'

import {
  type Chord,
  Draft,
  Pitch,
  SectionKind,
  SongId,
  draftFromText,
  parseChord,
  parsePitch,
} from './domain/index.js'
import {
  type Chart,
  Idle,
  Looking,
  type Model,
  Searching,
  songsOfPopulated,
} from './model.js'

// MESSAGE

type Context = ActionContext

const chartOf = (model: Model): Chart | undefined => {
  if (model.library._tag !== 'Populated') {
    return undefined
  }
  if (model.library.place._tag !== 'Chart') {
    return undefined
  }
  return model.library.place
}

const isShelf = (model: Model): boolean => {
  if (model.library._tag === 'Empty') {
    return model.library.place._tag === 'Shelf'
  }
  return model.library.place._tag === 'Shelf'
}

const isChart = (model: Model): boolean => chartOf(model) !== undefined

const isEditing = (model: Model): boolean => {
  const chart = chartOf(model)
  if (chart === undefined) {
    return false
  }
  return chart.use._tag === 'Editing'
}

const isPlaying = (model: Model): boolean => {
  const chart = chartOf(model)
  if (chart === undefined) {
    return false
  }
  return chart.use._tag === 'Playing'
}

const isViewing = (model: Model): boolean => {
  const chart = chartOf(model)
  if (chart === undefined || chart.use._tag !== 'Editing') {
    return false
  }
  const tag = chart.use.current.sections._tag
  return tag === 'Empty' || tag === 'Idle'
}

const isLyrics = (model: Model): boolean => {
  const chart = chartOf(model)
  if (chart === undefined || chart.use._tag !== 'Editing') {
    return false
  }
  return chart.use.current.sections._tag === 'Lyrics'
}

const isWord = (model: Model): boolean => {
  const chart = chartOf(model)
  if (chart === undefined || chart.use._tag !== 'Editing') {
    return false
  }
  return chart.use.current.sections._tag === 'Word'
}

const isRemoving = (model: Model): boolean => {
  const chart = chartOf(model)
  if (chart === undefined || chart.use._tag !== 'Editing') {
    return false
  }
  return chart.use.current.sections._tag === 'Removing'
}

const isConfirming = (model: Model): boolean => {
  if (model.library._tag !== 'Populated') {
    return false
  }
  if (model.library.place._tag !== 'Shelf') {
    return false
  }
  return model.library.place.deleting._tag === 'Confirming'
}

const isSearching = (model: Model): boolean => {
  if (model.library._tag === 'Empty') {
    return (
      model.library.place._tag === 'Shelf' &&
      model.library.place.looking._tag === 'Searching'
    )
  }
  return (
    model.library.place._tag === 'Shelf' &&
    model.library.place.looking._tag === 'Searching'
  )
}

const isUnknown = (model: Model): boolean => {
  if (model.library._tag === 'Empty') {
    return model.library.place._tag === 'Unknown'
  }
  return model.library.place._tag === 'Unknown'
}

const hiddenUnless = (
  _model: Model,
  allowed: boolean,
  reason: string,
): string | undefined => (allowed ? undefined : reason)

/** Asks for a new song. Empty stays exclusive with write until ids arrive. */
export const ClickedNew = md('ClickedNew', {
  what: 'Creates a new untitled song',
  why: 'Triggered when the player asks for a new chart',
  keys: ['n'],
  tokens: ['new'],
  spoken: ['new'],
  command: 'new',
  event: 'clicked-new',
  mutate: 'library becomes populated chart after ids',
  sideEffects: 'GenerateIds',
  valid: (model: Model, _context: Context) => isShelf(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isShelf(model), 'not on the shelf'),
})

/** Ids for a new song arrived. */
export const SucceededGeneratedIds = md('SucceededGeneratedIds', {
  fields: { songId: SongId },
  what: 'Records a new song id',
  why: 'Triggered when GenerateIds finishes',
  tokens: ['generated'],
  spoken: ['generated'],
  command: 'generated',
  event: 'succeeded-generated-ids',
  mutate: 'library populated chart with a blank song',
  sideEffects: '(none)',
  valid: () => false,
  hiddenBecause: () => 'command result',
})

/** Creating a song id failed. */
export const FailedGeneratedIds = md('FailedGeneratedIds', {
  fields: { reason: NonEmptyString },
  what: 'Records that a song id could not be created',
  why: 'Triggered when GenerateIds fails',
  tokens: ['generate-failed'],
  spoken: ['generate failed'],
  command: 'generate-failed',
  event: 'failed-generated-ids',
  mutate: 'notice failed',
  sideEffects: '(none)',
  valid: () => false,
  hiddenBecause: () => 'command result',
})

/** Returns to the shelf. */
export const ClickedShelf = md('ClickedShelf', {
  what: 'Opens the shelf',
  why: 'Triggered when the player leaves a chart or unknown path',
  keys: ['s'],
  tokens: ['shelf'],
  spoken: ['shelf'],
  command: 'shelf',
  event: 'clicked-shelf',
  mutate: 'place becomes shelf',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) =>
    isChart(model) || isUnknown(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(
      model,
      isChart(model) || isUnknown(model),
      'already on the shelf',
    ),
})

/** Opens a chart for editing. */
export const OpenedChart = md('OpenedChart', {
  fields: { songId: SongId },
  what: 'Opens a chart for editing',
  why: 'Triggered when the player opens a library member',
  tokens: ['open'],
  spoken: ['open'],
  command: 'open',
  event: 'opened-chart',
  mutate: 'place becomes chart editing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) =>
    model.library._tag === 'Populated' && model.library.place._tag === 'Shelf',
  hiddenBecause: (model: Model) =>
    hiddenUnless(
      model,
      model.library._tag === 'Populated' &&
        model.library.place._tag === 'Shelf',
      'not on a populated shelf',
    ),
})

/** Opens a chart for playing. */
export const OpenedPlay = md('OpenedPlay', {
  fields: { songId: SongId },
  what: 'Opens a chart for playing',
  why: 'Triggered when the player plays a library member',
  tokens: ['play-song'],
  spoken: ['play song'],
  command: 'play-song',
  event: 'opened-play',
  mutate: 'place becomes chart playing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) =>
    model.library._tag === 'Populated' && model.library.place._tag === 'Shelf',
  hiddenBecause: (model: Model) =>
    hiddenUnless(
      model,
      model.library._tag === 'Populated' &&
        model.library.place._tag === 'Shelf',
      'not on a populated shelf',
    ),
})

/** Occupies an unknown path. */
export const OpenedUnknown = md('OpenedUnknown', {
  fields: { path: NonEmptyString },
  what: 'Opens an unknown path',
  why: 'Triggered when a deep link misses the library',
  tokens: ['unknown'],
  spoken: ['unknown'],
  command: 'unknown',
  event: 'opened-unknown',
  mutate: 'place becomes unknown',
  sideEffects: '(none)',
  valid: () => true,
})

/** Asks to delete a library member. */
export const RequestedDelete = md('RequestedDelete', {
  fields: { songId: SongId },
  what: 'Asks to delete a library member',
  why: 'Triggered when the player starts delete on the shelf',
  tokens: ['delete'],
  spoken: ['delete'],
  command: 'delete',
  event: 'requested-delete',
  mutate: 'deleting becomes confirming',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) =>
    model.library._tag === 'Populated' &&
    model.library.place._tag === 'Shelf' &&
    model.library.place.deleting._tag === 'Idle',
  hiddenBecause: (model: Model) =>
    hiddenUnless(
      model,
      model.library._tag === 'Populated' &&
        model.library.place._tag === 'Shelf' &&
        model.library.place.deleting._tag === 'Idle',
      'not idle on a populated shelf',
    ),
})

/** Cancels delete confirmation. */
export const CancelledDelete = md('CancelledDelete', {
  what: 'Cancels delete',
  why: 'Triggered when the player leaves confirming',
  keys: ['Escape'],
  tokens: ['cancel-delete'],
  spoken: ['cancel delete'],
  command: 'cancel-delete',
  event: 'cancelled-delete',
  mutate: 'deleting becomes idle',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isConfirming(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isConfirming(model), 'not confirming delete'),
})

/** Confirms delete of the held member. */
export const ConfirmedDelete = md('ConfirmedDelete', {
  what: 'Deletes the confirming member',
  why: 'Triggered when the player confirms delete',
  tokens: ['confirm-delete'],
  spoken: ['confirm delete'],
  command: 'confirm-delete',
  event: 'confirmed-delete',
  mutate: 'member leaves the library',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isConfirming(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isConfirming(model), 'not confirming delete'),
})

/** Switches the open chart to playing. */
export const ClickedPlay = md('ClickedPlay', {
  what: 'Plays the open chart',
  why: 'Triggered when the player opens play on a chart',
  keys: ['p'],
  tokens: ['play'],
  spoken: ['play'],
  command: 'play',
  event: 'clicked-play',
  mutate: 'use becomes playing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isEditing(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isEditing(model), 'not editing a chart'),
})

/** Switches the open chart to editing. */
export const ClickedEdit = md('ClickedEdit', {
  what: 'Edits the open chart',
  why: 'Triggered when the player leaves play',
  keys: ['e'],
  tokens: ['edit'],
  spoken: ['edit'],
  command: 'edit',
  event: 'clicked-edit',
  mutate: 'use becomes editing viewing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isPlaying(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isPlaying(model), 'not playing a chart'),
})

/** Raises transpose one semitone. */
export const ClickedTransposeUp = md('ClickedTransposeUp', {
  what: 'Raises transpose',
  why: 'Triggered when the player steps transpose up',
  tokens: ['transpose-up'],
  spoken: ['transpose up'],
  command: 'transpose-up',
  event: 'clicked-transpose-up',
  mutate: 'current transpose steps up',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isChart(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isChart(model), 'not on a chart'),
})

/** Lowers transpose one semitone. */
export const ClickedTransposeDown = md('ClickedTransposeDown', {
  what: 'Lowers transpose',
  why: 'Triggered when the player steps transpose down',
  tokens: ['transpose-down'],
  spoken: ['transpose down'],
  command: 'transpose-down',
  event: 'clicked-transpose-down',
  mutate: 'current transpose steps down',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isChart(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isChart(model), 'not on a chart'),
})

/** Raises capo one fret. */
export const ClickedCapoUp = md('ClickedCapoUp', {
  what: 'Raises capo',
  why: 'Triggered when the player steps capo up',
  tokens: ['capo-up'],
  spoken: ['capo up'],
  command: 'capo-up',
  event: 'clicked-capo-up',
  mutate: 'current capo steps up',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isChart(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isChart(model), 'not on a chart'),
})

/** Lowers capo one fret. */
export const ClickedCapoDown = md('ClickedCapoDown', {
  what: 'Lowers capo',
  why: 'Triggered when the player steps capo down',
  tokens: ['capo-down'],
  spoken: ['capo down'],
  command: 'capo-down',
  event: 'clicked-capo-down',
  mutate: 'current capo steps down',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isChart(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isChart(model), 'not on a chart'),
})

/** Asks to copy the open chart. */
export const ClickedCopy = md('ClickedCopy', {
  what: 'Copies the open chart',
  why: 'Triggered when the player asks for chart text',
  keys: ['c'],
  tokens: ['copy'],
  spoken: ['copy'],
  command: 'copy',
  event: 'clicked-copy',
  mutate: 'notice holds chart text',
  sideEffects: 'CopyChart',
  valid: (model: Model, _context: Context) => isChart(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isChart(model), 'not on a chart'),
})

/** Chart text is ready. */
export const SucceededCopiedChart = md('SucceededCopiedChart', {
  fields: { text: NonEmptyString },
  what: 'Records copied chart text',
  why: 'Triggered when CopyChart finishes',
  tokens: ['copied'],
  spoken: ['copied'],
  command: 'copied',
  event: 'succeeded-copied-chart',
  mutate: 'notice succeeded with chart text',
  sideEffects: '(none)',
  valid: () => false,
  hiddenBecause: () => 'command result',
})

/** Copying the chart failed. */
export const FailedCopiedChart = md('FailedCopiedChart', {
  fields: { reason: NonEmptyString },
  what: 'Records that copy failed',
  why: 'Triggered when CopyChart fails',
  tokens: ['copy-failed'],
  spoken: ['copy failed'],
  command: 'copy-failed',
  event: 'failed-copied-chart',
  mutate: 'notice failed',
  sideEffects: '(none)',
  valid: () => false,
  hiddenBecause: () => 'command result',
})

/** Dismisses the notice. */
export const DismissedNotice = md('DismissedNotice', {
  what: 'Dismisses the notice',
  why: 'Triggered when the player clears a notice',
  tokens: ['dismiss'],
  spoken: ['dismiss'],
  command: 'dismiss',
  event: 'dismissed-notice',
  mutate: 'notice none',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => model.notice._tag === 'Some',
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, model.notice._tag === 'Some', 'no notice'),
})

/** Types a shelf search query. */
export const TypedSearch = md('TypedSearch', {
  fields: { looking: Looking },
  what: 'Types a search query',
  why: 'Triggered when the player searches the shelf',
  tokens: ['search'],
  spoken: ['search'],
  command: 'search',
  event: 'typed-search',
  mutate: 'looking idle or searching',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isShelf(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isShelf(model), 'not on the shelf'),
})

/** Clears the search query. */
export const ClearedSearch = md('ClearedSearch', {
  what: 'Clears search',
  why: 'Triggered when the player leaves searching',
  tokens: ['clear-search'],
  spoken: ['clear search'],
  command: 'clear-search',
  event: 'cleared-search',
  mutate: 'looking idle',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isSearching(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isSearching(model), 'not searching'),
})

/** Names the current song. */
export const NamedTitle = md('NamedTitle', {
  fields: { name: NonEmptyString },
  what: 'Names the current song',
  why: 'Triggered when the player sets a title',
  tokens: ['title'],
  spoken: ['title'],
  command: 'title',
  event: 'named-title',
  mutate: 'current title named',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isEditing(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isEditing(model), 'not editing a chart'),
})

/** Clears the current title. */
export const ClearedTitle = md('ClearedTitle', {
  what: 'Clears the title',
  why: 'Triggered when the player marks the song untitled',
  tokens: ['untitled'],
  spoken: ['untitled'],
  command: 'untitled',
  event: 'cleared-title',
  mutate: 'current title untitled',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isEditing(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isEditing(model), 'not editing a chart'),
})

/** Names the current artist. */
export const NamedArtist = md('NamedArtist', {
  fields: { name: NonEmptyString },
  what: 'Names the current artist',
  why: 'Triggered when the player sets an artist',
  tokens: ['artist'],
  spoken: ['artist'],
  command: 'artist',
  event: 'named-artist',
  mutate: 'current artist some',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isEditing(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isEditing(model), 'not editing a chart'),
})

/** Clears the current artist. */
export const ClearedArtist = md('ClearedArtist', {
  what: 'Clears the artist',
  why: 'Triggered when the player removes the artist',
  tokens: ['artist-clear'],
  spoken: ['clear artist'],
  command: 'artist-clear',
  event: 'cleared-artist',
  mutate: 'current artist none',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isEditing(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isEditing(model), 'not editing a chart'),
})

/** Sets the original key. */
export const ChoseKey = md('ChoseKey', {
  fields: { pitch: Pitch },
  what: 'Sets the original key',
  why: 'Triggered when the player picks a pitch',
  tokens: ['key'],
  spoken: ['key'],
  command: 'key',
  event: 'chose-key',
  mutate: 'current key some',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isEditing(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isEditing(model), 'not editing a chart'),
})

/** Clears the original key. */
export const ClearedKey = md('ClearedKey', {
  what: 'Clears the original key',
  why: 'Triggered when the player removes the key',
  tokens: ['key-clear'],
  spoken: ['clear key'],
  command: 'key-clear',
  event: 'cleared-key',
  mutate: 'current key none',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isEditing(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isEditing(model), 'not editing a chart'),
})

/** Adds a section of a named kind. */
export const AddedSection = md('AddedSection', {
  fields: { kind: SectionKind },
  what: 'Adds a section',
  why: 'Triggered when the player adds a named section',
  tokens: ['add'],
  spoken: ['add'],
  command: 'add',
  event: 'added-section',
  mutate: 'current sections gain a member',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isViewing(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isViewing(model), 'not viewing a chart'),
})

/** Opens lyrics of a section member. */
export const OpenedLyrics = md('OpenedLyrics', {
  fields: { sectionId: NonEmptyString },
  what: 'Opens lyrics of a section',
  why: 'Triggered when the player edits lyrics',
  tokens: ['lyrics'],
  spoken: ['lyrics'],
  command: 'lyrics',
  event: 'opened-lyrics',
  mutate: 'focus lyrics',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isViewing(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isViewing(model), 'not viewing a chart'),
})

/** Types lyrics draft text. */
export const TypedLyrics = md('TypedLyrics', {
  fields: { draft: Draft },
  what: 'Types lyrics',
  why: 'Triggered when the player changes the lyrics draft',
  tokens: ['draft'],
  spoken: ['draft'],
  command: 'draft',
  event: 'typed-lyrics',
  mutate: 'lyrics draft text',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isLyrics(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isLyrics(model), 'not editing lyrics'),
})

/** Applies the lyrics draft. */
export const AppliedLyrics = md('AppliedLyrics', {
  what: 'Applies lyrics',
  why: 'Triggered when the player keeps the lyrics draft',
  tokens: ['apply-lyrics'],
  spoken: ['apply lyrics'],
  command: 'apply-lyrics',
  event: 'applied-lyrics',
  mutate: 'section lyrics replaced, focus viewing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isLyrics(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isLyrics(model), 'not editing lyrics'),
})

/** Cancels lyrics editing. */
export const CancelledLyrics = md('CancelledLyrics', {
  what: 'Cancels lyrics',
  why: 'Triggered when the player leaves the lyrics draft',
  tokens: ['cancel-lyrics'],
  spoken: ['cancel lyrics'],
  command: 'cancel-lyrics',
  event: 'cancelled-lyrics',
  mutate: 'focus viewing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isLyrics(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isLyrics(model), 'not editing lyrics'),
})

/** Focuses a word member. */
export const OpenedWord = md('OpenedWord', {
  fields: { wordId: NonEmptyString },
  what: 'Focuses a lyric word',
  why: 'Triggered when the player places a chord',
  tokens: ['word'],
  spoken: ['word'],
  command: 'word',
  event: 'opened-word',
  mutate: 'focus word',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isViewing(model) || isWord(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(
      model,
      isViewing(model) || isWord(model),
      'not viewing or placing a chord',
    ),
})

/** Types a chord draft. */
export const TypedChord = md('TypedChord', {
  fields: { draft: Draft },
  what: 'Types a chord name',
  why: 'Triggered when the player types a chord',
  tokens: ['chord'],
  spoken: ['chord'],
  command: 'chord',
  event: 'typed-chord',
  mutate: 'places a sounding or silent chord',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isWord(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isWord(model), 'not placing a chord'),
})

/** Clears the chord on the focused word. */
export const ClearedChord = md('ClearedChord', {
  what: 'Clears the focused chord',
  why: 'Triggered when the player removes a placed chord',
  tokens: ['clear-chord'],
  spoken: ['clear chord'],
  command: 'clear-chord',
  event: 'cleared-chord',
  mutate: 'chord gone, focus viewing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isWord(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isWord(model), 'not placing a chord'),
})

/** Leaves word focus. */
export const CancelledWord = md('CancelledWord', {
  what: 'Leaves word focus',
  why: 'Triggered when the player stops placing a chord',
  tokens: ['view'],
  spoken: ['view'],
  command: 'view',
  event: 'cancelled-word',
  mutate: 'focus viewing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isWord(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isWord(model), 'not placing a chord'),
})

/** Asks to remove a section member. */
export const RequestedRemove = md('RequestedRemove', {
  fields: { sectionId: NonEmptyString },
  what: 'Asks to remove a section',
  why: 'Triggered when the player starts removing a section',
  tokens: ['remove'],
  spoken: ['remove'],
  command: 'remove',
  event: 'requested-remove',
  mutate: 'focus removing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isViewing(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isViewing(model), 'not viewing a chart'),
})

/** Cancels section removal. */
export const CancelledRemove = md('CancelledRemove', {
  what: 'Cancels section removal',
  why: 'Triggered when the player leaves removing',
  tokens: ['cancel-remove'],
  spoken: ['cancel remove'],
  command: 'cancel-remove',
  event: 'cancelled-remove',
  mutate: 'focus viewing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isRemoving(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isRemoving(model), 'not removing a section'),
})

/** Confirms section removal. */
export const ConfirmedRemove = md('ConfirmedRemove', {
  what: 'Removes the focused section',
  why: 'Triggered when the player confirms section removal',
  tokens: ['confirm-remove'],
  spoken: ['confirm remove'],
  command: 'confirm-remove',
  event: 'confirmed-remove',
  mutate: 'section gone, focus viewing',
  sideEffects: '(none)',
  valid: (model: Model, _context: Context) => isRemoving(model),
  hiddenBecause: (model: Model) =>
    hiddenUnless(model, isRemoving(model), 'not removing a section'),
})

/** Static Actions projected through Program.valid. */
export const actions = [
  ClickedNew,
  ClickedShelf,
  CancelledDelete,
  ConfirmedDelete,
  ClickedPlay,
  ClickedEdit,
  ClickedTransposeUp,
  ClickedTransposeDown,
  ClickedCapoUp,
  ClickedCapoDown,
  ClickedCopy,
  DismissedNotice,
  ClearedSearch,
  ClearedTitle,
  ClearedArtist,
  ClearedKey,
  AppliedLyrics,
  CancelledLyrics,
  ClearedChord,
  CancelledWord,
  CancelledRemove,
  ConfirmedRemove,
] as const

/** One constructor from {@link actions}. */
export type Action = (typeof actions)[number]

/** Finds a constructor by its CLI token. */
export const actionByToken = (token: string): Action | undefined => {
  const maybeAction = Array.findFirst(actions, action =>
    Array.contains(action.tokens ?? [], token),
  )
  if (Option.isSome(maybeAction)) {
    return maybeAction.value
  }
  return undefined
}

/** Token printed for a constructor. */
export const tokenOf = (action: Action): string =>
  Option.getOrElse(Array.head(action.tokens ?? []), () => action.command ?? '')

const afterPrefix = (token: string, prefix: string): Option.Option<string> => {
  if (!token.startsWith(prefix)) {
    return Option.none()
  }
  const rest = token.slice(prefix.length)
  if (Str.isEmpty(rest)) {
    return Option.none()
  }
  return Option.some(rest)
}

const SECTION_KINDS: ReadonlyArray<SectionKind> = [
  'Intro',
  'Verse',
  'PreChorus',
  'Chorus',
  'Bridge',
  'Solo',
  'Outro',
  'Instrumental',
]

const kindOf = (name: string): Option.Option<SectionKind> =>
  Array.findFirst(SECTION_KINDS, kind => kind === name)

/** Songbook Message union. */
export const Message = S.Union([
  ClickedNew,
  SucceededGeneratedIds,
  FailedGeneratedIds,
  ClickedShelf,
  OpenedChart,
  OpenedPlay,
  OpenedUnknown,
  RequestedDelete,
  CancelledDelete,
  ConfirmedDelete,
  ClickedPlay,
  ClickedEdit,
  ClickedTransposeUp,
  ClickedTransposeDown,
  ClickedCapoUp,
  ClickedCapoDown,
  ClickedCopy,
  SucceededCopiedChart,
  FailedCopiedChart,
  DismissedNotice,
  TypedSearch,
  ClearedSearch,
  NamedTitle,
  ClearedTitle,
  NamedArtist,
  ClearedArtist,
  ChoseKey,
  ClearedKey,
  AddedSection,
  OpenedLyrics,
  TypedLyrics,
  AppliedLyrics,
  CancelledLyrics,
  OpenedWord,
  TypedChord,
  ClearedChord,
  CancelledWord,
  RequestedRemove,
  CancelledRemove,
  ConfirmedRemove,
])
/** Songbook Message union. */
export type Message = typeof Message.Type

/** CLI what-sentence for a token on the current tree. */
export const whatForToken = (token: string): string => {
  const action = actionByToken(token)
  if (action !== undefined) {
    return action.doc.what
  }
  if (token.startsWith('open:')) {
    return 'Opens a chart for editing'
  }
  if (token.startsWith('play:')) {
    return 'Opens a chart for playing'
  }
  if (token.startsWith('delete:')) {
    return 'Asks to delete a library member'
  }
  if (token.startsWith('unknown:')) {
    return 'Opens an unknown path'
  }
  if (token.startsWith('search:')) {
    return 'Types a search query'
  }
  if (token.startsWith('title:')) {
    return 'Names the current song'
  }
  if (token.startsWith('artist:')) {
    return 'Names the current artist'
  }
  if (token.startsWith('key:')) {
    return 'Sets the original key'
  }
  if (token.startsWith('add:')) {
    return 'Adds a section'
  }
  if (token.startsWith('lyrics:')) {
    return 'Opens lyrics of a section'
  }
  if (token.startsWith('draft:')) {
    return 'Types lyrics'
  }
  if (token.startsWith('word:')) {
    return 'Focuses a lyric word'
  }
  if (token.startsWith('chord:')) {
    return 'Places a chord on the focused word'
  }
  if (token.startsWith('remove:')) {
    return 'Asks to remove a section'
  }
  return token
}

/**
 * Resolves a screen Button token against the current Model.
 * Parameterized tokens carry their payload after `:`.
 */
const messageFromAction = (action: Action): Message | undefined => {
  const command = action.command ?? tokenOf(action)
  if (command === 'new') {
    return ClickedNew()
  }
  if (command === 'shelf') {
    return ClickedShelf()
  }
  if (command === 'cancel-delete') {
    return CancelledDelete()
  }
  if (command === 'confirm-delete') {
    return ConfirmedDelete()
  }
  if (command === 'play') {
    return ClickedPlay()
  }
  if (command === 'edit') {
    return ClickedEdit()
  }
  if (command === 'transpose-up') {
    return ClickedTransposeUp()
  }
  if (command === 'transpose-down') {
    return ClickedTransposeDown()
  }
  if (command === 'capo-up') {
    return ClickedCapoUp()
  }
  if (command === 'capo-down') {
    return ClickedCapoDown()
  }
  if (command === 'copy') {
    return ClickedCopy()
  }
  if (command === 'dismiss') {
    return DismissedNotice()
  }
  if (command === 'clear-search') {
    return ClearedSearch()
  }
  if (command === 'untitled') {
    return ClearedTitle()
  }
  if (command === 'artist-clear') {
    return ClearedArtist()
  }
  if (command === 'key-clear') {
    return ClearedKey()
  }
  if (command === 'apply-lyrics') {
    return AppliedLyrics()
  }
  if (command === 'cancel-lyrics') {
    return CancelledLyrics()
  }
  if (command === 'clear-chord') {
    return ClearedChord()
  }
  if (command === 'view') {
    return CancelledWord()
  }
  if (command === 'cancel-remove') {
    return CancelledRemove()
  }
  if (command === 'confirm-remove') {
    return ConfirmedRemove()
  }
  return undefined
}

export const messageFromToken = (
  token: string,
  model: Model,
): Message | undefined => {
  const action = actionByToken(token)
  if (action !== undefined) {
    if (!action.valid(model, {})) {
      return undefined
    }
    return messageFromAction(action)
  }
  const maybeOpen = afterPrefix(token, 'open:')
  if (Option.isSome(maybeOpen)) {
    return OpenedChart({ songId: SongId.make(maybeOpen.value) })
  }
  const maybePlay = afterPrefix(token, 'play:')
  if (Option.isSome(maybePlay)) {
    return OpenedPlay({ songId: SongId.make(maybePlay.value) })
  }
  const maybeDelete = afterPrefix(token, 'delete:')
  if (Option.isSome(maybeDelete)) {
    return RequestedDelete({ songId: SongId.make(maybeDelete.value) })
  }
  const maybeUnknown = afterPrefix(token, 'unknown:')
  if (Option.isSome(maybeUnknown)) {
    return OpenedUnknown({ path: NonEmptyString.make(maybeUnknown.value) })
  }
  if (token.startsWith('search:')) {
    const rest = token.slice('search:'.length)
    if (Str.isEmpty(rest)) {
      return TypedSearch({ looking: Idle() })
    }
    return TypedSearch({
      looking: Searching.make({ query: NonEmptyString.make(rest) }),
    })
  }
  if (token.startsWith('title:')) {
    const rest = token.slice('title:'.length)
    if (Str.isEmpty(rest)) {
      return ClearedTitle()
    }
    return NamedTitle({ name: NonEmptyString.make(rest) })
  }
  if (token.startsWith('artist:')) {
    const rest = token.slice('artist:'.length)
    if (Str.isEmpty(rest)) {
      return ClearedArtist()
    }
    return NamedArtist({ name: NonEmptyString.make(rest) })
  }
  const maybeKey = afterPrefix(token, 'key:')
  if (Option.isSome(maybeKey)) {
    return Option.match(parsePitch(maybeKey.value), {
      onNone: () => undefined,
      onSome: pitch => ChoseKey({ pitch }),
    })
  }
  const maybeAdd = afterPrefix(token, 'add:')
  if (Option.isSome(maybeAdd)) {
    return Option.match(kindOf(maybeAdd.value), {
      onNone: () => undefined,
      onSome: kind => AddedSection({ kind }),
    })
  }
  const maybeLyrics = afterPrefix(token, 'lyrics:')
  if (Option.isSome(maybeLyrics)) {
    return OpenedLyrics({ sectionId: NonEmptyString.make(maybeLyrics.value) })
  }
  if (token.startsWith('draft:')) {
    return TypedLyrics({ draft: draftFromText(token.slice('draft:'.length)) })
  }
  const maybeWord = afterPrefix(token, 'word:')
  if (Option.isSome(maybeWord)) {
    return OpenedWord({ wordId: NonEmptyString.make(maybeWord.value) })
  }
  if (token.startsWith('chord:')) {
    return TypedChord({ draft: draftFromText(token.slice('chord:'.length)) })
  }
  const maybeRemove = afterPrefix(token, 'remove:')
  if (Option.isSome(maybeRemove)) {
    return RequestedRemove({
      sectionId: NonEmptyString.make(maybeRemove.value),
    })
  }
  return undefined
}

export {
  chartOf,
  isChart,
  isConfirming,
  isEditing,
  isLyrics,
  isPlaying,
  isRemoving,
  isSearching,
  isShelf,
  isUnknown,
  isViewing,
  isWord,
  kindOf,
  parseChord,
  parsePitch,
  songsOfPopulated,
}

export type { Chord, Pitch, SectionKind }
