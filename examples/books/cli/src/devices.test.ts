import { describe, expect, it } from 'vitest'

import { audioDevicesOf, paintAudioDevices } from './devices.js'

const listing = [
  '[AudioToolbox @ 0x7c9f0089c0] CoreAudio devices:',
  '[AudioToolbox @ 0x7c9f0089c0] [0]                    Desk Monitor, 09D18480-0000',
  '[AudioToolbox @ 0x7c9f0089c0] [1]              Made-Up Speakers, BuiltInSpeakerDevice',
  '[out#0/audiotoolbox @ 0x7c9f008a80] video:0KiB audio:2KiB',
].join('\n')

describe('books devices', () => {
  it('reads each output device and its number from ffmpeg’s listing', () => {
    expect(audioDevicesOf(listing)).toEqual([
      { index: 0, name: 'Desk Monitor' },
      { index: 1, name: 'Made-Up Speakers' },
    ])
  })

  it('prints them with how to play on one', () => {
    expect(paintAudioDevices(audioDevicesOf(listing))).toBe(
      [
        'Audio outputs on this Mac',
        '  0  Desk Monitor',
        '  1  Made-Up Speakers',
        '',
        'Play on one: books stop, then books listen <title> --device 1',
        'Without --device, Books plays on the Mac’s default output.',
      ].join('\n'),
    )
  })

  it('says so when ffmpeg lists none', () => {
    expect(paintAudioDevices([])).toBe(
      'No audio outputs were listed. Books plays on the Mac’s default output.',
    )
  })
})
