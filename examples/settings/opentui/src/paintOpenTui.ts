import { Array, Match as M, Option } from 'effect'
import { type UiNode } from 'foldkit/renderers'

import {
  BoxRenderable,
  type RenderContext,
  type Renderable,
  TextRenderable,
  bold,
  dim,
  t,
} from '@opentui/core'

const buttonPaddingX = 1

/** Wires Button tokens to taps and key hints. */
export type PaintOpenTuiOptions = Readonly<{
  keysForToken: (token: string) => ReadonlyArray<string>
  onTap: (token: string) => void
}>

const keyHint = (
  label: string,
  token: string | undefined,
  keysForToken: PaintOpenTuiOptions['keysForToken'],
): string => {
  if (token === undefined) {
    return label
  }
  return Option.getOrElse(Array.head(keysForToken(token)), () => label)
}

const addChildren = (
  ctx: RenderContext,
  parent: Renderable,
  children: ReadonlyArray<UiNode>,
  options: PaintOpenTuiOptions,
): Renderable => {
  for (const child of children) {
    parent.add(paintOpenTui(ctx, child, options))
  }
  return parent
}

/**
 * Maps a Program screen tree to an OpenTUI renderable tree. A Button
 * becomes a bordered box: its key hint comes from the Action `keys`
 * metadata and a mouse press taps its token. The painter makes zero
 * business decisions; a Button absent from the tree is simply never
 * constructed.
 */
export const paintOpenTui = (
  ctx: RenderContext,
  node: UiNode,
  options: PaintOpenTuiOptions,
): Renderable =>
  M.value(node).pipe(
    M.withReturnType<Renderable>(),
    M.tagsExhaustive({
      Text: text =>
        new TextRenderable(ctx, {
          content:
            text.dim === true
              ? t`${dim(text.content)}`
              : t`${bold(text.content)}`,
        }),
      Button: button => {
        const hint = keyHint(button.label, button.token, options.keysForToken)
        const name = button.token === undefined ? button.label : button.token
        const isTappable =
          button.token !== undefined && button.disabled !== true
        const token = button.token
        const box = new BoxRenderable(ctx, {
          border: true,
          paddingLeft: buttonPaddingX,
          paddingRight: buttonPaddingX,
          ...(isTappable && token !== undefined
            ? {
                onMouseDown: () => {
                  options.onTap(token)
                },
              }
            : {}),
        })
        box.add(
          new TextRenderable(ctx, {
            content:
              button.disabled === true
                ? t`${dim(`[${hint}] ${name}`)}`
                : t`${bold(`[${hint}]`)} ${name}`,
          }),
        )
        return box
      },
      TextInput: input => new TextRenderable(ctx, { content: input.value }),
      Spacer: spacer => new BoxRenderable(ctx, { height: spacer.rows }),
      Row: row =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'row',
            columnGap: row.gap,
          }),
          row.children,
          options,
        ),
      Column: column =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'column',
            rowGap: column.gap,
          }),
          column.children,
          options,
        ),
      Box: box =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'column',
            padding: box.padding,
          }),
          box.children,
          options,
        ),
      DeviceShell: shell =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'column',
            border: true,
            title: shell.title === undefined ? shell.device : shell.title,
          }),
          shell.children,
          options,
        ),
    }),
  )
