import { Effect, Fiber, Option, Stream } from 'effect'
import { AudioOutput, type Track } from 'transcript-player-core-example'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expoAudioOutput } from './expoAudioOutput'
import { isSilentAsked, loudnessOf } from './steps'

type Fake = {
  volume: number
  muted: boolean
  playing: boolean
  currentTime: number
  heardAtPlay: Array<Readonly<{ volume: number; muted: boolean }>>
}

const made: Array<Fake> = []

vi.mock('expo-audio', () => ({
  setAudioModeAsync: () => Promise.resolve(),
  createAudioPlayer: () => {
    const fake: Fake = {
      volume: 1,
      muted: false,
      playing: false,
      currentTime: 0,
      heardAtPlay: [],
    }
    made.push(fake)
    return Object.assign(fake, {
      addListener: () => ({ remove: () => undefined }),
      seekTo: () => Promise.resolve(),
      setPlaybackRate: () => undefined,
      setActiveForLockScreen: () => undefined,
      clearLockScreenControls: () => undefined,
      remove: () => undefined,
      pause: () => {
        fake.playing = false
      },
      play: () => {
        fake.playing = true
        fake.heardAtPlay.push({ volume: fake.volume, muted: fake.muted })
      },
    })
  },
}))

const track = (url: string): Track =>
  ({
    mediaId: 'made-up',
    cue: 0,
    fromMs: 0,
    durationMs: 60_000,
    maybeAudioUrl: Option.some(url),
  }) as Track

const soundBriefly = (
  options: Parameters<typeof expoAudioOutput>[0],
  urls: ReadonlyArray<string>,
): Promise<void> =>
  Effect.runPromise(
    Effect.provide(
      Effect.forEach(urls, url =>
        Effect.gen(function* () {
          const output = yield* AudioOutput
          const fiber = yield* Effect.forkChild(
            Stream.runDrain(output.sound(track(url), () => 1)),
          )
          yield* Effect.sleep('20 millis')
          yield* Fiber.interrupt(fiber)
        }),
      ),
      expoAudioOutput(options),
    ),
  ).then(() => undefined)

describe('the switch that keeps a phone app silent under test', () => {
  it('is on when the app is built or served with EXPO_PUBLIC_FOLDKIT_SILENT set', () => {
    expect(isSilentAsked({ EXPO_PUBLIC_FOLDKIT_SILENT: '1' })).toBe(true)
    expect(isSilentAsked({ EXPO_PUBLIC_FOLDKIT_SILENT: ' ' })).toBe(false)
    expect(isSilentAsked({})).toBe(false)
  })

  it('is a player with no volume that is also muted, so neither alone can let sound out', () => {
    expect(loudnessOf(true)).toEqual({ volume: 0, muted: true })
    expect(loudnessOf(false)).toEqual({ volume: 1, muted: false })
  })
})

describe('a silent phone audio output', () => {
  beforeEach(() => {
    made.length = 0
  })

  it('has every player at no volume and muted at the moment it is told to play', async () => {
    await soundBriefly({ isSilent: true }, [
      'https://audio.invalid/one.m4a',
      'https://audio.invalid/two.m4a',
    ])

    expect(made).toHaveLength(2)
    expect(made.flatMap(fake => fake.heardAtPlay)).toEqual([
      { volume: 0, muted: true },
      { volume: 0, muted: true },
    ])
  })

  it('still plays, so what the player reports can be tested: only the sound is gone', async () => {
    await soundBriefly({ isSilent: true }, ['https://audio.invalid/one.m4a'])
    expect(made[0]?.heardAtPlay).toHaveLength(1)
  })

  it('pauses its player when the playing ends, however it ends', async () => {
    await soundBriefly({ isSilent: true }, ['https://audio.invalid/one.m4a'])
    expect(made[0]?.playing).toBe(false)
  })

  it('sounds when it is not asked to be silent', async () => {
    await soundBriefly({}, ['https://audio.invalid/one.m4a'])
    expect(made[0]?.heardAtPlay).toEqual([{ volume: 1, muted: false }])
  })
})
