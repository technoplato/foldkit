import { Effect, Fiber, Stream } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AudioPlayer,
  makeBrowserAudioPlayer,
  observeAudioPlayer,
} from './audioPlayer.js'
import { PlayAudio } from './update.js'

afterEach(() => {
  document.body.replaceChildren()
})

describe('browser audio adapter', () => {
  it('returns a typed failure when the browser rejects playback', async () => {
    const audio = document.createElement('audio')
    vi.spyOn(audio, 'play').mockRejectedValue(
      new Error('Playback needs a user gesture.'),
    )
    const message = await Effect.runPromise(
      PlayAudio().effect.pipe(
        Effect.provideService(AudioPlayer, makeBrowserAudioPlayer(audio)),
      ),
    )

    expect(message).toMatchObject({
      _tag: 'FailedAudioControl',
      failure: {
        _tag: 'RejectedAudioOperation',
        operation: 'Play',
        reason: 'Playback needs a user gesture.',
      },
    })
  })

  it('owns event listeners for exactly the mounted audio lifetime', async () => {
    const audio = document.createElement('audio')
    const addEventListener = vi.spyOn(audio, 'addEventListener')
    const removeEventListener = vi.spyOn(audio, 'removeEventListener')
    const fiber = Effect.runFork(Stream.runDrain(observeAudioPlayer(audio)))

    await vi.waitFor(() => {
      expect(addEventListener).toHaveBeenCalledWith(
        'timeupdate',
        expect.any(Function),
      )
    })

    await Effect.runPromise(Fiber.interrupt(fiber))

    await vi.waitFor(() => {
      expect(removeEventListener).toHaveBeenCalledWith(
        'timeupdate',
        expect.any(Function),
      )
    })
  })
})
