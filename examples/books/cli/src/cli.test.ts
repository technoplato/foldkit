import {
  type BoundBooks,
  SyncedBooks,
  bindBooks,
  makeTestLibraryStore,
  makeTestLinkSharing,
  noReadAloud,
  sampleShelf,
  whenLibraryOpened,
} from 'books-core-example'
import { Effect, Layer } from 'effect'
import { Interaction, Processor, Runtime } from 'foldkit'
import { runProgramCommand } from 'foldkit/cli'
import {
  noTranscripts,
  virtualAudioOutput,
} from 'transcript-player-core-example'
import { afterEach, describe, expect, it } from 'vitest'

const started: Array<{ stop: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(started.splice(0).map(handle => handle.stop()))
})

const openBooks = async (): Promise<BoundBooks> => {
  const store = await Effect.runPromise(makeTestLibraryStore(sampleShelf))
  const sharing = await Effect.runPromise(makeTestLinkSharing())
  const handle = Runtime.startHandle({
    program: SyncedBooks,
    sync: Runtime.Memory({ processor: 'cli-test' }),
    resources: Layer.mergeAll(
      store.layer,
      virtualAudioOutput,
      noTranscripts,
      sharing.layer,
      noReadAloud,
    ),
    host: Processor.Host.Cli(),
  })
  started.push(handle)
  const bound = bindBooks(handle)
  await Interaction.whenSettled(bound, 2_000)
  await whenLibraryOpened(handle, 2_000)
  return bound
}

const run = (bound: BoundBooks, ...words: ReadonlyArray<string>) =>
  runProgramCommand(bound, 'books', words, {})

describe('books CLI', () => {
  it('lists the library and every Action with its command', async () => {
    const bound = await openBooks()
    const painted = run(bound)
    expect(painted.stdout).toMatch(/The Lantern Keeper/)
    expect(painted.stdout).toMatch(/^ {2}listen <slug> +Plays the title/m)
    expect(painted.stdout).toMatch(/^ {2}seek-to <place-ms> +Moves to a place/m)
  })

  it('plays a title, then seeks anywhere in it by command', async () => {
    const bound = await openBooks()
    expect(run(bound, 'listen', 'the-lantern-keeper').exitCode).toBe(0)
    expect(run(bound, 'seek-to', '723000').exitCode).toBe(0)
    const painted = run(bound)
    expect(painted.stdout).toMatch(
      /^at \/books\/the-lantern-keeper\/listen\/12m03s$/m,
    )
    expect(painted.stdout).toMatch(/The Tide +1h 8m left/)
  })
})
