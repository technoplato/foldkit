/**
 * The one look every graphical painter maps, in pixels and hex colors. The
 * web stylesheet is built from it and React Native reads it directly, so
 * the count, the buttons, and the Session page's dim sentence look the
 * same in React, Svelte, Foldkit HTML, and Expo. Terminals keep only what
 * a terminal can show: Display text paints bold and dim text paints dim.
 *
 * @example
 * ```typescript
 * screenLook.displaySize // 72, the count's size
 * screenLook.buttonColor // '#000000'
 * ```
 */
export type ScreenLook = Readonly<{
  textColor: string
  bodySize: number
  displaySize: number
  displayWeight: number
  dimColor: string
  dimSize: number
  linkColor: string
  monoFamily: string
  buttonColor: string
  buttonHoverColor: string
  buttonDisabledColor: string
  buttonLabelColor: string
  buttonLabelSize: number
  buttonLabelWeight: number
  buttonHeight: number
  buttonMinWidth: number
  buttonPaddingX: number
  focusColor: string
  rowGap: number
  columnGap: number
  deviceBorderColor: string
  deviceRadius: number
  deviceWidth: number
}>

/** The look every graphical painter maps; see {@link ScreenLook}. */
export const screenLook: ScreenLook = {
  textColor: '#111827',
  bodySize: 16,
  displaySize: 72,
  displayWeight: 600,
  dimColor: '#6b7280',
  dimSize: 16,
  linkColor: '#2563eb',
  monoFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  buttonColor: '#000000',
  buttonHoverColor: '#374151',
  buttonDisabledColor: '#d1d5db',
  buttonLabelColor: '#ffffff',
  buttonLabelSize: 14,
  buttonLabelWeight: 500,
  buttonHeight: 48,
  buttonMinWidth: 80,
  buttonPaddingX: 16,
  focusColor: '#111827',
  rowGap: 12,
  columnGap: 24,
  deviceBorderColor: '#3f3f46',
  deviceRadius: 32,
  deviceWidth: 352,
}

const px = (value: number): string => `${value.toString()}px`

/**
 * The look of a screen on the web, shared by every web painter and built
 * from {@link screenLook}: columns and rows centered with their gaps,
 * Display text such as the count large, dim text such as the Session
 * page's explanation smaller and gray, mono text such as a URI in a
 * monospace face, buttons with their hover, disabled, and focus states,
 * the Program's Starting or Failed description, phone chrome, and the
 * action menu opener. Every selector sits in `:where()`, so an app's own
 * rule wins without `!important`.
 *
 * @example
 * ```tsx
 * <style href="foldkit-screen" precedence="foldkit">
 *   {Interaction.screenStylesheet}
 * </style>
 * ```
 */
export const screenStylesheet = `
:where(.fk-column) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${px(screenLook.columnGap)};
}

:where(.fk-row) {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${px(screenLook.rowGap)};
}

:where(.fk-text) {
  color: ${screenLook.textColor};
  font-size: ${px(screenLook.bodySize)};
  overflow-wrap: anywhere;
}

:where(.fk-text[data-emphasis='Display']) {
  font-size: ${px(screenLook.displaySize)};
  font-weight: ${screenLook.displayWeight.toString()};
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

:where(.fk-text[data-dim]) {
  color: ${screenLook.dimColor};
  font-size: ${px(screenLook.dimSize)};
  font-weight: 400;
}

:where(.fk-text[data-mono]) {
  font-family: ${screenLook.monoFamily};
}

:where(.fk-status) {
  margin: 0;
  color: ${screenLook.textColor};
  font-size: ${px(screenLook.bodySize)};
  text-align: center;
  white-space: pre-line;
}

:where(.fk-text-link) {
  color: ${screenLook.linkColor};
}

:where(.fk-button) {
  box-sizing: border-box;
  height: ${px(screenLook.buttonHeight)};
  min-width: ${px(screenLook.buttonMinWidth)};
  padding: 0 ${px(screenLook.buttonPaddingX)};
  border: 0;
  background: ${screenLook.buttonColor};
  color: ${screenLook.buttonLabelColor};
  font-family: inherit;
  font-size: ${px(screenLook.buttonLabelSize)};
  font-weight: ${screenLook.buttonLabelWeight.toString()};
  cursor: pointer;
}

:where(.fk-button:hover) {
  background: ${screenLook.buttonHoverColor};
}

:where(.fk-button:focus-visible) {
  outline: 2px solid ${screenLook.focusColor};
  outline-offset: 2px;
}

:where(.fk-button:disabled) {
  background: ${screenLook.buttonDisabledColor};
  cursor: not-allowed;
}

:where(.fk-device-phone) {
  box-sizing: border-box;
  width: min(100%, ${px(screenLook.deviceWidth)});
  padding: 24px 16px 32px;
  border: 2px solid ${screenLook.deviceBorderColor};
  border-radius: ${px(screenLook.deviceRadius)};
}

:where(.fk-action-menu-opener) {
  border: 0;
  background: none;
  color: ${screenLook.dimColor};
  font-family: inherit;
  font-size: ${px(screenLook.buttonLabelSize)};
  cursor: pointer;
  text-underline-offset: 4px;
}

:where(.fk-action-menu-opener:hover) {
  text-decoration: underline;
}
`
