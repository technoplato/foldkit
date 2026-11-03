import {
  Array,
  Cause,
  Deferred,
  Duration,
  Effect,
  Match as M,
  Option,
  Order,
  Queue,
  Record,
  Ref,
  Schedule,
  type Scope,
  Stream,
} from 'effect'
import {
  type AudioPlayerEvent,
  type AudioPlayerHandle,
  type BufferedRange,
  COPY_ROW_PAGE,
  type CompressedCopy,
  type CompressedCopyReader,
  type CopyAudioSource,
  type CopySegment,
  type CopyStep,
  HeardAudioError,
  nextCopyStep,
} from 'words-core-example'

import { handleOf } from './audio.js'

type CopySource = typeof CopyAudioSource.Type

/** Each step of opening, and each read, download, and append, is bounded at 5 s. */
const STEP_TIMEOUT = Duration.seconds(5)
const STEP_RETRIES = 2
const STEP_RETRY_SPACING = Duration.seconds(1)
/** A step asked again and again without changing anything waits this long, then fails at the limit. */
const REPEAT_PAUSE = Duration.seconds(1)
const REPEATS_BEFORE_PAUSE = 3
const REPEATS_BEFORE_FAILURE = 10
const WAKE_EVENTS: ReadonlyArray<string> = [
  'timeupdate',
  'seeking',
  'play',
  'pause',
  'waiting',
]
const STREAMING_EVENTS: ReadonlyArray<string> = [
  'startstreaming',
  'endstreaming',
]

type MediaSourceConstructor = {
  new (): MediaSource
  readonly isTypeSupported: (type: string) => boolean
}

/**
 * The page's Media Source: Safari's ManagedMediaSource where it exists (the
 * only one an iPhone has, from iOS 17.1), else the standard MediaSource.
 */
const isMediaSourceConstructor = (
  value: unknown,
): value is MediaSourceConstructor =>
  typeof value === 'function' && 'isTypeSupported' in value

const globalConstructorOf = (
  name: string,
): Option.Option<MediaSourceConstructor> =>
  Option.filter(
    Option.fromNullishOr<unknown>(Reflect.get(globalThis, name)),
    isMediaSourceConstructor,
  )

const mediaSourceConstructorOf = (): Option.Option<MediaSourceConstructor> =>
  Option.orElse(globalConstructorOf('ManagedMediaSource'), () =>
    globalConstructorOf('MediaSource'),
  )

const errorOf = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause))

const listenTo = (
  target: EventTarget,
  types: ReadonlyArray<string>,
  listener: () => void,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      for (const type of types) {
        target.addEventListener(type, listener)
      }
    }),
    () =>
      Effect.sync(() => {
        for (const type of types) {
          target.removeEventListener(type, listener)
        }
      }),
  )

/**
 * Starts listening for `type` now, before whatever causes it; the Effect it
 * returns waits for it, or fails on `failureType`.
 */
const listenForEvent = (
  target: EventTarget,
  type: string,
  failureType: Option.Option<string>,
  failure: string,
): Effect.Effect<Effect.Effect<void, Error>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const happened = yield* Deferred.make<void, Error>()
    yield* listenTo(target, [type], () => {
      Deferred.doneUnsafe(happened, Effect.void)
    })
    if (Option.isSome(failureType)) {
      yield* listenTo(target, [failureType.value], () => {
        Deferred.doneUnsafe(happened, Effect.fail(new Error(failure)))
      })
    }
    return Deferred.await(happened)
  })

const settled = (sourceBuffer: SourceBuffer): Effect.Effect<void, Error> =>
  sourceBuffer.updating
    ? Effect.callback<void, Error>(resume => {
        const handleEnd = () => {
          sourceBuffer.removeEventListener('updateend', handleEnd)
          resume(Effect.void)
        }
        sourceBuffer.addEventListener('updateend', handleEnd)
        return Effect.sync(() =>
          sourceBuffer.removeEventListener('updateend', handleEnd),
        )
      })
    : Effect.void

/** Runs one SourceBuffer change and waits for the browser to finish it. */
const changeBuffer = (
  sourceBuffer: SourceBuffer,
  change: () => void,
): Effect.Effect<void, Error> =>
  settled(sourceBuffer).pipe(
    Effect.flatMap(() =>
      Effect.callback<void, Error>(resume => {
        const handleEnd = () => {
          detach()
          resume(Effect.void)
        }
        const handleError = () => {
          detach()
          resume(
            Effect.fail(new Error('The browser could not take the audio.')),
          )
        }
        const detach = () => {
          sourceBuffer.removeEventListener('updateend', handleEnd)
          sourceBuffer.removeEventListener('error', handleError)
        }
        sourceBuffer.addEventListener('updateend', handleEnd)
        sourceBuffer.addEventListener('error', handleError)
        try {
          change()
        } catch (cause) {
          detach()
          resume(Effect.fail(errorOf(cause)))
        }
        return Effect.sync(detach)
      }),
    ),
  )

// NOTE: Effect's Array.makeBy makes at least one element, and an empty
// TimeRanges throws on start(0), so an empty buffer is answered first.
/** The stretches a browser's TimeRanges hold, in order; none for an empty one. */
export const bufferedRangesOf = (
  ranges: Pick<TimeRanges, 'length' | 'start' | 'end'>,
): ReadonlyArray<BufferedRange> =>
  ranges.length === 0
    ? Array.empty()
    : Array.makeBy(ranges.length, index => ({
        startSeconds: ranges.start(index),
        endSeconds: ranges.end(index),
      }))

const bufferedOf = (sourceBuffer: SourceBuffer): ReadonlyArray<BufferedRange> =>
  bufferedRangesOf(sourceBuffer.buffered)

/**
 * A plain GET, so the browser sends no preflight: Instant's file host answers
 * GET with `Access-Control-Allow-Origin: *` and refuses OPTIONS.
 */
const download = (
  url: string,
  maybeByteCount: Option.Option<number>,
): Effect.Effect<ArrayBuffer, Error> =>
  Effect.tryPromise({
    try: () =>
      fetch(url).then(response =>
        response.ok
          ? response.arrayBuffer()
          : Promise.reject(
              new Error(`The audio download answered ${response.status}.`),
            ),
      ),
    catch: errorOf,
  }).pipe(
    Effect.flatMap(bytes =>
      Option.exists(maybeByteCount, count => count !== bytes.byteLength)
        ? Effect.fail(
            new Error(
              `A segment of the live audio arrived as ${bytes.byteLength} bytes, not ${Option.getOrElse(maybeByteCount, () => 0)}.`,
            ),
          )
        : Effect.succeed(bytes),
    ),
  )

const bounded = <A>(
  effect: Effect.Effect<A, Error>,
  what: string,
): Effect.Effect<A, Error> =>
  effect.pipe(
    Effect.timeout(STEP_TIMEOUT),
    Effect.catchTag('TimeoutError', () =>
      Effect.fail(new Error(`${what} took more than 5 seconds.`)),
    ),
    Effect.retry({
      times: STEP_RETRIES,
      schedule: Schedule.spaced(STEP_RETRY_SPACING),
    }),
  )

/** What the player holds while it streams one copy. */
type Feeder = Readonly<{
  source: CopySource
  reader: CompressedCopyReader
  element: HTMLAudioElement
  mediaSource: MediaSource
  sourceBuffer: SourceBuffer
  copy: Ref.Ref<Option.Option<CompressedCopy>>
  knownSegments: Ref.Ref<ReadonlyArray<CopySegment>>
  urls: Ref.Ref<Readonly<Record<string, string>>>
  repeats: Ref.Ref<Readonly<{ key: string; count: number }>>
  wake: Queue.Queue<void>
}>

const wakeFeeder = (feeder: Feeder): void => {
  Queue.offerUnsafe(feeder.wake, undefined)
}

/**
 * The browser's length for the copy: endless while it records, with the
 * stored stretch seekable, so playing on reaches each new segment instead of
 * ending; the copy's length once it is finished.
 */
const syncLength = (
  feeder: Feeder,
  copy: CompressedCopy,
): Effect.Effect<void> =>
  Effect.sync(() => {
    const { mediaSource, sourceBuffer } = feeder
    if (mediaSource.readyState !== 'open' || sourceBuffer.updating) {
      return
    } else if (copy.isFinished) {
      const heldEnd = Array.reduce(bufferedOf(sourceBuffer), 0, (end, range) =>
        Math.max(end, range.endSeconds),
      )
      const length = Math.max(copy.durationSeconds, heldEnd)
      if (
        !Number.isFinite(mediaSource.duration) ||
        Math.abs(mediaSource.duration - length) > 0.01
      ) {
        mediaSource.duration = length
      }
    } else {
      if (mediaSource.duration !== Number.POSITIVE_INFINITY) {
        mediaSource.duration = Number.POSITIVE_INFINITY
      }
      if ('setLiveSeekableRange' in mediaSource) {
        mediaSource.setLiveSeekableRange(0, copy.durationSeconds)
      }
    }
  })

const bySegmentIndex = Order.mapInput(
  Order.Number,
  (segment: CopySegment) => segment.index,
)

const mergedSegments = (
  known: ReadonlyArray<CopySegment>,
  read: ReadonlyArray<CopySegment>,
): ReadonlyArray<CopySegment> =>
  Array.dedupeWith(
    Array.sort([...read, ...known], bySegmentIndex),
    (first, second) => first.index === second.index,
  )

const readRows = (
  feeder: Feeder,
  fromIndex: number,
  toIndex: number,
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const read = yield* bounded(
      feeder.reader.readSegments(feeder.source.streamID, fromIndex, toIndex),
      'Reading the live audio',
    )
    const before = yield* Ref.get(feeder.knownSegments)
    const after = mergedSegments(before, read)
    yield* Ref.set(feeder.knownSegments, after)
    if (after.length === before.length) {
      yield* Effect.sleep(REPEAT_PAUSE)
    }
  })

const urlFor = (
  feeder: Feeder,
  segment: CopySegment,
): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    const cached = Record.get(yield* Ref.get(feeder.urls), segment.path)
    if (Option.isSome(cached)) {
      return cached.value
    } else {
      const known = yield* Ref.get(feeder.knownSegments)
      const paths = Array.map(
        Array.take(
          Array.filter(known, row => row.index >= segment.index),
          COPY_ROW_PAGE,
        ),
        row => row.path,
      )
      const read = yield* bounded(
        feeder.reader.readFileUrls(
          Array.contains(paths, segment.path) ? paths : [segment.path],
        ),
        'Finding the live audio',
      )
      yield* Ref.update(feeder.urls, urls => ({ ...urls, ...read }))
      return yield* Option.match(Record.get(read, segment.path), {
        onNone: () =>
          Effect.fail(
            new Error(
              `Segment ${segment.index} of the live audio has no file yet.`,
            ),
          ),
        onSome: url => Effect.succeed(url),
      })
    }
  })

const appendSegment = (
  feeder: Feeder,
  segment: CopySegment,
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const url = yield* urlFor(feeder, segment)
    const bytes = yield* bounded(
      download(url, Option.some(segment.byteCount)),
      'Downloading the live audio',
    )
    yield* bounded(
      changeBuffer(feeder.sourceBuffer, () =>
        feeder.sourceBuffer.appendBuffer(bytes),
      ),
      'Handing the live audio to the browser',
    )
  })

const removeAudio = (
  feeder: Feeder,
  startSeconds: number,
  endSeconds: number,
): Effect.Effect<void, Error> =>
  bounded(
    changeBuffer(feeder.sourceBuffer, () =>
      feeder.sourceBuffer.remove(startSeconds, endSeconds),
    ),
    'Freeing played audio',
  )

const endAudio = (feeder: Feeder): Effect.Effect<void, Error> =>
  settled(feeder.sourceBuffer).pipe(
    Effect.flatMap(() =>
      Effect.try({
        try: () => {
          if (feeder.mediaSource.readyState === 'open') {
            feeder.mediaSource.endOfStream()
          }
        },
        catch: errorOf,
      }),
    ),
  )

const stepKeyOf = (step: CopyStep): string => JSON.stringify(step)

/**
 * Why the feeder stopped, in words: its own failure's message, or what the
 * browser threw, so a stop is never silent.
 */
const stoppedReasonOf = (cause: Cause.Cause<Error>): string => {
  const error = errorOf(Cause.squash(cause))
  return Cause.hasFails(cause)
    ? error.message
    : `The live audio stopped: ${error.message}`
}

/**
 * A step that comes back unchanged means the browser did not do what the
 * last one asked (it dropped the segment again, or kept what it was told to
 * free): after a few, wait a second between tries; after ten, stop loudly.
 */
const checkRepeat = (
  feeder: Feeder,
  step: CopyStep,
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const key = stepKeyOf(step)
    const previous = yield* Ref.get(feeder.repeats)
    const count = previous.key === key ? previous.count + 1 : 1
    yield* Ref.set(feeder.repeats, { key, count })
    if (count >= REPEATS_BEFORE_FAILURE) {
      return yield* Effect.fail(
        new Error(
          'The live audio stopped: the browser did not keep what it was given.',
        ),
      )
    } else if (count >= REPEATS_BEFORE_PAUSE) {
      yield* Effect.sleep(REPEAT_PAUSE)
    }
  })

const runStep = (feeder: Feeder, step: CopyStep): Effect.Effect<void, Error> =>
  M.value(step).pipe(
    M.withReturnType<Effect.Effect<void, Error>>(),
    M.tagsExhaustive({
      ReadCopySegments: ({ fromIndex, toIndex }) =>
        readRows(feeder, fromIndex, toIndex),
      AppendCopySegment: ({ segment }) => appendSegment(feeder, segment),
      RemoveCopyAudio: ({ startSeconds, endSeconds }) =>
        removeAudio(feeder, startSeconds, endSeconds),
      EndCopyAudio: () => endAudio(feeder),
      AwaitCopyChange: () => Queue.take(feeder.wake),
    }),
  )

/** One turn of the feeder: the browser's length, then the next step (core's pure `nextCopyStep`). */
const feedOnce = (feeder: Feeder): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const maybeCopy = yield* Ref.get(feeder.copy)
    if (Option.isNone(maybeCopy)) {
      return yield* Queue.take(feeder.wake)
    } else {
      yield* syncLength(feeder, maybeCopy.value)
      const step = nextCopyStep({
        positionSeconds: feeder.element.currentTime,
        isPlaying: !feeder.element.paused,
        buffered: bufferedOf(feeder.sourceBuffer),
        knownSegments: yield* Ref.get(feeder.knownSegments),
        copy: maybeCopy.value,
        isEnded: feeder.mediaSource.readyState === 'ended',
      })
      if (step._tag !== 'AwaitCopyChange') {
        yield* checkRepeat(feeder, step)
      }
      return yield* runStep(feeder, step)
    }
  })

/**
 * Opens a recording's compressed copy (Scribe ADR 0091) in an audio element
 * fed through Media Source Extensions: the initialization segment, then 6 s
 * segments around the listener, read and downloaded as they are needed and
 * appended at their own times, while the copy's row says how far it reaches.
 * A recording in progress plays on into each segment as it is stored. Any
 * read, download, or append that fails three times, 5 s each, stops the
 * player with the reason, and the page offers Retry.
 */
export const openCopyAudio = (
  source: CopySource,
  reader: CompressedCopyReader,
): Effect.Effect<AudioPlayerHandle, Error, Scope.Scope> =>
  Effect.gen(function* () {
    const MediaSourceType = yield* Option.match(mediaSourceConstructorOf(), {
      onNone: () =>
        Effect.fail(
          new Error(
            'This browser cannot stream the live audio. It plays here once the recording stops.',
          ),
        ),
      onSome: constructor => Effect.succeed(constructor),
    })
    const mimeType = `audio/mp4; codecs="${source.codecs}"`
    if (!MediaSourceType.isTypeSupported(mimeType)) {
      return yield* Effect.fail(
        new Error(
          'This browser cannot play the live audio. It plays here once the recording stops.',
        ),
      )
    }
    const element = new Audio()
    element.disableRemotePlayback = true
    element.preload = 'auto'
    const mediaSource = new MediaSourceType()
    const objectURL = URL.createObjectURL(mediaSource)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        element.pause()
        element.removeAttribute('src')
        element.load()
        URL.revokeObjectURL(objectURL)
      }),
    )
    const sourceOpened = yield* listenForEvent(
      mediaSource,
      'sourceopen',
      Option.none(),
      'The browser could not open the live audio.',
    )
    element.src = objectURL
    yield* bounded(sourceOpened, 'Opening the live audio')
    // NOTE: an MP4 SourceBuffer places each segment at the time its own
    // header names (its tfdt), so a segment appended out of order, after a
    // seek, still lands at its place in the recording.
    const sourceBuffer = yield* Effect.try({
      try: () => mediaSource.addSourceBuffer(mimeType),
      catch: errorOf,
    })

    const copy = yield* Ref.make<Option.Option<CompressedCopy>>(Option.none())
    const firstCopy = yield* Deferred.make<CompressedCopy>()
    const wake = yield* Queue.sliding<void>(1)
    const failures = yield* Queue.unbounded<AudioPlayerEvent>()
    yield* Effect.forkScoped(
      reader.observeCopy(source.streamID).pipe(
        Stream.runForEach(maybeCopy =>
          Option.match(maybeCopy, {
            onNone: () => Effect.void,
            onSome: next =>
              Effect.gen(function* () {
                yield* Ref.set(copy, Option.some(next))
                yield* Deferred.succeed(firstCopy, next)
                Queue.offerUnsafe(wake, undefined)
              }),
          }),
        ),
        Effect.catch(() => Effect.void),
      ),
    )
    const startingCopy = yield* bounded(
      Deferred.await(firstCopy),
      'Finding the live audio',
    )
    const initializationURLs = yield* bounded(
      reader.readFileUrls([source.initializationPath]),
      'Finding the live audio',
    )
    const initializationURL = yield* Option.match(
      Record.get(initializationURLs, source.initializationPath),
      {
        onNone: () =>
          Effect.fail(new Error('The live audio has no first file yet.')),
        onSome: url => Effect.succeed(url),
      },
    )
    const initialization = yield* bounded(
      download(initializationURL, Option.none()),
      'Downloading the live audio',
    )
    const metadataLoaded = yield* listenForEvent(
      element,
      'loadedmetadata',
      Option.some('error'),
      'The browser could not read the live audio.',
    )
    yield* bounded(
      changeBuffer(sourceBuffer, () =>
        sourceBuffer.appendBuffer(initialization),
      ),
      'Handing the live audio to the browser',
    )

    const feeder: Feeder = {
      source,
      reader,
      element,
      mediaSource,
      sourceBuffer,
      copy,
      knownSegments: yield* Ref.make<ReadonlyArray<CopySegment>>([]),
      urls: yield* Ref.make<Readonly<Record<string, string>>>({
        [source.initializationPath]: initializationURL,
      }),
      repeats: yield* Ref.make({ key: '', count: 0 }),
      wake,
    }
    yield* syncLength(feeder, startingCopy)
    yield* bounded(metadataLoaded, 'Loading the live audio')
    yield* listenTo(element, WAKE_EVENTS, () => wakeFeeder(feeder))
    yield* listenTo(mediaSource, STREAMING_EVENTS, () => wakeFeeder(feeder))
    yield* listenTo(sourceBuffer, ['bufferedchange'], () => wakeFeeder(feeder))
    yield* Effect.forkScoped(
      Effect.forever(feedOnce(feeder)).pipe(
        Effect.catchCause(cause =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.sync(() => {
                Queue.offerUnsafe(
                  failures,
                  HeardAudioError({
                    reason: `${stoppedReasonOf(cause)} Retry to load it again.`,
                  }),
                )
              }),
        ),
      ),
    )
    return handleOf(element, Stream.fromQueue(failures))
  })
