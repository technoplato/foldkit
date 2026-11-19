import { Effect, Fiber, Option, Schema as S, Stream } from 'effect'
import {
  type AudioEvent,
  AudioOutput,
  Track,
} from 'transcript-player-core-example'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expoAudioOutput } from './expoAudioOutput'
import { isSilentAsked, isSilentOn, loudnessOf } from './steps'

type Fake = {
  volume: number
  muted: boolean
  playing: boolean
  currentTime: number
  heardAtPlay: Array<Readonly<{ volume: number; muted: boolean }>>
}

const made: Array<Fake> = []

const stubborn = { isOn: false }

const device = { isReal: true }

vi.mock('expo-device', () => ({
  get isDevice() {
    return device.isReal
  },
}))

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
    if (stubborn.isOn) {
      // NOTE: a player that takes no telling: its volume stays where it was.
      Object.defineProperty(fake, 'volume', {
        get: () => 1,
        set: () => undefined,
      })
    }
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
  S.decodeUnknownSync(Track)({
    mediaId: 'made-up',
    cue: 0,
    fromMs: 0,
    durationMs: 60_000,
    maybeAudioUrl: Option.some(url),
  })

const soundBriefly = (
  options: Parameters<typeof expoAudioOutput>[0],
  urls: ReadonlyArray<string>,
): Promise<ReadonlyArray<AudioEvent>> =>
  Effect.runPromise(
    Effect.provide(
      Effect.forEach(urls, url =>
        Effect.gen(function* () {
          const output = yield* AudioOutput
          const heard: Array<AudioEvent> = []
          const fiber = yield* Effect.forkChild(
            Stream.runForEach(
              output.sound(track(url), () => 1),
              event =>
                Effect.sync(() => {
                  heard.push(event)
                }),
            ),
          )
          yield* Effect.sleep('20 millis')
          yield* Fiber.interrupt(fiber)
          return heard
        }),
      ),
      expoAudioOutput(options),
    ),
  ).then(heard => heard.flat())

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

describe('whether a phone app may make a sound', () => {
  it('is silent on a simulator with no flag at all', () => {
    expect(isSilentOn({ isRealDevice: false, env: {} })).toBe(true)
  })

  it('sounds on a simulator only when its sound is asked for by name', () => {
    expect(
      isSilentOn({
        isRealDevice: false,
        env: { EXPO_PUBLIC_FOLDKIT_SOUND_ON_SIMULATOR: '1' },
      }),
    ).toBe(false)
  })

  it('sounds on a real device', () => {
    expect(isSilentOn({ isRealDevice: true, env: {} })).toBe(false)
  })

  it('is silent anywhere the test switch is on, whatever else is asked', () => {
    expect(
      isSilentOn({
        isRealDevice: true,
        env: { EXPO_PUBLIC_FOLDKIT_SILENT: '1' },
      }),
    ).toBe(true)
    expect(
      isSilentOn({
        isRealDevice: false,
        env: {
          EXPO_PUBLIC_FOLDKIT_SILENT: '1',
          EXPO_PUBLIC_FOLDKIT_SOUND_ON_SIMULATOR: '1',
        },
      }),
    ).toBe(true)
  })
})

describe('a silent phone audio output', () => {
  beforeEach(() => {
    made.length = 0
    stubborn.isOn = false
    device.isReal = true
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

  it('never tells a player to play that does not itself report no volume and muted, and says why', async () => {
    stubborn.isOn = true
    const heard = await soundBriefly({ isSilent: true }, [
      'https://audio.invalid/one.m4a',
    ])

    expect(made[0]?.heardAtPlay).toEqual([])
    expect(heard).toEqual([
      {
        _tag: 'Failed',
        reason: 'the player would not go silent, so it was not played',
      },
    ])
  })

  it('is silent on a simulator with no flag and nothing asked of it', async () => {
    device.isReal = false
    await soundBriefly({}, ['https://audio.invalid/one.m4a'])
    expect(made[0]?.heardAtPlay).toEqual([{ volume: 0, muted: true }])
  })

  it('cannot be made to sound by an app on a simulator: an app can only add silence', async () => {
    device.isReal = false
    await soundBriefly({ isSilent: false }, ['https://audio.invalid/one.m4a'])
    expect(made[0]?.heardAtPlay).toEqual([{ volume: 0, muted: true }])
  })

  it('sounds when it is not asked to be silent', async () => {
    await soundBriefly({}, ['https://audio.invalid/one.m4a'])
    expect(made[0]?.heardAtPlay).toEqual([{ volume: 1, muted: false }])
  })
})
