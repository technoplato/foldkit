import { Array, Match as M, Option, pipe } from 'effect'
import { type ButtonNode, type UiNode } from 'foldkit/renderers'
import { songbookScreen } from 'songbook-core-example'

const ANSI_BOLD = '\u001b[1m'
const ANSI_DIM = '\u001b[2m'
const ANSI_INVERSE = '\u001b[7m'
const ANSI_RESET = '\u001b[0m'

const rowSeparator = '  '

/** Resolves the key hints painted beside a Button token. */
export type PaintTuiOptions = Readonly<{
  keysForToken: (token: string) => ReadonlyArray<string>
}>

const blankRows = (rows: number): ReadonlyArray<string> => {
  if (rows <= 0) {
    return []
  }
  return Array.makeBy(rows, () => '')
}

const keyHint = (
  button: ButtonNode,
  keysForToken: PaintTuiOptions['keysForToken'],
): string => {
  if (button.token === undefined) {
    return button.label
  }
  return Option.getOrElse(
    Array.head(keysForToken(button.token)),
    () => button.label,
  )
}

const buttonText = (
  button: ButtonNode,
  keysForToken: PaintTuiOptions['keysForToken'],
): string => {
  const name = button.token === undefined ? button.label : button.token
  const hint = keyHint(button, keysForToken)
  if (button.disabled === true) {
    return `${ANSI_DIM}[${hint}] ${name}${ANSI_RESET}`
  }
  return `${ANSI_INVERSE}[${hint}]${ANSI_RESET} ${name}`
}

const textLine = (content: string, isDim: boolean): string => {
  if (isDim) {
    return `${ANSI_DIM}${content}${ANSI_RESET}`
  }
  return `${ANSI_BOLD}${content}${ANSI_RESET}`
}

/**
 * Paints a Program screen tree as ANSI terminal text. A Button paints
 * its key hint from the Action `keys` metadata, so the screen window
 * and the keymap always agree.
 */
export const paintTui = (
  model: Parameters<typeof songbookScreen>[0],
  options: PaintTuiOptions,
): string => paintLines(songbookScreen(model), options).join('\n')

const paintLines = (
  node: UiNode,
  options: PaintTuiOptions,
): ReadonlyArray<string> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      Text: text => [textLine(text.content, text.dim === true)],
      Button: button => [buttonText(button, options.keysForToken)],
      TextInput: input => [input.value],
      Spacer: spacer => blankRows(spacer.rows),
      Row: row => [
        pipe(
          row.children,
          Array.map(child => paintLines(child, options).join(' ')),
          Array.join(rowSeparator),
        ),
      ],
      Column: column => stackLines(column.children, column.gap, options),
      Box: box =>
        pipe(
          stackLines(box.children, 0, options),
          Array.map(line => `${' '.repeat(box.padding)}${line}`),
        ),
      DeviceShell: shell => [
        textLine(
          shell.title === undefined
            ? shell.device
            : `${shell.device}  ${shell.title}`,
          true,
        ),
        ...stackLines(shell.children, 0, options),
      ],
    }),
  )

const stackLines = (
  children: ReadonlyArray<UiNode>,
  gap: number,
  options: PaintTuiOptions,
): ReadonlyArray<string> =>
  pipe(
    children,
    Array.map(child => paintLines(child, options)),
    Array.intersperse(blankRows(gap)),
    Array.flatten,
  )
