/**
 * The look of screen text on the web, shared by every web painter: dim
 * text such as the Session page's explanation reads smaller and gray, and
 * mono text such as a URI reads in a monospace face. Every selector sits
 * in `:where()`, so an app's own rule wins without `!important`.
 *
 * @example
 * ```tsx
 * <style href="foldkit-screen" precedence="foldkit">
 *   {Interaction.screenStylesheet}
 * </style>
 * ```
 */
export const screenStylesheet = `
:where(.fk-text[data-dim]) {
  font-size: 1rem;
  font-weight: 400;
  color: rgb(107 114 128);
}

:where(.fk-text[data-mono]) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
`
