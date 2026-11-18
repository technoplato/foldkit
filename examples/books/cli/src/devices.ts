/**
 * The audio outputs a terminal Books can play on, as `books devices`
 * lists them. This module must not import Effect, Instant, or the
 * Program, so a command starts fast.
 */
import { spawnSync } from 'node:child_process'

/** One audio output: the number ffmpeg gives it, and its name. */
export type AudioDevice = Readonly<{ index: number; name: string }>

const devicePattern = /\]\s+\[(\d+)\]\s+(.+?),\s/u

/**
 * The audio outputs in ffmpeg's AudioToolbox listing, each with its
 * number: `[4]  Mac mini Speakers, BuiltInSpeakerDevice` is
 * `{ index: 4, name: 'Mac mini Speakers' }`.
 */
export const audioDevicesOf = (listing: string): ReadonlyArray<AudioDevice> =>
  listing.split('\n').flatMap(line => {
    const match = devicePattern.exec(line)
    const [, index, name] = match ?? []
    return index === undefined || name === undefined
      ? []
      : [{ index: Number(index), name: name.trim() }]
  })

/**
 * What `books devices` prints: each output with its number, and how to
 * play on one. The player picks its output when it starts, so the words
 * say to stop it first.
 */
export const paintAudioDevices = (
  devices: ReadonlyArray<AudioDevice>,
): string =>
  devices.length === 0
    ? 'No audio outputs were listed. Books plays on the Mac’s default output.'
    : [
        'Audio outputs on this Mac',
        ...devices.map(
          device => `  ${device.index.toString()}  ${device.name}`,
        ),
        '',
        `Play on one: books stop, then books listen <title> --device ${(devices.at(-1)?.index ?? 0).toString()}`,
        'Without --device, Books plays on the Mac’s default output.',
      ].join('\n')

/** Asks ffmpeg for this Mac's audio outputs. Empty when ffmpeg is missing. */
export const listAudioDevices = (): ReadonlyArray<AudioDevice> => {
  const listed = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-f',
      'lavfi',
      '-i',
      'anullsrc',
      '-t',
      '0.01',
      '-f',
      'audiotoolbox',
      '-list_devices',
      'true',
      '-',
    ],
    { encoding: 'utf8' },
  )
  return audioDevicesOf(`${listed.stderr ?? ''}\n${listed.stdout ?? ''}`)
}
