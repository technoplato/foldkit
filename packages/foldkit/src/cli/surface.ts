import {
  Array,
  Duration,
  Effect,
  Option,
  Record,
  Ref,
  Stream,
  pipe,
} from 'effect'

import { type BoundInteraction, onBehalfOf } from '../interaction/bind.js'
import { follow } from '../interaction/follow.js'
import { terminalKeyInput } from '../interaction/interaction.js'
import { pressTerminalKeyAt } from '../interaction/terminalFocus.js'
import { type Host, Tui } from '../processor/host.js'
import { Text } from '../renderers/elements.js'
import { liveFrameOf } from '../renderers/liveFrame.js'
import { offeredBy } from '../renderers/query.js'
import type { UiNode } from '../renderers/types.js'
import { type TerminalInk, inkedLine } from '../theme/terminal.js'
import {
  type HostCommand,
  offeredCommandsOf,
  paintProgram,
  paintScreen,
  runProgramCommand,
} from './program.js'
import {
  CliDaemonError,
  type CliDaemonFlags,
  type CliDaemonPaintedResult,
  type CliDaemonSurface,
} from './protocol.js'
import {
  type TerminalHeaderOf,
  type TerminalPaint,
  type TerminalPaintPhase,
  type TerminalPaintReporting,
  type TerminalSize,
  type TerminalView,
  initialTerminalView,
  paintTerminalReported,
} from './terminalScreen.js'

// TERMINAL VIEW

const fallbackSize: TerminalSize = { rows: 24, columns: 80 }

const sizeFlagOf = (
  flags: CliDaemonFlags,
  name: 'rows' | 'columns',
  fallback: number,
): number =>
  pipe(
    Option.fromNullishOr(flags[name]),
    Option.map(Number),
    Option.filter(value => Number.isInteger(value) && value > 0),
    Option.getOrElse(() => fallback),
  )

const sizeOf = (flags: CliDaemonFlags): TerminalSize => ({
  rows: sizeFlagOf(flags, 'rows', fallbackSize.rows),
  columns: sizeFlagOf(flags, 'columns', fallbackSize.columns),
})

/**
 * True for a request from a terminal UI view, which sends
 * `{ view: 'tui', rows, columns }` with every Show and Do.
 */
export const isTerminalViewRequest = (flags: CliDaemonFlags): boolean =>
  flags['view'] === 'tui'

const viewsKept = 8

type KeptView = Readonly<{ viewId: string; view: TerminalView }>

/**
 * What a daemon keeps for each terminal UI that shows its Program, by the
 * `viewId` the view sends: the highlight and the scroll, so each key and
 * each refresh paints the next frame from where the last one left off,
 * and a new `books tui` starts fresh. `client` is the Host of the view,
 * `Tui` unless the request named another.
 */
export type ProgramTerminalView = Readonly<{
  paint: (
    flags: CliDaemonFlags,
    client?: Host,
  ) => Effect.Effect<CliDaemonPaintedResult, never>
  pressKey: (
    flags: CliDaemonFlags,
    client?: Host,
  ) => Effect.Effect<CliDaemonPaintedResult, never>
}>

/**
 * A terminal UI for a bound Program that a daemon serves to a remote view.
 * `paint` paints a frame exactly as tall and wide as the view's terminal;
 * `pressKey` routes the key the view read, `{ name: 'down' }` or
 * `{ sequence: 'p' }`, through the Program's interaction the way an
 * in-process TUI does, then paints, and says what came of it in
 * `flags.outcome`, `Quit` after a `q` nothing else took. A key's Messages
 * are sent on behalf of the view's client, so the journal and telemetry
 * say a `Tui` client sent them. `onPainted` hears how long each frame took
 * to paint, why, and the client it was painted for: `mount` for a view's
 * first frame, `refresh` when it asks again, and `key` after a key. With
 * `inkOf`, a frame for a view that says its output takes color
 * (`color: '1'`) is inked from the theme by the roles its parts play, in
 * for the ground the view says its terminal has, which the ink reads
 * from the view's flags; any other frame is plain.
 *
 * @example
 * ```typescript
 * const terminal = makeProgramTerminalView(bound, 'books', {
 *   onPainted: telemetry.recordRendered,
 * })
 * yield* terminal.pressKey({ view: 'tui', rows: '24', columns: '80', name: 'down' })
 * // { stdout: '…24 lines…', exitCode: 0, flags: { outcome: 'Handled' } }
 * ```
 */
export const makeProgramTerminalView = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  reporting: TerminalPaintReporting = {},
  inkOf?: (flags: CliDaemonFlags) => TerminalInk,
  headerOf?: TerminalHeaderOf,
): ProgramTerminalView => {
  // NOTE: Whether its output takes color is the view's to know, and it
  // says so with the `color` flag; the mode is the Program's, read from
  // the Model each frame. With either missing the frame is plain text.
  const inkedLines = (
    flags: CliDaemonFlags,
    painted: TerminalPaint,
  ): ReadonlyArray<string> =>
    inkOf === undefined || flags['color'] !== '1'
      ? painted.lines
      : Array.map(painted.lines, (line, row) =>
          inkedLine(
            inkOf(flags),
            line,
            Option.getOrElse(Array.get(painted.inks, row), () => []),
          ),
        )
  const views = Effect.runSync(Ref.make<ReadonlyArray<KeptView>>([]))
  const viewIdOf = (flags: CliDaemonFlags): string => flags['viewId'] ?? ''
  const keptOf = (flags: CliDaemonFlags) =>
    Effect.map(Ref.get(views), kept =>
      Option.map(
        Array.findFirst(kept, entry => entry.viewId === viewIdOf(flags)),
        entry => entry.view,
      ),
    )
  const viewOf = (flags: CliDaemonFlags) =>
    Effect.map(keptOf(flags), maybeKept =>
      Option.getOrElse(maybeKept, () => initialTerminalView),
    )
  const keep = (flags: CliDaemonFlags, next: TerminalView) =>
    Ref.update(views, kept =>
      Array.takeRight(
        [
          ...Array.filter(kept, entry => entry.viewId !== viewIdOf(flags)),
          { viewId: viewIdOf(flags), view: next },
        ],
        viewsKept,
      ),
    )
  const paintAs = (
    flags: CliDaemonFlags,
    phase: TerminalPaintPhase,
    client: Host,
  ) =>
    Effect.gen(function* () {
      const painted = paintTerminalReported(
        bound,
        name,
        yield* viewOf(flags),
        sizeOf(flags),
        phase,
        reporting,
        Option.some(client),
        headerOf,
      )
      yield* keep(flags, painted.view)
      return {
        stdout: Array.join(inkedLines(flags, painted), '\n'),
        exitCode: 0,
      }
    })
  const paint = (flags: CliDaemonFlags, client: Host = Tui()) =>
    Effect.flatMap(keptOf(flags), maybeKept =>
      paintAs(flags, Option.isSome(maybeKept) ? 'refresh' : 'mount', client),
    )
  const pressKey = (flags: CliDaemonFlags, client: Host = Tui()) =>
    Effect.gen(function* () {
      const current = yield* viewOf(flags)
      const pressed = onBehalfOf(bound, client, () =>
        pressTerminalKeyAt(
          bound,
          terminalKeyInput({
            sequence: flags['sequence'] ?? '',
            name: flags['name'] ?? '',
            isMeta: flags['meta'] === '1',
            isControl: flags['ctrl'] === '1',
            isShift: flags['shift'] === '1',
          }),
          current.focus,
        ),
      )
      yield* keep(flags, { ...current, focus: pressed.focus })
      const painted = yield* paintAs(flags, 'key', client)
      return { ...painted, flags: { outcome: pressed.outcome } }
    })
  return { paint, pressKey }
}

// FOLLOW

/**
 * The texts one topic emits while a view follows it: the text now, then
 * each new one. `flags` shape the text, such as `{ json: '1' }`, and
 * `client` is the Host of the view that follows.
 */
export type CliFollowing = (
  flags: CliDaemonFlags,
  client: Host,
) => Stream.Stream<string, CliDaemonError>

/** The topics a daemon lets a view follow, by name, such as `screen`. */
export type CliFollowings = Readonly<Record<string, CliFollowing>>

/**
 * The topics every bound Program has. `screen` is the painted screen,
 * where the Program is and what it shows without the Action list, sent
 * now and again each time it paints differently, so a view can watch an
 * import count up or a player move without asking twice. A host adds its
 * Program's own topics beside it.
 *
 * @example
 * ```typescript
 * const followings = { ...programFollowings(bound), words: followWords }
 * ```
 */
export const programFollowings = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name = '',
  options: Readonly<{
    list?: HostCommand
    inkOf?: (flags: CliDaemonFlags) => TerminalInk
  }> = {},
): CliFollowings => ({
  screen: followLive(
    bound,
    () =>
      Option.match(bound.screen(), {
        onNone: () => ({ node: Text(paintScreen(bound)) }),
        onSome: node => ({ node, offers: offeredBy(node) }),
      }),
    {
      name,
      ...options,
      piped: () => follow(bound, () => paintScreen(bound)),
    },
  ),
})

// LIVE

/**
 * A part of a Program's view to follow live: the node to show, a node
 * pinned above it, such as what is playing, and the tags of the Actions
 * the part offers, which become the commands under it; `offeredBy` reads
 * them from a node's own buttons. `isClocked` says the part moves between
 * Messages, as a Transcript does while its clock runs, so it is read
 * again by the clock.
 */
export type LivePart = Readonly<{
  node: UiNode
  header?: UiNode
  offers?: ReadonlyArray<string>
  isClocked?: boolean
}>

/**
 * How a part is followed: the Program's command `name`, for the commands
 * under the part; `hostOffers`, the commands the host itself adds for
 * this part, read when a frame is painted; `list`, the command that lists
 * them all, `help` unless the host has another; the ink for a view whose
 * output takes color; and what a pipe gets in place of frames.
 */
export type FollowLiveOptions = Readonly<{
  name: string
  list?: HostCommand
  hostOffers?: () => ReadonlyArray<HostCommand>
  inkOf?: (flags: CliDaemonFlags) => TerminalInk
  piped: CliFollowing
}>

const liveFrameEvery = Duration.millis(30)

const fallbackLiveSize = { columns: 80, rows: 24 }

// NOTE: A live frame is a few lines rewritten where they are, not the
// whole screen: it takes at most this many rows, and one fewer than the
// terminal has, so the cursor has a line under it.
const mostLiveRows = 24

const sizeFlag = (flags: CliDaemonFlags, name: string, fallback: number) => {
  const parsed = Number.parseInt(flags[name] ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Follows a part of a Program's view. For a view that says its output is
 * a terminal (`in-place`), with its size as facts (`columns`, `rows`), it
 * sends the part fitted to that size by `liveFrameOf`, with the commands
 * the part offers now under it, each time the frame differs: after a
 * Message, and by the clock for a part that says it moves between
 * Messages. The view repaints each frame over the last. For any other
 * view it sends what `piped` sends, so another program gets events and
 * never a frame. Every Program's `screen` topic is followed this way; a
 * host names its own parts beside it.
 *
 * @example
 * ```typescript
 * const followings = {
 *   ...programFollowings(bound, 'books'),
 *   words: followLive(bound, nowMs => wordsPartAt(nowMs), { name: 'books', piped: wordEvents }),
 * }
 * ```
 */
export const followLive =
  <Model, Message>(
    bound: BoundInteraction<Model, Message>,
    partAt: (nowMs: number) => LivePart,
    options: FollowLiveOptions,
  ): CliFollowing =>
  (flags, client) => {
    if (flags['in-place'] !== '1') {
      return options.piped(flags, client)
    }
    const size = {
      columns: sizeFlag(flags, 'columns', fallbackLiveSize.columns),
      rows: Math.min(
        mostLiveRows,
        Math.max(1, sizeFlag(flags, 'rows', fallbackLiveSize.rows) - 1),
      ),
    }
    const paint = (part: LivePart): string => {
      const inkOf = options.inkOf
      const isInked = inkOf !== undefined && flags['color'] === '1'
      const list = options.list ?? { command: 'help', what: '' }
      const frame = liveFrameOf(part.node, size, {
        ...(part.header === undefined ? {} : { header: part.header }),
        footer: {
          commands: offeredCommandsOf(bound, options.name, part.offers ?? [], {
            ...(options.hostOffers === undefined
              ? {}
              : { hostCommands: options.hostOffers() }),
          }),
          more: `${options.name} ${list.command}`,
        },
        marks: isInked ? 'Ink' : 'Glyph',
      })
      return Array.join(
        inkOf === undefined || !isInked
          ? frame.lines
          : Array.map(frame.lines, (line, row) =>
              inkedLine(
                inkOf(flags),
                line,
                Option.getOrElse(Array.get(frame.inks, row), () => []),
              ),
            ),
        '\n',
      )
    }
    // NOTE: A part that does not move between Messages is painted again
    // only when the Model is another one; a clocked part on every tick.
    const state: { model: unknown; isClocked: boolean; text: string } = {
      model: undefined,
      isClocked: true,
      text: '',
    }
    const read = (): string => {
      const model = bound.readModel()
      if (state.isClocked || model !== state.model) {
        const part = partAt(Date.now())
        state.model = model
        state.isClocked = part.isClocked === true
        state.text = paint(part)
      }
      return state.text
    }
    return Stream.tick(liveFrameEvery).pipe(Stream.map(read), Stream.changes)
  }

/**
 * The Stream for the topic a view asked to follow, or a refusal that names
 * the topics there are. With no topic named it follows the only topic
 * when there is one, and asks which when there are several.
 *
 * @example
 * ```typescript
 * followTopicOf(programFollowings(bound), 'screen', {}, Cli())
 * followTopicOf(programFollowings(bound), 'wrods', {}, Cli())
 * // fails: Nothing here is called "wrods" to follow. Follow one of: screen.
 * ```
 */
export const followTopicOf = (
  followings: CliFollowings,
  topic: string,
  flags: CliDaemonFlags,
  client: Host,
): Stream.Stream<string, CliDaemonError> => {
  const names = Record.keys(followings)
  const named =
    topic === '' && names.length === 1
      ? Option.getOrElse(Array.head(names), () => topic)
      : topic
  return Option.match(Record.get(followings, named), {
    onNone: () =>
      Stream.fail(
        new CliDaemonError({
          message:
            named === ''
              ? `Follow what? Name one of: ${Array.join(names, ', ')}. For example: follow ${Option.getOrElse(Array.head(names), () => 'screen')}`
              : `Nothing here is called "${named}" to follow. Follow one of: ${Array.join(names, ', ')}.`,
        }),
      ),
    onSome: following => following(flags, client),
  })
}

// SURFACE

const wordsOf = (token: string): ReadonlyArray<string> =>
  pipe(
    token.split(' '),
    Array.filter(word => word !== ''),
  )

/**
 * A CLI daemon surface for any bound Program. `show` paints; `do` runs the
 * words the view sent, on behalf of the client that asked, so a one-shot
 * `counter increment` is recorded as a `Cli` client's Message. A request
 * from a terminal UI view paints the Program to fit that terminal and
 * presses the key it read, so `runCliTuiView` shows the daemon's Program
 * live, and `onPainted` hears how long each of those frames took to paint.
 * `follow` serves the topics every Program has, see
 * {@link programFollowings}.
 */
export const programCliSurface = <Model, Message>(
  bound: BoundInteraction<Model, Message>,
  name: string,
  reporting: TerminalPaintReporting = {},
  inkOf?: (flags: CliDaemonFlags) => TerminalInk,
): CliDaemonSurface<Model, Message> => {
  const terminal = makeProgramTerminalView(bound, name, reporting, inkOf)
  return {
    read: () => Effect.sync(() => bound.readModel()),
    run: message =>
      Effect.sync(() => {
        const previous = bound.readModel()
        bound.send(message)
        return { model: bound.readModel(), previous }
      }),
    show: (flags, client) =>
      isTerminalViewRequest(flags)
        ? terminal.paint(flags, client)
        : Effect.sync(() => ({
            stdout: paintProgram(bound, name),
            exitCode: 0,
          })),
    do: (token, flags, client) =>
      isTerminalViewRequest(flags)
        ? terminal.pressKey(flags, client)
        : Effect.sync(() =>
            onBehalfOf(bound, client, () =>
              runProgramCommand(bound, name, wordsOf(token), flags),
            ),
          ),
    follow: (topic, flags, client) =>
      followTopicOf(
        programFollowings(bound, name, inkOf === undefined ? {} : { inkOf }),
        topic,
        flags,
        client,
      ),
  }
}

export { offeredBy }
