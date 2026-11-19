import { describe, expect, it } from 'vitest'

import { chunkNameOf, chunkedLines } from './chunkedLines.js'

const kept = () => {
  const chunks: Array<Readonly<{ name: string; text: string }>> = []
  const timers: Array<() => void> = []
  const writer = chunkedLines({
    writeChunk: (name, text) => chunks.push({ name, text }),
    now: () => new Date('2026-11-19T14:27:12.000Z'),
    everyMs: 2_000,
    setTimer: run => {
      timers.push(run)
    },
  })
  return {
    chunks,
    writer,
    tick: () => {
      timers.splice(0).forEach(run => {
        run()
      })
    },
  }
}

describe('a trace kept as small files, for a build with nobody listening', () => {
  it('names each file for when it was written and its place in line, so they sort in order', () => {
    expect(chunkNameOf(new Date('2026-11-19T14:27:12.000Z'), 7)).toBe(
      '20261119T142712Z-000007.ndjson',
    )
  })

  it('holds lines for a moment and writes them together, one line each', () => {
    const { chunks, writer, tick } = kept()
    writer.write('{"a":1}')
    writer.write('{"a":2}')
    expect(chunks).toEqual([])

    tick()

    expect(chunks).toEqual([
      { name: '20261119T142712Z-000001.ndjson', text: '{"a":1}\n{"a":2}\n' },
    ])
  })

  it('writes the next lines to the next file', () => {
    const { chunks, writer, tick } = kept()
    writer.write('{"a":1}')
    tick()
    writer.write('{"a":2}')
    tick()
    expect(chunks.map(chunk => chunk.name)).toEqual([
      '20261119T142712Z-000001.ndjson',
      '20261119T142712Z-000002.ndjson',
    ])
  })

  it('writes at once what cannot wait, such as a failure that may end the app', () => {
    const { chunks, writer } = kept()
    writer.write('{"a":1}')
    writer.writeNow('{"failed":true}')
    expect(chunks).toEqual([
      {
        name: '20261119T142712Z-000001.ndjson',
        text: '{"a":1}\n{"failed":true}\n',
      },
    ])
  })

  it('never lets a file that cannot be written stop the app', () => {
    const writer = chunkedLines({
      writeChunk: () => {
        throw new Error('the disk is full')
      },
      setTimer: run => {
        run()
      },
    })
    expect(() => {
      writer.write('{"a":1}')
    }).not.toThrow()
  })
})
