/**
 * The one look every graphical painter maps, in pixels and hex colors. The
 * web stylesheet is built from it and React Native reads it directly, so
 * the count, the buttons, and the Session Sheet's dim sentence look the
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
  backdropColor: string
  panelColor: string
  panelRadius: number
  panelWidth: number
  codeColor: string
  codeSize: number
  headlineSize: number
  headlineWeight: number
  accentColor: string
  accentSoftColor: string
  trackColor: string
  rowHoverColor: string
  listWidth: number
  itemImageSize: number
  ghostBorderColor: string
  destructiveColor: string
  readingSize: number
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
  backdropColor: 'rgb(15 23 42 / 0.4)',
  panelColor: '#ffffff',
  panelRadius: 14,
  panelWidth: 448,
  codeColor: '#f3f4f6',
  codeSize: 13,
  headlineSize: 30,
  headlineWeight: 700,
  accentColor: '#ea580c',
  accentSoftColor: '#ffedd5',
  trackColor: '#e5e7eb',
  rowHoverColor: '#f3f4f6',
  listWidth: 680,
  itemImageSize: 56,
  ghostBorderColor: '#d1d5db',
  destructiveColor: '#b91c1c',
  readingSize: 19,
}

const px = (value: number): string => `${value.toString()}px`

/**
 * The look of a screen on the web, shared by every web painter and built
 * from {@link screenLook}: columns and rows centered with their gaps,
 * Display text such as the count large, dim text such as the Session
 * page's explanation smaller and gray, mono text such as a URI in a
 * monospace face, buttons with their hover, disabled, and focus states,
 * the Program's Starting or Failed description, phone chrome, a screen
 * presented over the page by its style, such as a Dialog's centered panel
 * over a dimmed page, copyable commands with their copy button, and the
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

:where(.fk-column > .fk-column) {
  align-self: stretch;
}

:where(.fk-row) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
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

:where(.fk-text[data-emphasis='Headline']) {
  font-size: ${px(screenLook.headlineSize)};
  font-weight: ${screenLook.headlineWeight.toString()};
  line-height: 1.15;
  letter-spacing: -0.01em;
  text-align: center;
}

:where(.fk-text[data-dim]) {
  color: ${screenLook.dimColor};
  font-size: ${px(screenLook.dimSize)};
  font-weight: 400;
}

:where(.fk-text[data-mono]) {
  font-family: ${screenLook.monoFamily};
}

:where(.fk-text[data-copyable]) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${px(screenLook.rowGap)};
  box-sizing: border-box;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  background: ${screenLook.codeColor};
  font-family: ${screenLook.monoFamily};
  font-size: ${px(screenLook.codeSize)};
  text-align: left;
}

:where(.fk-copyable-text) {
  overflow-wrap: anywhere;
  user-select: all;
}

:where(.fk-copy-button) {
  flex: none;
  padding: 4px 10px;
  border: 1px solid ${screenLook.dimColor};
  border-radius: 6px;
  background: ${screenLook.panelColor};
  color: ${screenLook.textColor};
  font-family: inherit;
  font-size: ${px(screenLook.codeSize)};
  cursor: pointer;
  user-select: none;
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

:where(.fk-button[data-variant]) {
  border-radius: 999px;
}

:where(.fk-button[data-variant='Ghost']) {
  border: 1px solid ${screenLook.ghostBorderColor};
  background: transparent;
  color: ${screenLook.textColor};
}

:where(.fk-button[data-variant='Ghost']:hover) {
  background: ${screenLook.rowHoverColor};
}

:where(.fk-button[data-variant='Ghost']:disabled) {
  border-color: ${screenLook.trackColor};
  background: transparent;
  color: ${screenLook.buttonDisabledColor};
}

:where(.fk-button[data-variant='Destructive']) {
  background: ${screenLook.destructiveColor};
}

:where(.fk-progress) {
  appearance: none;
  display: block;
  width: 100%;
  height: 4px;
  border: 0;
  border-radius: 999px;
  background: ${screenLook.trackColor};
  overflow: hidden;
}

:where(.fk-progress)::-webkit-progress-bar {
  background: ${screenLook.trackColor};
}

:where(.fk-progress)::-webkit-progress-value {
  background: ${screenLook.accentColor};
}

:where(.fk-progress)::-moz-progress-bar {
  background: ${screenLook.accentColor};
}

:where(.fk-list) {
  box-sizing: border-box;
  width: min(100%, ${px(screenLook.listWidth)});
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: left;
}

:where(.fk-item) {
  display: flex;
  align-items: center;
  gap: ${px(screenLook.rowGap)};
  border-bottom: 1px solid ${screenLook.trackColor};
}

:where(.fk-item:last-child) {
  border-bottom: 0;
}

:where(.fk-item-press) {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 10px 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

:where(.fk-item-press:hover) {
  background: ${screenLook.rowHoverColor};
}

:where(.fk-item-press:focus-visible) {
  outline: 2px solid ${screenLook.focusColor};
  outline-offset: -2px;
}

:where(.fk-item-press:disabled) {
  cursor: default;
}

:where(.fk-item-press:disabled:hover) {
  background: transparent;
}

:where(.fk-item[data-current] .fk-item-title) {
  color: ${screenLook.accentColor};
}

:where(.fk-item-image) {
  flex: none;
  width: ${px(screenLook.itemImageSize)};
  height: ${px(screenLook.itemImageSize)};
  border-radius: 6px;
  object-fit: cover;
  box-shadow: 0 2px 8px -2px rgb(15 23 42 / 0.35);
}

:where(.fk-item-body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

:where(.fk-item-title) {
  overflow: hidden;
  color: ${screenLook.textColor};
  font-size: ${px(screenLook.bodySize)};
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:where(.fk-item-line) {
  overflow: hidden;
  color: ${screenLook.dimColor};
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:where(.fk-item-body .fk-progress) {
  margin-top: 6px;
}

:where(.fk-item > .fk-button) {
  flex: none;
  height: 36px;
  min-width: 0;
  padding: 0 14px;
}

:where(.fk-seek) {
  box-sizing: border-box;
  width: min(100%, ${px(screenLook.listWidth)});
  height: 24px;
  margin: 0;
  accent-color: ${screenLook.accentColor};
  cursor: pointer;
}

:where(.fk-transcript) {
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: min(100%, ${px(screenLook.listWidth)});
  max-height: min(58vh, 640px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 0;
  text-align: left;
  mask-image: linear-gradient(transparent, #000 24px, #000 calc(100% - 24px), transparent);
}

:where(.fk-transcript-empty) {
  margin: 0;
  color: ${screenLook.dimColor};
  text-align: center;
}

:where(.fk-passage) {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 8px;
  padding: 8px 10px;
  border-radius: 14px;
  transition: background-color 0.2s;
}

:where(.fk-passage[data-current]) {
  background: ${screenLook.rowHoverColor};
}

:where(.fk-passage-label) {
  align-self: start;
  padding-top: 5px;
  border: 0;
  background: none;
  color: ${screenLook.dimColor};
  font-family: ${screenLook.monoFamily};
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

:where(button.fk-passage-label) {
  cursor: pointer;
}

:where(button.fk-passage-label:hover) {
  color: ${screenLook.textColor};
}

:where(.fk-passage-words) {
  margin: 0;
  color: ${screenLook.textColor};
  font-size: ${px(screenLook.readingSize)};
  line-height: 1.7;
}

:where(.fk-word) {
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

:where(.fk-word:hover) {
  background: ${screenLook.trackColor};
}

:where(.fk-word[data-current]) {
  background: ${screenLook.accentSoftColor};
  box-shadow: 0 0 0 2px ${screenLook.accentSoftColor};
  color: #9a3412;
}

:where(.fk-device-phone) {
  box-sizing: border-box;
  width: min(100%, ${px(screenLook.deviceWidth)});
  padding: 24px 16px 32px;
  border: 2px solid ${screenLook.deviceBorderColor};
  border-radius: ${px(screenLook.deviceRadius)};
}

:where(.fk-overlay) {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: ${screenLook.backdropColor};
}

:where(.fk-overlay[data-style='Sheet'], .fk-overlay[data-style='BottomSheet']) {
  align-items: flex-end;
}

:where(.fk-overlay[data-style='Drawer']) {
  justify-content: flex-end;
}

:where(.fk-overlay[data-style='FullScreenCover']) {
  padding: 0;
  background: ${screenLook.panelColor};
}

:where(.fk-image) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  border-radius: 6px;
  object-fit: cover;
  box-shadow: 0 6px 18px -8px rgb(15 23 42 / 0.45);
}

:where(.fk-overlay .fk-button[data-keys])::after {
  content: attr(data-keys);
  margin-left: 8px;
  padding: 1px 6px;
  border: 1px solid rgb(255 255 255 / 0.4);
  border-radius: 4px;
  font-family: ${screenLook.monoFamily};
  font-size: 12px;
  opacity: 0.8;
}

:where(.fk-overlay > *) {
  box-sizing: border-box;
  width: min(100%, ${px(screenLook.panelWidth)});
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: ${px(screenLook.columnGap)};
  border-radius: ${px(screenLook.panelRadius)};
  background: ${screenLook.panelColor};
  box-shadow: 0 24px 64px -12px rgb(15 23 42 / 0.35);
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
