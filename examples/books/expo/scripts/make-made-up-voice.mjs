// Makes a voice for the made-up library: each made-up word spoken by this
// Mac's own speech, placed at the moment the made-up words say it starts,
// so a phone can prove sound and the moving word together. The words and
// their times come from the Books core; nothing here is from a real book.
// The file is written beside the app and is not kept in the repository.
//
//   node scripts/make-made-up-voice.mjs
import { madeUpPassages } from 'books-core-example'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sampleRate = 22050
const wordsPerMinute = '250'
const tailMs = 1000
const output = join(
  dirname(fileURLToPath(import.meta.url)),
  '../assets/made-up/voice.m4a',
)

if (existsSync(output) && !process.argv.includes('--again')) {
  process.stdout.write(`The made-up voice is already at ${output}\n`)
  process.exit(0)
}

const words = madeUpPassages.flatMap(passage => passage.words)
const work = mkdtempSync(join(tmpdir(), 'made-up-voice-'))

const dataOf = wave => {
  // A WAVE file is chunks; the samples are in the one named `data`.
  let at = 12
  while (at + 8 <= wave.length) {
    const name = wave.toString('ascii', at, at + 4)
    const size = wave.readUInt32LE(at + 4)
    if (name === 'data') {
      return new Int16Array(
        wave.buffer.slice(
          wave.byteOffset + at + 8,
          wave.byteOffset + at + 8 + size - (size % 2),
        ),
      )
    }
    at += 8 + size + (size % 2)
  }
  return new Int16Array(0)
}

const spoken = new Map()
const samplesOf = text => {
  const kept = spoken.get(text)
  if (kept !== undefined) {
    return kept
  }
  const file = join(work, `${spoken.size.toString()}.wav`)
  execFileSync('say', [
    '-r',
    wordsPerMinute,
    '-o',
    file,
    '--file-format=WAVE',
    `--data-format=LEI16@${sampleRate.toString()}`,
    text,
  ])
  const samples = dataOf(readFileSync(file))
  spoken.set(text, samples)
  return samples
}

const lastEndMs = Math.max(...words.map(word => word.endMs))
const mixed = new Int16Array(
  Math.ceil(((lastEndMs + tailMs) / 1000) * sampleRate),
)
for (const word of words) {
  const samples = samplesOf(word.text)
  const start = Math.round((word.startMs / 1000) * sampleRate)
  for (
    let index = 0;
    index < samples.length && start + index < mixed.length;
    index += 1
  ) {
    const sum = mixed[start + index] + samples[index]
    mixed[start + index] = Math.max(-32768, Math.min(32767, sum))
  }
}

const header = Buffer.alloc(44)
header.write('RIFF', 0, 'ascii')
header.writeUInt32LE(36 + mixed.byteLength, 4)
header.write('WAVEfmt ', 8, 'ascii')
header.writeUInt32LE(16, 16)
header.writeUInt16LE(1, 20)
header.writeUInt16LE(1, 22)
header.writeUInt32LE(sampleRate, 24)
header.writeUInt32LE(sampleRate * 2, 28)
header.writeUInt16LE(2, 32)
header.writeUInt16LE(16, 34)
header.write('data', 36, 'ascii')
header.writeUInt32LE(mixed.byteLength, 40)
const wave = join(work, 'voice.wav')
writeFileSync(wave, Buffer.concat([header, Buffer.from(mixed.buffer)]))

mkdirSync(dirname(output), { recursive: true })
execFileSync('afconvert', [
  '-f',
  'm4af',
  '-d',
  'aac',
  '-b',
  '48000',
  wave,
  output,
])
process.stdout.write(
  `Made ${output}: ${words.length.toString()} words, ${Math.round(lastEndMs / 1000).toString()} seconds\n`,
)
