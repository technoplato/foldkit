import {
  type ArchiveStatus,
  ArchiverProgram,
  ClickedArchive,
  type Message,
  type Model,
  SubmittedArchiveUrl,
  UpdatedUrlDraft,
} from 'archiver-core-example'
import {
  Cause,
  Effect,
  Layer,
  Match as M,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const SCREEN_INNER_WIDTH = 62

const framed = (content: string): string => {
  const clipped = content.slice(0, SCREEN_INNER_WIDTH - 1)
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - clipped.length)
  return `| ${clipped}${' '.repeat(Math.max(0, remainingWidth - 1))}|`
}

const statusLabel = (status: ArchiveStatus): string =>
  M.value(status).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      QueuedArchive: () => 'Queued',
      ReadyArchive: () => 'Ready',
      FailedArchive: () => 'Failed',
    }),
  )

const archiveLines = (model: Model): ReadonlyArray<string> => {
  if (model.archives.length === 0) {
    return ['No archives yet.']
  }
  return model.archives.map(
    (archive, index) =>
      `[${index + 1}] ${archive.title}  ${statusLabel(archive.status)}`,
  )
}

/** Renders the imported Archiver Model as a terminal screen. */
export const renderArchiverScreen = (model: Model): string => {
  const border = `+${'-'.repeat(SCREEN_INNER_WIDTH)}+`
  const lines = [
    border,
    framed('Archiver'),
    framed(''),
    framed(`URL: ${model.urlDraft}`),
    framed(''),
    ...archiveLines(model).map(framed),
    framed(''),
    framed('Type URL  [Enter] archive  [1-9] open'),
    framed('Empty URL + [Q] quit'),
    border,
  ]
  return `${CLEAR_SCREEN}${lines.join('\n')}\n`
}

const isSubmitKey = (input: string): boolean => {
  const key = input.toLowerCase()
  return key === 'enter' || key === 'return' || input === '\n' || input === '\r'
}

const isBackspaceKey = (input: string): boolean => {
  const key = input.toLowerCase()
  return key === 'backspace' || input === '\x7f' || input === '\b'
}

const isPrintableChar = (input: string): boolean =>
  input.length === 1 && input >= ' ' && input !== '\x7f'

/** Maps a terminal key to an imported Archiver Message when applicable. */
export const messageForInput = (
  model: Model,
  input: string,
): Option.Option<Message> => {
  if (isSubmitKey(input)) {
    return Option.some(SubmittedArchiveUrl())
  }
  if (isBackspaceKey(input)) {
    return Option.some(UpdatedUrlDraft({ value: model.urlDraft.slice(0, -1) }))
  }
  if (model.urlDraft === '' && /^[1-9]$/.test(input)) {
    const archive = model.archives[Number.parseInt(input, 10) - 1]
    if (archive === undefined) {
      return Option.none()
    }
    return Option.some(ClickedArchive({ id: archive.id }))
  }
  if (model.urlDraft === '' && input.toLowerCase() === 'q') {
    return Option.none()
  }
  if (isPrintableChar(input)) {
    return Option.some(UpdatedUrlDraft({ value: model.urlDraft + input }))
  }
  return Option.none()
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const raw = Option.getOrElse(input.input, () => input.key.name)
      const model = runtime.readModel()
      if (model.urlDraft === '' && raw.toLowerCase() === 'q') {
        return Effect.void
      }

      const maybeMessage = messageForInput(model, raw)
      if (Option.isSome(maybeMessage)) {
        return runtime.run(maybeMessage.value).pipe(
          Effect.flatMap(next => terminal.display(renderArchiverScreen(next))),
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      } else {
        return runInputLoop(inputQueue, runtime, terminal)
      }
    }),
  )

/** Runs the interactive terminal host over the imported Archiver program. */
export const runArchiverTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: ArchiverProgram,
          resources: Layer.empty,
        }),
      )

      yield* runtime.initialization
      yield* terminal.display(renderArchiverScreen(runtime.readModel()))

      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )
