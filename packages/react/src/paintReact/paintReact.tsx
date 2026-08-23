import { Array, Match as M } from 'effect'
import type { UiNode } from 'foldkit/renderers'
import { Fragment, type ReactElement } from 'react'

/** Extra class per node kind, appended after the fk-* base class. */
export type PaintClassNames = Partial<Record<UiNode['_tag'], string>>

/** Paints a Program screen tree as React elements. A Button token becomes a click. */
export const paintReact = (
  node: UiNode,
  sendToken: (token: string) => void,
  classNames: PaintClassNames = {},
): ReactElement => {
  const classFor = (kind: UiNode['_tag'], base: string): string => {
    const extra = classNames[kind]
    return extra === undefined ? base : `${base} ${extra}`
  }
  const keyFor = (child: UiNode, index: number): string => {
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
        Button: button => {
          const token = button.token
          const onClick =
            token === undefined || button.disabled === true
              ? undefined
              : () => {
                  sendToken(token)
                }
          return (
            <button
              type="button"
              className={classFor('Button', 'fk-button')}
              disabled={button.disabled === true}
              onClick={onClick}
            >
              {button.label}
            </button>
          )
        },
        TextInput: input => (
          <div className={classFor('TextInput', 'fk-text-input')}>
            {input.value}
          </div>
        ),
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
