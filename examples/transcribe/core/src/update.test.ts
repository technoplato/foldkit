import { Array, Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  ClickedJob,
  ClosedJob,
  FailedObserveJobs,
  HeardJobPlayback,
  HeardPlaybackPosition,
  LoadCatalog,
  LoadedCatalog,
  ObservedJobs,
  OpenedHref,
  PressedSeekWord,
  SubmittedUrl,
  init,
  requestFromHref,
  restore,
  seedTranscripts,
  update,
  videoIdFromInput,
  visibleJobs,
  wordAt,
} from './index.js'

describe('update', () => {
  test('init starts loading with no selection', () => {
    const [model, commands] = init()

    expect(model.catalog._tag).toBe('LoadingCatalog')
    expect(model.selectedId).toEqual(Option.none())
    expect(commands.map(command => command.name)).toEqual(['LoadCatalog'])
  })

  test('restore preserves the Model', () => {
    const [model] = init()
    expect(restore(model)).toStrictEqual([model, []])
  })

  test('ObservedJobs loads Instant jobs', () => {
    const [initial] = init()
    Story.story(
      update,
      Story.with(initial),
      Story.message(
        ObservedJobs.make({ jobs: seedTranscripts, source: 'Instant' }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.source).toBe('Instant')
        expect(model.catalog).toEqual(
          LoadedCatalog.make({ jobs: seedTranscripts }),
        )
      }),
    )
  })

  test('FailedObserveJobs uses the static fallback catalog', () => {
    const [initial] = init()
    Story.story(
      update,
      Story.with(initial),
      Story.message(FailedObserveJobs.make({ reason: 'offline' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.source).toBe('StaticFallback')
        expect(model.catalog._tag).toBe('FailedCatalog')
      }),
    )
  })

  test('ClickedJob and ClosedJob toggle selection', () => {
    const [initial] = init()
    const maybeFirst = Array.head(seedTranscripts)
    if (Option.isNone(maybeFirst)) {
      throw new Error('seed catalog is empty')
    }
    const first = maybeFirst.value
    Story.story(
      update,
      Story.with(initial),
      Story.message(ClickedJob.make({ id: first.id })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.selectedId).toEqual(Option.some(first.id))
      }),
      Story.message(ClosedJob.make({})),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.selectedId).toEqual(Option.none())
      }),
    )
  })

  test('OpenedHref /?url= selects or queues that video', () => {
    const [initial] = init()
    Story.story(
      update,
      Story.with(initial),
      Story.message(
        OpenedHref.make({
          href: 'https://transcribe.knophy.com/?url=https://youtu.be/B0FaK0sazXg',
        }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.selectedId).toEqual(Option.some('B0FaK0sazXg'))
        expect(model.draftUrl).toBe('https://youtu.be/B0FaK0sazXg')
        const jobs = visibleJobs(model)
        expect(jobs.some(job => job.videoId === 'B0FaK0sazXg')).toBe(true)
      }),
    )
  })

  test('OpenedHref /v/:id selects that video', () => {
    const [initial] = init()
    Story.story(
      update,
      Story.with(initial),
      Story.message(
        OpenedHref.make({
          href: 'https://transcribe.knophy.com/v/B0FaK0sazXg',
        }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.selectedId).toEqual(Option.some('B0FaK0sazXg'))
      }),
    )
  })

  test('SubmittedUrl queues an unknown video id', () => {
    const [initial] = init()
    Story.story(
      update,
      Story.with(initial),
      Story.message(SubmittedUrl.make({ url: 'https://youtu.be/abcdefghijk' })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.selectedId).toEqual(Option.some('abcdefghijk'))
        expect(
          visibleJobs(model).some(job => job.videoId === 'abcdefghijk'),
        ).toBe(true)
      }),
    )
  })

  test('videoIdFromInput parses YouTube URLs', () => {
    expect(videoIdFromInput('https://youtu.be/B0FaK0sazXg')).toEqual(
      Option.some('B0FaK0sazXg'),
    )
    expect(videoIdFromInput('B0FaK0sazXg')).toEqual(Option.some('B0FaK0sazXg'))
    expect(requestFromHref('/v/B0FaK0sazXg').videoId).toEqual(
      Option.some('B0FaK0sazXg'),
    )
    expect(requestFromHref('/jobs/B0FaK0sazXg').videoId).toEqual(
      Option.some('B0FaK0sazXg'),
    )
  })

  test('OpenedHref /jobs/:id selects that video and sets local media', () => {
    const [initial] = init()
    Story.story(
      update,
      Story.with(initial),
      Story.message(
        OpenedHref.make({
          href: 'https://transcribe.knophy.com/jobs/B0FaK0sazXg',
        }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.selectedId).toEqual(Option.some('B0FaK0sazXg'))
        expect(model.mediaUrl).toBe('/media/B0FaK0sazXg.mp4')
        expect(model.fallbackUrl).toBe('https://youtu.be/B0FaK0sazXg')
      }),
    )
  })

  test('HeardPlaybackPosition and PressedSeekWord drive currentTime', () => {
    const [initial] = init()
    Story.story(
      update,
      Story.with(initial),
      Story.message(OpenedHref.make({ href: '/jobs/B0FaK0sazXg' })),
      Story.Command.expectNone(),
      Story.message(HeardPlaybackPosition.make({ mediaPosition: 0.5 })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.currentTime).toBe(0.5)
      }),
      Story.message(PressedSeekWord.make({ start: 12.5 })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.currentTime).toBe(12.5)
      }),
    )
  })

  test('HeardJobPlayback loads words and wordAt uses a half-open interval', () => {
    const [initial] = init()
    const words = [
      { id: 'w0', text: 'Okay,', start: 0, end: 0.4 },
      { id: 'w1', text: 'so', start: 0.4, end: 0.9 },
    ]
    Story.story(
      update,
      Story.with(initial),
      Story.message(OpenedHref.make({ href: '/jobs/B0FaK0sazXg' })),
      Story.Command.expectNone(),
      Story.message(
        HeardJobPlayback.make({
          analysis: 'Whisper transcript is available.',
          fallbackUrl: 'https://youtu.be/B0FaK0sazXg',
          mediaUrl: '/media/B0FaK0sazXg.mp4',
          title: 'Recorded session',
          transcriptText: 'Okay, so',
          videoId: 'B0FaK0sazXg',
          words,
        }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.words).toHaveLength(2)
        expect(
          wordAt(model.words, 0).pipe(Option.map(word => word.id)),
        ).toEqual(Option.some('w0'))
        expect(
          wordAt(model.words, 0.4).pipe(Option.map(word => word.id)),
        ).toEqual(Option.some('w1'))
        expect(wordAt(model.words, 0.9)).toEqual(Option.none())
      }),
    )
  })
})
