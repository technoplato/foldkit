import { Array, Match as M } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import type { ButtonNode, UiNode } from 'foldkit/renderers'
import { Fragment, type ReactElement, useEffect, useState } from 'react'

/** Extra class per node kind, appended after the fk-* base class. */
export type PaintClassNames = Partial<Record<UiNode['_tag'], string>>

const copiedResetMs = 1500

const CopyButton = ({ text }: Readonly<{ text: string }>): ReactElement => {
  const [isCopied, setIsCopied] = useState(false)
  useEffect(() => {
    if (!isCopied) {
      return undefined
    }
    const timer = setTimeout(() => {
      setIsCopied(false)
    }, copiedResetMs)
    return () => {
      clearTimeout(timer)
    }
  }, [isCopied])
  return (
    <button
      type="button"
      className="fk-copy-button"
      title={text}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setIsCopied(true)
        })
      }}
    >
      {Interaction.copyButtonLabelOf(isCopied)}
    </button>
  )
}

/**
 * How a painted tree reports presses, text input, and link follows.
 * `onLink` sees only plain primary clicks and returns true when it handled
 * the link, such as opening an in-app URI, so the browser does not load
 * the page. A modified click, such as Cmd-click, stays with the browser.
 */
export type PaintHandlers = Readonly<{
  onPress: (button: ButtonNode) => void
  onInput?: (token: string, value: string) => void
  onLink?: (href: string) => boolean
  classNames?: PaintClassNames
}>

/**
 * Paints a Program screen tree as React elements. A Button press reports
 * the whole node, so a Client can send its Catalog `action` or its legacy
 * `token`. A disabled Button carries its `because` sentence as the title.
 */
export const paintTree = (
  node: UiNode,
  handlers: PaintHandlers,
): ReactElement => {
  const classNames = handlers.classNames ?? {}
  const classFor = (kind: UiNode['_tag'], base: string): string => {
    const extra = classNames[kind]
    return extra === undefined ? base : `${base} ${extra}`
  }
  const keyFor = (child: UiNode, index: number): string => {
    if (child._tag === 'Button' && child.action !== undefined) {
      return `button-${child.action}`
    }
    if (child._tag === 'Button' && child.token !== undefined) {
      return `button-${child.token}`
    }
    return `${child._tag}-${index}`
  }
  const paintChildren = (
    children: ReadonlyArray<UiNode>,
  ): ReadonlyArray<ReactElement> =>
    Array.map(children, (child, index) => (
      <Fragment key={keyFor(child, index)}>{paint(child)}</Fragment>
    ))
  const paint = (current: UiNode): ReactElement =>
    M.value(current).pipe(
      M.withReturnType<ReactElement>(),
      M.tagsExhaustive({
        Text: text => {
          const href = text.href
          const attributes = {
            className: classFor('Text', 'fk-text'),
            ...(text.label === undefined ? {} : { 'aria-label': text.label }),
            ...(text.dim === true ? { 'data-dim': true } : {}),
            ...(text.mono === true ? { 'data-mono': true } : {}),
            ...(text.emphasis === undefined
              ? {}
              : { 'data-emphasis': text.emphasis }),
          }
          if (text.copyable === true) {
            return (
              <div {...attributes} data-copyable>
                <span className="fk-copyable-text">{text.content}</span>
                <CopyButton text={text.content} />
              </div>
            )
          } else if (href === undefined) {
            return <div {...attributes}>{text.content}</div>
          }
          return (
            <div {...attributes}>
              <a
                className="fk-text-link"
                href={href}
                onClick={event => {
                  if (
                    Navigation.isPlainClick(event) &&
                    handlers.onLink !== undefined &&
                    handlers.onLink(href)
                  ) {
                    event.preventDefault()
                  }
                }}
              >
                {text.content}
              </a>
            </div>
          )
        },
        Button: button => (
          <button
            type="button"
            className={classFor('Button', 'fk-button')}
            disabled={button.disabled === true}
            title={button.because}
            data-action={button.action}
            data-keys={button.keys?.join(' ')}
            aria-keyshortcuts={button.keys?.join(' ')}
            onClick={
              button.disabled === true
                ? undefined
                : () => {
                    handlers.onPress(button)
                  }
            }
          >
            {button.label}
          </button>
        ),
        TextInput: input => {
          const token = input.token
          return (
            <input
              type="text"
              className={classFor('TextInput', 'fk-text-input')}
              value={input.value}
              placeholder={input.placeholder}
              autoFocus={input.focused === true}
              onChange={event => {
                if (token !== undefined && handlers.onInput !== undefined) {
                  handlers.onInput(token, event.currentTarget.value)
                }
              }}
            />
          )
        },
        Spacer: () => <div className={classFor('Spacer', 'fk-spacer')} />,
        Row: row => (
          <div className={classFor('Row', 'fk-row')}>
            {paintChildren(row.children)}
          </div>
        ),
        Column: column => (
          <div className={classFor('Column', 'fk-column')}>
            {paintChildren(column.children)}
          </div>
        ),
        Box: box => (
          <div className={classFor('Box', 'fk-box')}>
            {paintChildren(box.children)}
          </div>
        ),
        DeviceShell: shell => (
          <div
            className={classFor(
              'DeviceShell',
              `fk-device fk-device-${shell.device}`,
            )}
          >
            {paintChildren(shell.children)}
          </div>
        ),
      }),
    )
  return paint(node)
}

/** Paints a Program screen tree as React elements. A Button token becomes a click. */
export const paintReact = (
  node: UiNode,
  sendToken: (token: string) => void,
  classNames: PaintClassNames = {},
): ReactElement =>
  paintTree(node, {
    classNames,
    onPress: button => {
      if (button.token !== undefined) {
        sendToken(button.token)
      }
    },
    onInput: (token, value) => {
      sendToken(`${token}${value}`)
    },
  })

/**
 * The shared screen stylesheet, `Interaction.screenStylesheet`, added to
 * the document head once however many screens render it.
 *
 * @example
 * ```tsx
 * <>
 *   <ScreenStyles />
 *   {paintTree(node, handlers)}
 * </>
 * ```
 */
export const ScreenStyles = (): ReactElement => (
  <style href="foldkit-screen" precedence="foldkit">
    {Interaction.screenStylesheet}
  </style>
)
