import { Effect, Ref, Schema as S } from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'
import type {
  CreateReadStreamOpts,
  CreateWriteStreamOpts,
} from '@instantdb/core'

import {
  LinkedProgramArtifact,
  ProgramArtifactStreamError,
  makeProgramArtifactStreams,
} from './artifactStream.js'

describe('Program artifact streams', () => {
  it.effect(
    'forwards resumable read offsets and owner-scoped rule parameters',
    () =>
      Effect.gen(function* () {
        const received = yield* Ref.make<CreateReadStreamOpts | undefined>(
          undefined,
        )
        const stream = Object.assign(new ReadableStream<string>(), {
          streamId: () => Promise.resolve('stream-001'),
        })
        const service = makeProgramArtifactStreams({
          streams: {
            createReadStream: input => {
              Effect.runSync(Ref.set(received, input))
              return stream
            },
            createWriteStream: () =>
              Object.assign(new WritableStream<string>(), {
                streamId: () => Promise.resolve('unused'),
              }),
          },
        })

        expect(
          yield* service.createReadStream({
            position: {
              byteOffset: 8_192,
              streamId: 'stream-001',
            },
            ruleParams: {
              sessionId: 'session-001',
            },
          }),
        ).toBe(stream)
        expect(yield* Ref.get(received)).toEqual({
          byteOffset: 8_192,
          ruleParams: {
            sessionId: 'session-001',
          },
          streamId: 'stream-001',
        })
      }),
  )

  it.effect(
    'forwards write ownership without accepting raw media or credentials',
    () =>
      Effect.gen(function* () {
        const received = yield* Ref.make<CreateWriteStreamOpts | undefined>(
          undefined,
        )
        const stream = Object.assign(new WritableStream<string>(), {
          streamId: () => Promise.resolve('stream-002'),
        })
        const service = makeProgramArtifactStreams({
          streams: {
            createReadStream: () =>
              Object.assign(new ReadableStream<string>(), {
                streamId: () => Promise.resolve('unused'),
              }),
            createWriteStream: input => {
              Effect.runSync(Ref.set(received, input))
              return stream
            },
          },
        })

        expect(
          yield* service.createWriteStream({
            clientId: 'client-phone',
            ruleParams: {
              sessionId: 'session-001',
            },
          }),
        ).toBe(stream)
        expect(yield* Ref.get(received)).toEqual({
          clientId: 'client-phone',
          ruleParams: {
            sessionId: 'session-001',
          },
        })
      }),
  )

  it.effect('wraps stream construction errors at the host boundary', () =>
    Effect.gen(function* () {
      const service = makeProgramArtifactStreams({
        streams: {
          createReadStream: () => {
            throw new Error('read failed')
          },
          createWriteStream: () => {
            throw new Error('write failed')
          },
        },
      })

      expect(
        yield* Effect.flip(
          service.createReadStream({
            position: {
              byteOffset: 0,
              streamId: 'stream-001',
            },
          }),
        ),
      ).toBeInstanceOf(ProgramArtifactStreamError)
      expect(
        yield* Effect.flip(
          service.createWriteStream({
            clientId: 'client-phone',
          }),
        ),
      ).toBeInstanceOf(ProgramArtifactStreamError)
    }),
  )

  it('requires scoped, non-empty, content-safe artifact references', () => {
    const decode = S.decodeUnknownSync(LinkedProgramArtifact)
    expect(
      decode({
        artifactId: 'artifact-001',
        byteLength: 12,
        contentSha256: 'a'.repeat(64),
        mediaType: 'audio/wav',
        programId: 'counter',
        sessionId: 'session-001',
        streamId: 'stream-001',
      }),
    ).toEqual({
      artifactId: 'artifact-001',
      byteLength: 12,
      contentSha256: 'a'.repeat(64),
      mediaType: 'audio/wav',
      programId: 'counter',
      sessionId: 'session-001',
      streamId: 'stream-001',
    })
    expect(() =>
      decode({
        artifactId: '',
        byteLength: -1,
        contentSha256: 'not-a-digest',
        mediaType: '',
        programId: '',
        sessionId: '',
        streamId: '',
      }),
    ).toThrow()
  })
})
