import { Array, Match as M } from 'effect'

import type {
  ButtonNode,
  TextInputNode,
  TextNode,
  TextPart,
  TranscriptNode,
  UiNode,
} from './types.js'

/** Reads every Text node, depth first. */
export const textsOf = (node: UiNode): ReadonlyArray<TextNode> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<TextNode>>(),
    M.tagsExhaustive({
      Text: text => [text],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Row: row => Array.flatMap(row.children, textsOf),
      Column: column => Array.flatMap(column.children, textsOf),
      Box: box => Array.flatMap(box.children, textsOf),
      Progress: () => [],
      List: () => [],
      Seek: () => [],
      Transcript: () => [],
      DeviceShell: shell => Array.flatMap(shell.children, textsOf),
    }),
  )

/** Reads every Button node, depth first. */
export const buttonsOf = (node: UiNode): ReadonlyArray<ButtonNode> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ButtonNode>>(),
    M.tagsExhaustive({
      Text: () => [],
      Button: button => [button],
      TextInput: () => [],
      Spacer: () => [],
      Row: row => Array.flatMap(row.children, buttonsOf),
      Column: column => Array.flatMap(column.children, buttonsOf),
      Box: box => Array.flatMap(box.children, buttonsOf),
      Progress: () => [],
      List: list => Array.flatMap(list.items, item => item.trailing ?? []),
      Seek: () => [],
      Transcript: () => [],
      DeviceShell: shell => Array.flatMap(shell.children, buttonsOf),
    }),
  )

/** Reads every TextInput node, depth first. */
export const inputsOf = (node: UiNode): ReadonlyArray<TextInputNode> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<TextInputNode>>(),
    M.tagsExhaustive({
      Text: () => [],
      Button: () => [],
      TextInput: input => [input],
      Spacer: () => [],
      Row: row => Array.flatMap(row.children, inputsOf),
      Column: column => Array.flatMap(column.children, inputsOf),
      Box: box => Array.flatMap(box.children, inputsOf),
      Progress: () => [],
      List: () => [],
      Seek: () => [],
      Transcript: () => [],
      DeviceShell: shell => Array.flatMap(shell.children, inputsOf),
    }),
  )

/**
 * Reads every Transcript node, depth first, so a surface that shows only
 * the words being read finds them wherever a screen puts them.
 */
export const transcriptsOf = (node: UiNode): ReadonlyArray<TranscriptNode> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<TranscriptNode>>(),
    M.tagsExhaustive({
      Text: () => [],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Row: row => Array.flatMap(row.children, transcriptsOf),
      Column: column => Array.flatMap(column.children, transcriptsOf),
      Box: box => Array.flatMap(box.children, transcriptsOf),
      Progress: () => [],
      List: () => [],
      Seek: () => [],
      Transcript: transcript => [transcript],
      DeviceShell: shell => Array.flatMap(shell.children, transcriptsOf),
    }),
  )

/**
 * A link on a screen: the words that name it and where it goes, such as
 * `{ title: 'Open Amazon sign-in', href: 'https://www.amazon.com/ap/signin?…' }`.
 */
export type ScreenLink = Readonly<{ title: string; href: string }>

const linksOfParts = (
  parts: ReadonlyArray<TextPart>,
): ReadonlyArray<ScreenLink> =>
  Array.flatMap(parts, part =>
    part._tag === 'Reference' && part.href !== undefined
      ? [{ title: part.label, href: part.href }]
      : [],
  )

/**
 * Reads every link on a screen, depth first, with the words that name it:
 * a Text with an `href`, a Reference inside rich text, and a List row
 * that is a link. A painter that cannot follow a link, such as terminal
 * text, lists them so a person still can.
 */
export const linksOf = (node: UiNode): ReadonlyArray<ScreenLink> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ScreenLink>>(),
    M.tagsExhaustive({
      Text: text => [
        ...(text.href === undefined
          ? []
          : [{ title: text.content, href: text.href }]),
        ...linksOfParts(text.parts ?? []),
      ],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Row: row => Array.flatMap(row.children, linksOf),
      Column: column => Array.flatMap(column.children, linksOf),
      Box: box => Array.flatMap(box.children, linksOf),
      Progress: () => [],
      List: list =>
        Array.flatMap(list.items, item =>
          item.href === undefined
            ? []
            : [{ title: item.title, href: item.href }],
        ),
      Seek: () => [],
      Transcript: () => [],
      DeviceShell: shell => Array.flatMap(shell.children, linksOf),
    }),
  )
