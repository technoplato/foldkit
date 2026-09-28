import type { UiNode } from 'foldkit/renderers'

/**
 * Extra class per node kind, appended after the fk-* base class.
 *
 * @example
 * ```typescript
 * const classNames: PaintClassNames = { Text: 'text-7xl font-semibold' }
 * ```
 */
export type PaintClassNames = Readonly<Partial<Record<UiNode['_tag'], string>>>

/** The fk-* base class for one node kind, plus the caller's class. */
export const classFor = (
  classNames: PaintClassNames,
  kind: UiNode['_tag'],
  base: string,
): string => {
  const extra = classNames[kind]
  return extra === undefined ? base : `${base} ${extra}`
}

/** A stable key for one child: its Catalog action, else kind and position. */
export const keyFor = (child: UiNode, index: number): string =>
  child._tag === 'Button' && child.action !== undefined
    ? `button-${child.action}`
    : `${child._tag}-${index.toString()}`
