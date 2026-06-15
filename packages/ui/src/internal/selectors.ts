/**
 * Builds a CSS id selector from an element's id value.
 *
 * The id is escaped with `CSS.escape` so values that are not valid CSS
 * identifiers on their own (most notably ids beginning with a digit, as
 * produced by UUID-prefixed ids) still yield a usable selector.
 */
export const idSelector = (id: string): string => `#${CSS.escape(id)}`
