import { Array } from 'effect'

/** JSX-shaped ASCII atoms. Device chrome is a shell around this tree. */

/** A text run. */
export const Text = (content: string): TextNode => ({ _tag: 'Text', content })
/** A text run. */
export type TextNode = Readonly<{
  readonly _tag: 'Text'
  readonly content: string
}>

/** A pressable control. The device shell paints the label. */
export const Button = (fields: {
  readonly token: string
  readonly label: string
}): ButtonNode => ({ _tag: 'Button', ...fields })
/** A pressable control. */
export type ButtonNode = Readonly<{
  readonly _tag: 'Button'
  readonly token: string
  readonly label: string
}>

/** A horizontal stack. */
export const Row = (children: ReadonlyArray<UiNode>): RowNode => ({
  _tag: 'Row',
  children,
})
/** A horizontal stack. */
export type RowNode = Readonly<{
  readonly _tag: 'Row'
  readonly children: ReadonlyArray<UiNode>
}>

/** A vertical stack. */
export const Column = (children: ReadonlyArray<UiNode>): ColumnNode => ({
  _tag: 'Column',
  children,
})
/** A vertical stack. */
export type ColumnNode = Readonly<{
  readonly _tag: 'Column'
  readonly children: ReadonlyArray<UiNode>
}>

/** Host-neutral product tree. */
export type UiNode = TextNode | ButtonNode | RowNode | ColumnNode

const collectTexts = (node: UiNode): ReadonlyArray<TextNode> => {
  if (node._tag === 'Text') {
    return [node]
  }
  if (node._tag === 'Button') {
    return []
  }
  return Array.flatMap(node.children, collectTexts)
}

/** Reads every Text node, depth first. */
export const textsOf = (node: UiNode): ReadonlyArray<TextNode> =>
  collectTexts(node)

const collectButtons = (node: UiNode): ReadonlyArray<ButtonNode> => {
  if (node._tag === 'Button') {
    return [node]
  }
  if (node._tag === 'Text') {
    return []
  }
  return Array.flatMap(node.children, collectButtons)
}

/** Reads every Button node, depth first. */
export const buttonsOf = (node: UiNode): ReadonlyArray<ButtonNode> =>
  collectButtons(node)
