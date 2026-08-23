import { Array, Match as M, pipe } from 'effect'
import { type ButtonNode, type UiNode, buttonsOf } from 'foldkit/renderers'
import { songbookScreen } from 'songbook-core-example'

/** One argv command derived from a screen Button token. */
export type CliCommand = Readonly<{
  token: string
  label: string
  what: string
}>

/** A one-shot plain-text painting of a Program screen tree. */
export type CliPainting = Readonly<{
  screen: string
  commands: ReadonlyArray<CliCommand>
  usage: string
}>

/** Names the binary in usage and the `what` sentence per command token. */
export type PaintCliOptions = Readonly<{
  binaryName: string
  whatFor: (token: string) => string
}>

const minimumRowGap = 1
const usageColumnGap = 3

const blankRows = (rows: number): ReadonlyArray<string> => {
  if (rows <= 0) {
    return []
  }
  return Array.makeBy(rows, () => '')
}

const buttonText = (button: ButtonNode): string => {
  if (button.token === undefined) {
    return `[${button.label}]`
  }
  return `[${button.token}]`
}

const paintLines = (node: UiNode): ReadonlyArray<string> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      Text: text => [text.content],
      Button: button => [buttonText(button)],
      TextInput: input => [input.value],
      Spacer: spacer => blankRows(spacer.rows),
      Row: row => [
        pipe(
          row.children,
          Array.map(child => paintLines(child).join(' ')),
          Array.join(' '.repeat(Math.max(row.gap, minimumRowGap))),
        ),
      ],
      Column: column => stackLines(column.children, column.gap),
      Box: box =>
        pipe(
          stackLines(box.children, 0),
          Array.map(line => `${' '.repeat(box.padding)}${line}`),
        ),
      DeviceShell: shell => [
        deviceLine(shell.device, shell.title),
        ...stackLines(shell.children, 0),
      ],
    }),
  )

const stackLines = (
  children: ReadonlyArray<UiNode>,
  gap: number,
): ReadonlyArray<string> =>
  pipe(
    children,
    Array.map(paintLines),
    Array.intersperse(blankRows(gap)),
    Array.flatten,
  )

const deviceLine = (device: string, title: string | undefined): string => {
  if (title === undefined) {
    return device
  }
  return `${device}  ${title}`
}

const commandsOf = (
  node: UiNode,
  whatFor: (token: string) => string,
): ReadonlyArray<CliCommand> =>
  pipe(
    buttonsOf(node),
    Array.flatMap(button => {
      if (button.token === undefined || button.disabled === true) {
        return []
      }
      return [
        {
          token: button.token,
          label: button.label,
          what: whatFor(button.token),
        },
      ]
    }),
  )

const usageOf = (
  commands: ReadonlyArray<CliCommand>,
  binaryName: string,
): string => {
  const listing = Array.match(commands, {
    onEmpty: () => ['  (none)'],
    onNonEmpty: nonEmpty => {
      const tokenWidth = pipe(
        nonEmpty,
        Array.map(command => command.token.length),
        Array.reduce(0, (width, length) => Math.max(width, length)),
      )
      return Array.map(
        nonEmpty,
        command =>
          `  ${command.token.padEnd(tokenWidth + usageColumnGap)}${command.what}`,
      )
    },
  })
  return ['commands', ...listing, '', `run: ${binaryName} <command>`].join('\n')
}

/**
 * Paints a Program screen tree for one command invocation. A Button
 * token becomes an argv command, so the usage listing is the screen's
 * own vocabulary: a Button absent from the tree is a command absent
 * from usage.
 */
export const paintCli = (
  model: Parameters<typeof songbookScreen>[0],
  options: PaintCliOptions,
): CliPainting => {
  const node = songbookScreen(model)
  const commands = commandsOf(node, options.whatFor)
  return {
    screen: paintLines(node).join('\n'),
    commands,
    usage: usageOf(commands, options.binaryName),
  }
}
