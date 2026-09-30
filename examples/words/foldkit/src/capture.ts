import { Cause, Effect, Exit, Option, Queue, Schema as S, Stream } from 'effect'
import {
  Capture,
  type TranscriptionToken,
  type WordsOriginService,
} from 'words-core-example'

const TARGET_SAMPLE_RATE = 16_000
const CHUNK_SAMPLES = 1_600
const BYTES_PER_SAMPLE = 2
const WAV_HEADER_BYTES = 44
const SILENCE_DECIBELS = -60
const KEEP_ALIVE_MS = 4_000
const FINISH_TIMEOUT_MS = 5_000
const MAXIMUM_RECONNECT_DELAY_MS = 8_000
const UNAVAILABLE_RETRY_MS = 30_000
const DEEPGRAM_LISTEN_URL = 'wss://api.deepgram.com/v1/listen'

// NOTE: The processor runs on the audio rendering thread, which loads it as a
// module from a URL; a Blob URL keeps it inside this file and this bundle.
const captureWorkletSource = `
class ScribeCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.ratio = sampleRate / options.processorOptions.targetSampleRate
    this.chunkSamples = options.processorOptions.chunkSamples
    this.chunk = new Int16Array(this.chunkSamples)
    this.filled = 0
    this.sumSquares = 0
    this.accumulated = 0
    this.accumulatedCount = 0
    this.phase = 0
    this.isPaused = false
    this.port.onmessage = event => {
      if (event.data === 'pause') {
        this.isPaused = true
      } else if (event.data === 'resume') {
        this.isPaused = false
      } else if (event.data === 'flush') {
        this.post()
        this.port.postMessage({ isFlushed: true })
      }
    }
  }
  post() {
    if (this.filled > 0) {
      const pcm = this.chunk.slice(0, this.filled)
      const rms = Math.sqrt(this.sumSquares / this.filled)
      this.port.postMessage({ pcm: pcm.buffer, rms }, [pcm.buffer])
      this.filled = 0
      this.sumSquares = 0
    }
  }
  process(inputs) {
    const input = inputs[0]
    const channel = input === undefined ? undefined : input[0]
    if (channel === undefined || this.isPaused) {
      return true
    }
    for (let index = 0; index < channel.length; index += 1) {
      this.accumulated += channel[index]
      this.accumulatedCount += 1
      this.phase += 1
      if (this.phase >= this.ratio) {
        const sample = Math.max(-1, Math.min(1, this.accumulated / this.accumulatedCount))
        this.chunk[this.filled] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
        this.sumSquares += sample * sample
        this.filled += 1
        this.accumulated = 0
        this.accumulatedCount = 0
        this.phase -= this.ratio
        if (this.filled === this.chunkSamples) {
          this.post()
        }
      }
    }
    return true
  }
}
registerProcessor('scribe-capture', ScribeCaptureProcessor)
`

const WorkletChunk = S.Struct({
  pcm: S.instanceOf(ArrayBuffer),
  rms: S.Number,
})
const WorkletFlushed = S.Struct({ isFlushed: S.Literal(true) })

const DeepgramWord = S.Struct({
  word: S.String,
  punctuated_word: S.optionalKey(S.String),
  start: S.Number,
  end: S.Number,
  speaker: S.optionalKey(S.Number),
})
const DeepgramResults = S.Struct({
  type: S.Literal('Results'),
  is_final: S.Boolean,
  channel: S.Struct({
    alternatives: S.Array(S.Struct({ words: S.Array(DeepgramWord) })),
  }),
})
const decodeDeepgramResults = S.decodeUnknownOption(
  S.fromJsonString(DeepgramResults),
)

const levelOf = (rms: number): number => {
  const decibels = 20 * Math.log10(Math.max(rms, 1e-5))
  return Math.min(
    1,
    Math.max(0, (decibels - SILENCE_DECIBELS) / -SILENCE_DECIBELS),
  )
}

const microphoneFailureReason = (cause: unknown): string => {
  const name = cause instanceof DOMException ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'The browser did not allow the microphone. Allow it for words.knophy.com, then choose Try Again.'
  } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Connect one, then choose Try Again.'
  } else if (name === 'NotReadableError' || name === 'AbortError') {
    return 'Another app is using the microphone. Close it, then choose Try Again.'
  } else if (name === 'NotSupportedError') {
    return 'This browser cannot record from a microphone on this page.'
  } else {
    return cause instanceof Error
      ? `The microphone could not open: ${cause.message}`
      : 'The microphone could not open.'
  }
}

const wavHeaderOf = (dataBytes: number): ArrayBuffer => {
  const header = new DataView(new ArrayBuffer(WAV_HEADER_BYTES))
  const writeText = (offset: number, text: string) =>
    Array.from(text).forEach((character, index) =>
      header.setUint8(offset + index, character.charCodeAt(0)),
    )
  writeText(0, 'RIFF')
  header.setUint32(4, 36 + dataBytes, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  header.setUint32(16, 16, true)
  header.setUint16(20, 1, true)
  header.setUint16(22, 1, true)
  header.setUint32(24, TARGET_SAMPLE_RATE, true)
  header.setUint32(28, TARGET_SAMPLE_RATE * BYTES_PER_SAMPLE, true)
  header.setUint16(32, BYTES_PER_SAMPLE, true)
  header.setUint16(34, 16, true)
  writeText(36, 'data')
  header.setUint32(40, dataBytes, true)
  return header.buffer
}

const deepgramUrlOf = (token: TranscriptionToken): string =>
  `${DEEPGRAM_LISTEN_URL}?${new URLSearchParams({
    model: token.model,
    encoding: 'linear16',
    sample_rate: String(TARGET_SAMPLE_RATE),
    channels: '1',
    language: 'en',
    interim_results: 'true',
    punctuate: 'true',
    smart_format: 'true',
    diarize: 'true',
    endpointing: '300',
  }).toString()}`

type Emit = (event: Capture.CaptureEvent) => void

type TranscriberConnection = Readonly<{
  send: (pcm: Int16Array<ArrayBuffer>) => void
  finish: () => Promise<void>
  close: () => void
}>

/**
 * The live transcriber: a Deepgram stream opened with a short-lived token from
 * the origin. Audio produced while it connects or reconnects waits and is sent
 * when it opens; word times are offset by the audio sent on earlier streams, so
 * they always match the recording's audio.
 */
const openTranscriber = (
  origin: WordsOriginService,
  emit: Emit,
): TranscriberConnection => {
  const pending: Array<Int16Array<ArrayBuffer>> = []
  const state = {
    socket: Option.none<WebSocket>(),
    offsetSeconds: 0,
    sentSeconds: 0,
    lastSentAtMs: Date.now(),
    reconnectAttempt: 0,
    isFinishing: false,
    isClosed: false,
    maybeFinished: Option.none<() => void>(),
  }
  const setState = (
    transcriber: Capture.Model.TranscriberState,
    maybeNotice: Option.Option<string>,
  ) =>
    emit(
      Capture.reportTranscriberState({
        state: transcriber,
        maybeNotice,
      }),
    )
  const sendNow = (socket: WebSocket, pcm: Int16Array<ArrayBuffer>) => {
    socket.send(pcm)
    state.sentSeconds += pcm.length / TARGET_SAMPLE_RATE
    state.lastSentAtMs = Date.now()
  }
  const keepAlive = window.setInterval(() => {
    Option.map(state.socket, socket => {
      if (
        socket.readyState === WebSocket.OPEN &&
        Date.now() - state.lastSentAtMs > KEEP_ALIVE_MS
      ) {
        socket.send(JSON.stringify({ type: 'KeepAlive' }))
        state.lastSentAtMs = Date.now()
      }
    })
  }, KEEP_ALIVE_MS)
  const scheduleReconnect = (maybeNotice: Option.Option<string>) => {
    const delay = Math.min(
      MAXIMUM_RECONNECT_DELAY_MS,
      1_000 * 2 ** state.reconnectAttempt,
    )
    state.reconnectAttempt += 1
    setState('Reconnecting', maybeNotice)
    window.setTimeout(connect, delay)
  }
  const connect = (): void => {
    if (state.isClosed || state.isFinishing) {
      return
    }
    void Effect.runPromiseExit(origin.mintTranscriptionToken).then(exit => {
      if (state.isClosed || state.isFinishing) {
        return
      }
      Exit.match(exit, {
        onFailure: cause => {
          const reason = Option.match(Cause.findErrorOption(cause), {
            onNone: () => 'Live transcription could not start.',
            onSome: error => error.reason,
          })
          if (reason.includes('not set up')) {
            setState('Unavailable', Option.some(reason))
            window.setTimeout(connect, UNAVAILABLE_RETRY_MS)
          } else {
            scheduleReconnect(Option.some(reason))
          }
        },
        onSuccess: token => {
          const socket = new WebSocket(deepgramUrlOf(token), [
            'bearer',
            token.accessToken,
          ])
          socket.binaryType = 'arraybuffer'
          state.socket = Option.some(socket)
          socket.onopen = () => {
            state.reconnectAttempt = 0
            state.offsetSeconds = state.sentSeconds
            setState('Live', Option.none())
            pending.splice(0).forEach(pcm => sendNow(socket, pcm))
          }
          socket.onmessage = event => {
            Option.map(decodeDeepgramResults(String(event.data)), results =>
              emit(
                Capture.reportTranscript({
                  result: {
                    isFinal: results.is_final,
                    words: results.channel.alternatives
                      .slice(0, 1)
                      .flatMap(alternative => alternative.words)
                      .map(word => ({
                        text: word.punctuated_word ?? word.word,
                        startSeconds: state.offsetSeconds + word.start,
                        endSeconds: state.offsetSeconds + word.end,
                        maybeSpeaker: Option.fromNullishOr(word.speaker),
                      })),
                  },
                }),
              ),
            )
          }
          socket.onclose = () => {
            state.socket = Option.none()
            if (state.isFinishing || state.isClosed) {
              Option.map(state.maybeFinished, finished => finished())
            } else {
              scheduleReconnect(
                Option.some('The live transcription connection dropped.'),
              )
            }
          }
        },
      })
    })
  }
  setState('Connecting', Option.none())
  connect()
  return {
    send: pcm => {
      const maybeOpen = Option.filter(
        state.socket,
        socket => socket.readyState === WebSocket.OPEN,
      )
      if (Option.isSome(maybeOpen)) {
        sendNow(maybeOpen.value, pcm)
      } else {
        pending.push(pcm)
      }
    },
    finish: () =>
      new Promise<void>(resolve => {
        state.isFinishing = true
        window.clearInterval(keepAlive)
        const timeout = window.setTimeout(resolve, FINISH_TIMEOUT_MS)
        state.maybeFinished = Option.some(() => {
          window.clearTimeout(timeout)
          resolve()
        })
        const maybeOpen = Option.filter(
          state.socket,
          socket => socket.readyState === WebSocket.OPEN,
        )
        if (Option.isSome(maybeOpen)) {
          const socket = maybeOpen.value
          pending.splice(0).forEach(pcm => sendNow(socket, pcm))
          socket.send(JSON.stringify({ type: 'Finalize' }))
          socket.send(JSON.stringify({ type: 'CloseStream' }))
        } else {
          window.clearTimeout(timeout)
          resolve()
        }
      }),
    close: () => {
      state.isClosed = true
      window.clearInterval(keepAlive)
      Option.map(state.socket, socket => socket.close())
    },
  }
}

/**
 * Opens the microphone, the capture worklet, and the live transcriber for one
 * web recording. Everything opened is closed again if the browser refuses or
 * the acquire is interrupted.
 */
export const openCaptureSession = (
  origin: WordsOriginService,
): Effect.Effect<Capture.CaptureSessionHandle, Error> =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<Capture.CaptureEvent, Cause.Done>()
    const emit: Emit = event => {
      Queue.offerUnsafe(queue, event)
    }
    const opened = yield* Effect.tryPromise({
      try: async signal => {
        if (navigator.mediaDevices === undefined) {
          throw new DOMException('No media devices', 'NotSupportedError')
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        const context = new AudioContext()
        const workletUrl = URL.createObjectURL(
          new Blob([captureWorkletSource], { type: 'text/javascript' }),
        )
        const release = () => {
          stream.getTracks().forEach(track => track.stop())
          void context.close()
          URL.revokeObjectURL(workletUrl)
        }
        try {
          await context.audioWorklet.addModule(workletUrl)
          await context.resume()
          if (signal.aborted) {
            throw new Error('The recording was cancelled.')
          }
          const source = context.createMediaStreamSource(stream)
          const node = new AudioWorkletNode(context, 'scribe-capture', {
            processorOptions: {
              targetSampleRate: TARGET_SAMPLE_RATE,
              chunkSamples: CHUNK_SAMPLES,
            },
          })
          source.connect(node)
          node.connect(context.destination)
          return { stream, context, node, source, release }
        } catch (cause) {
          release()
          throw cause
        }
      },
      catch: cause => new Error(microphoneFailureReason(cause)),
    })
    const recorded: Array<Int16Array<ArrayBuffer>> = []
    const counters = { recordedSamples: 0, isEnded: false }
    const transcriber = openTranscriber(origin, emit)
    const flushWaiters: Array<() => void> = []
    opened.node.port.onmessage = event => {
      Option.match(S.decodeUnknownOption(WorkletChunk)(event.data), {
        onNone: () => {
          if (S.is(WorkletFlushed)(event.data)) {
            flushWaiters.splice(0).forEach(resolve => resolve())
          }
        },
        onSome: ({ pcm, rms }) => {
          const samples = new Int16Array(pcm)
          recorded.push(samples)
          counters.recordedSamples += samples.length
          transcriber.send(samples)
          emit(
            Capture.reportProgress({
              recordedSeconds: counters.recordedSamples / TARGET_SAMPLE_RATE,
              level: levelOf(rms),
            }),
          )
        },
      })
    }
    opened.stream.getAudioTracks().forEach(track => {
      track.onended = () =>
        emit(
          Capture.reportInterruption({
            reason: 'The microphone stopped.',
          }),
        )
    })
    const end = () => {
      if (!counters.isEnded) {
        counters.isEnded = true
        emit(
          Capture.reportEnd({
            recordedSeconds: counters.recordedSamples / TARGET_SAMPLE_RATE,
          }),
        )
        Queue.endUnsafe(queue)
      }
    }
    const flushWorklet = () =>
      new Promise<void>(resolve => {
        const timeout = window.setTimeout(resolve, FINISH_TIMEOUT_MS)
        flushWaiters.push(() => {
          window.clearTimeout(timeout)
          resolve()
        })
        opened.node.port.postMessage('flush')
      })
    const handle: Capture.CaptureSessionHandle = {
      events: Stream.fromQueue(queue),
      pause: Effect.sync(() => opened.node.port.postMessage('pause')),
      resume: Effect.sync(() => opened.node.port.postMessage('resume')),
      finish: Effect.sync(() => {
        void flushWorklet()
          .then(() => {
            opened.stream.getTracks().forEach(track => track.stop())
            return transcriber.finish()
          })
          .then(end, end)
      }),
      recordedAudio: Effect.sync(() => {
        const dataBytes = counters.recordedSamples * BYTES_PER_SAMPLE
        return {
          wav: new Blob([wavHeaderOf(dataBytes), ...recorded], {
            type: 'audio/wav',
          }),
          durationSeconds: counters.recordedSamples / TARGET_SAMPLE_RATE,
        }
      }),
      close: Effect.sync(() => {
        transcriber.close()
        opened.source.disconnect()
        opened.node.disconnect()
        opened.release()
        recorded.splice(0)
        end()
      }),
    }
    return handle
  })
