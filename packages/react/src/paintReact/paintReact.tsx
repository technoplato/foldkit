import { Array, Match as M } from 'effect'
import type { ButtonNode, UiNode } from 'foldkit/renderers'
import { Fragment, type ReactElement } from 'react'

/** Extra class per node kind, appended after the fk-* base class. */
export type PaintClassNames = Partial<Record<UiNode['_tag'], string>>

/** How a painted tree reports presses and text input. */
export type PaintHandlers = Readonly<{
  onPress: (button: ButtonNode) => void
  onInput?: (token: string, value: string) => void
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
          if (text.href === undefined) {
            return (
              <div className={classFor('Text', 'fk-text')}>{text.content}</div>
            )
          }
          return (
            <div className={classFor('Text', 'fk-text')}>
              <a className="fk-text-link" href={text.href}>
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
