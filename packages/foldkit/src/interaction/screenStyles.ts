import { defaultTheme, roleVar, themeStylesheet } from '../theme/theme.js'

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
  readingWidth: number
  readingFamily: string
  readingDarkGround: string
  currentPassageColor: string
  restingWordsColor: string
  itemImageSize: number
  ghostBorderColor: string
  destructiveColor: string
  readingSize: number
  fieldHeight: number
  fieldColor: string
  checkSize: number
  checkBorderColor: string
  listColumnWidth: number
  drawerWidth: number
  drawerDockWidth: number
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
  readingWidth: 1200,
  readingFamily: "'Iowan Old Style', Charter, 'Source Serif 4', Georgia, serif",
  readingDarkGround: 'linear-gradient(#12301d, #060907 42%)',
  currentPassageColor: '#e8ecf2',
  restingWordsColor: '#6b7280',
  itemImageSize: 56,
  ghostBorderColor: '#d1d5db',
  destructiveColor: '#b91c1c',
  readingSize: 24,
  fieldHeight: 44,
  fieldColor: '#f9fafb',
  checkSize: 24,
  checkBorderColor: '#c7c7cc',
  listColumnWidth: 64,
  drawerWidth: 420,
  drawerDockWidth: 1100,
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
 * over a dimmed page, copyable commands with their copy button, the
 * action menu opener, text fields at 16px or more so iPhone Safari does
 * not zoom into them, and a list row's round check, filled once ticked,
 * with the row's title dimmed. Every selector sits in `:where()`, so an
 * app's own rule wins without `!important`.
 *
 * @example
 * ```tsx
 * <style href="foldkit-screen" precedence="foldkit">
 *   {Interaction.screenStylesheet}
 * </style>
 * ```
 */
export const screenStylesheet = `
${themeStylesheet(defaultTheme)}
:where(.fk-column) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${px(screenLook.columnGap)};
}

:where(.fk-board) {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  justify-content: flex-start;
  overflow-x: auto;
}

:where(.fk-board > *) {
  flex: none;
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
  color: ${roleVar('Text')};
  font-size: ${px(screenLook.bodySize)};
  overflow-wrap: anywhere;
  text-wrap: pretty;
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
  color: ${roleVar('QuietText')};
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
  background: ${roleVar('Surface')};
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
  border: 1px solid ${roleVar('QuietText')};
  border-radius: 6px;
  background: ${roleVar('RaisedSurface')};
  color: ${roleVar('Text')};
  font-family: inherit;
  font-size: ${px(screenLook.codeSize)};
  cursor: pointer;
  user-select: none;
}

:where(.fk-status) {
  margin: 0;
  color: ${roleVar('Text')};
  font-size: ${px(screenLook.bodySize)};
  text-align: center;
  white-space: pre-line;
}

:where(.fk-text-link) {
  color: ${roleVar('Link')};
}

:where(.fk-ref) {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  max-width: 100%;
  padding: 0 6px;
  border-radius: 6px;
  background: ${roleVar('Surface')};
  color: ${roleVar('Text')};
  text-decoration: none;
  white-space: nowrap;
}

:where(a.fk-ref:hover, a.fk-ref:focus-visible) {
  background: ${roleVar('Rule')};
}

:where(.fk-ref-label) {
  color: ${roleVar('Link')};
  font-family: ${screenLook.monoFamily};
  font-size: 0.9em;
}

:where(.fk-ref-title) {
  max-width: 36ch;
  overflow: hidden;
  text-overflow: ellipsis;
}

:where(.fk-ref-state) {
  color: ${roleVar('QuietText')};
  font-size: 0.8em;
}

:where(.fk-layer) {
  position: fixed;
  inset: 0;
  z-index: 900;
}

:where(.fk-layer-backdrop) {
  position: absolute;
  inset: 0;
  background: ${roleVar('Scrim')};
}

:where(.fk-layer-surface) {
  position: absolute;
  box-sizing: border-box;
  overflow: auto;
  padding: 16px;
  background: ${roleVar('RaisedSurface')};
  box-shadow: 0 24px 64px ${roleVar('Shadow')};
}

:where(.fk-layer-surface:focus) {
  outline: none;
}

:where(.fk-layer[data-layer='Dialog'] > .fk-layer-surface) {
  top: 12vh;
  left: 50%;
  width: min(92vw, ${px(screenLook.listWidth)});
  max-height: 70vh;
  border-radius: ${px(screenLook.panelRadius)};
  transform: translateX(-50%);
}

:where(.fk-layer[data-layer='Panel'] > .fk-layer-surface) {
  top: 0;
  right: 0;
  bottom: 0;
  width: min(100vw, ${px(screenLook.panelWidth + 112)});
}

:where(.fk-button) {
  box-sizing: border-box;
  height: ${px(screenLook.buttonHeight)};
  min-width: ${px(screenLook.buttonMinWidth)};
  padding: 0 ${px(screenLook.buttonPaddingX)};
  border: 0;
  background: ${roleVar('Button')};
  color: ${roleVar('ButtonLabel')};
  font-family: inherit;
  font-size: ${px(screenLook.buttonLabelSize)};
  font-weight: ${screenLook.buttonLabelWeight.toString()};
  cursor: pointer;
}

@media (hover: hover) {
  :where(.fk-button:hover) {
    background: ${roleVar('ButtonHover')};
  }
}

:where(.fk-button:focus-visible) {
  outline: 2px solid ${roleVar('Focus')};
  outline-offset: 2px;
}

:where(.fk-button:disabled) {
  background: ${roleVar('ButtonDisabled')};
  cursor: not-allowed;
}

:where(.fk-button[data-variant]) {
  border-radius: 999px;
}

:where(.fk-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

:where(.fk-icon) {
  flex: none;
  width: 22px;
  height: 22px;
}

:where(.fk-icon-figure) {
  font: 700 7.5px/1 system-ui, sans-serif;
}

:where(.fk-button[data-icon-only]) {
  min-width: 44px;
  width: 44px;
  height: 44px;
  padding: 0;
}

:where(.fk-button[data-icon-only][data-variant='Primary']) {
  width: 56px;
  height: 56px;
}

:where(.fk-button[data-icon-only][data-variant='Primary'] .fk-icon) {
  width: 28px;
  height: 28px;
}

:where(.fk-button[data-icon-only][data-variant='Ghost']) {
  border-color: transparent;
}

:where(.fk-visually-hidden) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

:where(.fk-button[data-variant='Tab']) {
  flex: 1;
  flex-direction: column;
  gap: 2px;
  height: 52px;
  min-width: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: ${roleVar('QuietText')};
  font-size: 11px;
  font-weight: 600;
}

:where(.fk-button[data-variant='Tab'][data-current]) {
  color: ${roleVar('Text')};
}

:where(.fk-dock) {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 800;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 0 0 env(safe-area-inset-bottom);
  border-top: 1px solid ${roleVar('Rule')};
  background: ${roleVar('Veil')};
  backdrop-filter: blur(18px);
}

:where(.fk-dock > *) {
  width: min(100%, ${px(screenLook.listWidth)});
  margin: 0 auto;
}

:where(.fk-dock .fk-row) {
  flex-wrap: nowrap;
  gap: 0;
}

:where(.fk-dock .fk-list) {
  width: min(100%, ${px(screenLook.listWidth)});
}

:where(.fk-dock .fk-item) {
  padding: 0 8px;
  border-bottom: 1px solid ${roleVar('Rule')};
}

:where(.fk-dock .fk-item-image) {
  width: 44px;
  height: 44px;
}

:where(body) {
  padding-bottom: var(--fk-dock-height, 0px);
}

:where(.fk-button[data-variant='Ghost']) {
  border: 1px solid ${roleVar('Border')};
  background: transparent;
  color: ${roleVar('Text')};
}

@media (hover: hover) {
  :where(.fk-button[data-variant='Ghost']:hover) {
    background: ${roleVar('Surface')};
  }
}

:where(.fk-button[data-variant='Ghost']:disabled) {
  border-color: ${roleVar('Rule')};
  background: transparent;
  color: ${roleVar('ButtonDisabled')};
}

:where(.fk-button[data-variant='Destructive']) {
  background: ${roleVar('Danger')};
}

:where(.fk-progress) {
  appearance: none;
  display: block;
  width: 100%;
  height: 4px;
  border: 0;
  border-radius: 999px;
  background: ${roleVar('Rule')};
  overflow: hidden;
}

:where(.fk-progress)::-webkit-progress-bar {
  background: ${roleVar('Rule')};
}

:where(.fk-progress)::-webkit-progress-value {
  background: ${roleVar('Accent')};
}

:where(.fk-progress)::-moz-progress-bar {
  background: ${roleVar('Accent')};
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
  border-bottom: 1px solid ${roleVar('Rule')};
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
  text-decoration: none;
  cursor: pointer;
}

@media (hover: hover) {
  :where(.fk-item-press:hover) {
    background: ${roleVar('Surface')};
  }
}

:where(.fk-item-press:focus-visible) {
  outline: 2px solid ${roleVar('Focus')};
  outline-offset: -2px;
}

:where(.fk-item-press:disabled) {
  cursor: default;
}

:where(.fk-item-press:disabled:hover) {
  background: transparent;
}

:where(.fk-item-image) {
  flex: none;
  width: ${px(screenLook.itemImageSize)};
  height: ${px(screenLook.itemImageSize)};
  border-radius: 6px;
  object-fit: cover;
  box-shadow: 0 2px 8px -2px ${roleVar('Shadow')};
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
  color: ${roleVar('Text')};
  font-size: ${px(screenLook.bodySize)};
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:where(.fk-item-line) {
  overflow: hidden;
  color: ${roleVar('QuietText')};
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:where(.fk-item-body .fk-progress) {
  margin-top: 6px;
}

:where(.fk-item > .fk-button) {
  flex: none;
  height: 44px;
  min-width: 44px;
  padding: 0 14px;
}

:where(.fk-seek) {
  box-sizing: border-box;
  width: min(100%, ${px(screenLook.listWidth)});
  height: 24px;
  margin: 0;
  accent-color: ${roleVar('Accent')};
  cursor: pointer;
}

:where(.fk-transcript) {
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: min(100%, ${px(screenLook.readingWidth)});
  max-height: min(58vh, 640px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 16px;
  border-radius: 18px;
  background: ${roleVar('ReadingGround')};
  text-align: left;
}

:where(.fk-transcript-empty) {
  margin: 0;
  color: ${roleVar('ReadingToCome')};
  text-align: center;
}

:where(.fk-passage) {
  display: block;
  padding: 10px 16px;
  border-radius: 14px;
  transition: background-color 0.2s;
}

:where(.fk-passage[data-current]) {
  background: ${roleVar('ReadingCurrentGround')};
  box-shadow: inset 3px 0 0 ${roleVar('ReadingRule')};
}

:where(.fk-passage-heading) {
  margin: 14px 0 8px;
  padding-left: 12px;
  border-left: 3px solid ${roleVar('ReadingRule')};
  color: ${roleVar('ReadingRule')};
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

:where(.fk-passage-label) {
  float: left;
  margin: 0 14px 0 0;
  padding: 11px 0 0;
  border: 0;
  background: none;
  color: ${roleVar('ReadingToCome')};
  font-family: ${screenLook.monoFamily};
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

:where(button.fk-passage-label) {
  cursor: pointer;
}

:where(button.fk-passage-label:hover) {
  color: ${roleVar('ReadingSpoken')};
}

:where(.fk-passage-words) {
  margin: 0;
  color: ${roleVar('ReadingToCome')};
  font-family: ${screenLook.readingFamily};
  font-size: ${px(screenLook.readingSize)};
  line-height: 1.55;
  transition: color 0.2s;
}

:where(.fk-passage[data-current] .fk-passage-words) {
  color: ${roleVar('ReadingSpoken')};
}

:where(.fk-word) {
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s;
}

@media (hover: hover) {
  :where(.fk-word:hover) {
    background: ${roleVar('ReadingCurrentGround')};
  }
}

:where(.fk-passage[data-current] .fk-word[data-current] ~ .fk-word) {
  color: ${roleVar('ReadingToCome')};
}

:where(.fk-word[data-current]) {
  background: ${roleVar('ReadingCurrentWordGround')};
  box-shadow: 0 0 0 2px ${roleVar('ReadingCurrentWordGround')};
  color: ${roleVar('ReadingCurrentWord')};
}

:where(.fk-device-phone) {
  box-sizing: border-box;
  width: min(100%, ${px(screenLook.deviceWidth)});
  padding: 24px 16px 32px;
  border: 2px solid ${roleVar('DeviceBorder')};
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
  background: ${roleVar('Scrim')};
}

:where(.fk-overlay[data-style='Sheet'], .fk-overlay[data-style='BottomSheet']) {
  align-items: flex-end;
}

:where(.fk-overlay[data-style='Drawer']) {
  justify-content: flex-end;
}

:where(.fk-overlay[data-style='FullScreenCover']) {
  padding: 0;
  background: ${roleVar('RaisedSurface')};
}

:where(.fk-image) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  border-radius: 6px;
  object-fit: cover;
  box-shadow: 0 6px 18px -8px ${roleVar('Shadow')};
}

:where(.fk-overlay .fk-button[data-keys])::after {
  content: attr(data-keys);
  margin-left: 8px;
  padding: 1px 6px;
  border: 1px solid ${roleVar('Border')};
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
  background: ${roleVar('RaisedSurface')};
  box-shadow: 0 24px 64px -12px ${roleVar('Shadow')};
}

:where(.fk-action-menu-opener) {
  border: 0;
  background: none;
  color: ${roleVar('QuietText')};
  font-family: inherit;
  font-size: ${px(screenLook.buttonLabelSize)};
  cursor: pointer;
  text-underline-offset: 4px;
}

:where(.fk-action-menu-opener:hover) {
  text-decoration: underline;
}

:where(.fk-button[data-icon-only][data-variant='Ghost']) {
  border-color: transparent;
}

:where(.fk-item > .fk-button[data-icon-only]) {
  width: 44px;
  height: 44px;
  padding: 0;
}

:where(.fk-item > .fk-button[data-icon-only][data-variant='Ghost']) {
  border-color: ${roleVar('Border')};
}

:where(.fk-dock .fk-item > .fk-button[data-icon-only][data-variant='Ghost']) {
  border-color: transparent;
}

:where(.fk-overlay[data-style='Sheet'], .fk-overlay[data-style='BottomSheet']) {
  padding: 56px 0 0;
}

:where(.fk-overlay[data-style='Sheet'] > *, .fk-overlay[data-style='BottomSheet'] > *) {
  max-height: calc(100dvh - 56px);
  border-radius: ${px(screenLook.panelRadius)} ${px(screenLook.panelRadius)} 0 0;
  padding-bottom: calc(${px(screenLook.columnGap)} + env(safe-area-inset-bottom));
}

:where(.fk-dock > .fk-list) {
  margin: 0 auto;
}

:where(.fk-dock .fk-column) {
  gap: 10px;
  padding: 6px 0 10px;
}

:where(.fk-dock .fk-row) {
  gap: 4px;
}

:where(.fk-dock .fk-row:not(:has(.fk-button))) {
  justify-content: space-between;
  width: calc(100% - 32px);
}

:where(.fk-dock .fk-seek) {
  width: calc(100% - 32px);
}

:where(.fk-dock .fk-row > .fk-button[data-variant='Ghost']:not([data-icon-only]):has(> .fk-icon)) {
  flex: 1;
  flex-direction: column;
  gap: 4px;
  height: 60px;
  min-width: 0;
  padding: 0 4px;
  border: 0;
  border-radius: 12px;
  font-size: 12px;
}

:where(.fk-row:has(> .fk-button[data-variant='Ghost'][data-current])) {
  flex-wrap: nowrap;
  gap: 0;
  padding: 3px;
  border-radius: 999px;
  background: ${roleVar('Rule')};
}

:where(.fk-row:has(> .fk-button[data-variant='Ghost'][data-current]) > .fk-button) {
  height: 32px;
  min-width: 0;
  padding: 0 16px;
  border: 0;
  background: transparent;
  color: ${roleVar('QuietText')};
  font-size: 13px;
}

:where(.fk-row:has(> .fk-button[data-variant='Ghost'][data-current]) > .fk-button[data-current]) {
  background: ${roleVar('RaisedSurface')};
  color: ${roleVar('Text')};
  box-shadow: 0 1px 3px ${roleVar('Shadow')};
}

:where(.fk-row:has(> .fk-button[data-action='GoBack'])) {
  align-self: stretch;
  justify-content: flex-start;
}

:where(.fk-button[data-action='GoBack']) {
  gap: 2px;
  height: 36px;
  min-width: 0;
  padding: 0 12px 0 4px;
  border: 0;
}

:where(.fk-column > .fk-text[data-dim]:has(+ .fk-list)) {
  box-sizing: border-box;
  width: min(100%, ${px(screenLook.listWidth)});
  margin-bottom: -16px;
  padding: 0 8px;
  color: ${roleVar('Text')};
  font-size: 20px;
  font-weight: 700;
  text-align: left;
}

:where(.fk-item-title) {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: normal;
}

:where(.fk-dock .fk-item-title) {
  -webkit-line-clamp: 1;
}

:where(.fk-item[data-current] .fk-item-title) {
  color: ${roleVar('Accent')};
}

:where(.fk-transcript) {
  max-height: max(220px, calc(100dvh - var(--fk-dock-height, 0px) - 210px));
}

@media (max-width: 560px) {
  :where(.fk-transcript) {
    width: 100vw;
    max-width: 100vw;
    padding: 12px 10px;
    border-radius: 0;
  }

  :where(.fk-passage) {
    padding: 6px 8px;
  }

  :where(.fk-passage-words) {
    font-size: ${px(Math.round(screenLook.readingSize * 0.85))};
  }

  :where(.fk-passage-label) {
    padding-top: 8px;
  }
}

:where(.fk-text-form) {
  display: contents;
}

:where(.fk-text-input) {
  box-sizing: border-box;
  width: min(100%, ${px(screenLook.listWidth)});
  height: ${px(screenLook.fieldHeight)};
  padding: 0 14px;
  border: 1px solid ${roleVar('Border')};
  border-radius: 12px;
  background: ${roleVar('Field')};
  color: ${roleVar('Text')};
  font-family: inherit;
  font-size: max(${px(screenLook.bodySize)}, 1rem);
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}

:where(.fk-text-input::placeholder) {
  color: ${roleVar('QuietText')};
}

:where(.fk-text-input:hover) {
  border-color: ${roleVar('QuietText')};
}

:where(.fk-text-input:focus) {
  border-color: ${roleVar('Accent')};
  outline: none;
  background: ${roleVar('RaisedSurface')};
  box-shadow: 0 0 0 3px ${roleVar('AccentSoft')};
}

:where(.fk-item-check) {
  flex: none;
  box-sizing: border-box;
  width: ${px(screenLook.checkSize)};
  height: ${px(screenLook.checkSize)};
  margin: 0 0 0 8px;
  padding: 0;
  border: 2px solid ${roleVar('Border')};
  border-radius: 999px;
  background: transparent center / 14px no-repeat;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, transform 0.1s;
}

:where(.fk-item-check:hover) {
  border-color: ${roleVar('Accent')};
}

:where(.fk-item-check:active) {
  transform: scale(0.92);
}

:where(.fk-item-check:focus-visible) {
  outline: 2px solid ${roleVar('Focus')};
  outline-offset: 2px;
}

:where(.fk-item-check[data-checked]) {
  border-color: ${roleVar('Accent')};
  background-color: ${roleVar('Accent')};
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M3 7.4l2.6 2.6L11 4.3' fill='none' stroke='%23fff' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}

:where(.fk-item-check:disabled) {
  cursor: default;
  opacity: 0.45;
}

:where(.fk-item:has(.fk-item-check[data-checked]) .fk-item-title) {
  color: ${roleVar('QuietText')};
  font-weight: 500;
}

:where(.fk-list-frame) {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-self: stretch;
  width: min(100%, ${px(screenLook.listWidth)});
  margin: 0 auto;
}

:where(.fk-list-frame > .fk-list) {
  width: 100%;
}

:where(.fk-list-head) {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 0 6px;
  border-bottom: 1px solid ${roleVar('Rule')};
  background: ${roleVar('RaisedSurface')};
}

:where(.fk-list-filter) {
  box-sizing: border-box;
  width: 100%;
  height: ${px(screenLook.fieldHeight)};
  padding: 0 14px;
  border: 1px solid ${roleVar('Border')};
  border-radius: 12px;
  background: ${roleVar('Field')};
  color: ${roleVar('Text')};
  font: inherit;
  font-size: ${px(screenLook.bodySize)};
}

:where(.fk-list-filter:focus-visible) {
  outline: 2px solid ${roleVar('Focus')};
  outline-offset: 1px;
}

:where(.fk-list-head-columns) {
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  padding: 0 8px;
}

:where(.fk-item-column, .fk-list-head-column) {
  flex: 0 0 ${px(screenLook.listColumnWidth)};
  color: ${roleVar('QuietText')};
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

:where(.fk-list-head-column) {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

:where(.fk-list-empty) {
  margin: 0;
  padding: 20px 8px;
  color: ${roleVar('QuietText')};
  text-align: left;
}

:where(.fk-list-frame .fk-item-press) {
  padding: 9px 8px 9px 12px;
  border-radius: 8px;
}

:where(.fk-list-frame .fk-item-title) {
  font-size: 15px;
  font-weight: 500;
}

:where(.fk-list-frame .fk-item[data-current]) {
  border-radius: 8px;
  background: ${roleVar('AccentSoft')};
  box-shadow: inset 3px 0 0 ${roleVar('Accent')};
}

:where(.fk-list-frame .fk-item[data-current] .fk-item-title) {
  font-weight: 700;
}

:where(.fk-list-frame .fk-item[data-current] .fk-item-line) {
  color: ${roleVar('ReadingCurrentWord')};
}

:where(.fk-list:has(+ .fk-transcript)) {
  position: sticky;
  top: 8px;
  z-index: 2;
  box-sizing: border-box;
  width: min(100%, ${px(screenLook.readingWidth)});
  border: 1px solid ${roleVar('Border')};
  border-radius: 999px;
  background: ${roleVar('Veil')};
  backdrop-filter: blur(14px);
}

:where(.fk-list:has(+ .fk-transcript) .fk-item) {
  padding: 0 6px 0 0;
}

:where(.fk-list:has(+ .fk-transcript) .fk-item-press) {
  padding: 8px 20px;
  border-radius: 999px;
}

:where(.fk-list:has(+ .fk-transcript) .fk-item > .fk-button[data-icon-only]) {
  border-color: transparent;
}

:where(.fk-list:has(+ .fk-transcript) .fk-item-title) {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
  -webkit-line-clamp: 1;
}

:where(.fk-column > .fk-text[data-dim]:has(+ .fk-list + .fk-transcript)) {
  width: min(100%, ${px(screenLook.readingWidth)});
  margin-bottom: -12px;
  padding: 0 20px;
}

@media (min-width: 561px) {
  :where(.fk-list:has(+ .fk-transcript) .fk-item-body) {
    flex-direction: row;
    align-items: baseline;
    gap: 14px;
  }

  :where(.fk-list:has(+ .fk-transcript) .fk-item-title) {
    flex: 0 1 auto;
  }

  :where(.fk-list:has(+ .fk-transcript) .fk-item-line) {
    flex: 1;
  }
}

@media (max-width: 560px) {
  :where(.fk-list:has(+ .fk-transcript)) {
    border-radius: 18px;
  }

  :where(.fk-list:has(+ .fk-transcript) .fk-item-press) {
    padding: 6px 16px;
    border-radius: 18px;
  }
}

:where(.fk-overlay[data-style='Drawer']) {
  align-items: stretch;
  justify-content: flex-end;
  padding: 0;
}

:where(.fk-overlay[data-style='Drawer'][data-side='Left']) {
  justify-content: flex-start;
}

:where(.fk-overlay[data-style='Drawer'] > *) {
  width: min(88vw, ${px(screenLook.drawerWidth)});
  height: 100dvh;
  max-height: none;
  justify-content: flex-start;
  gap: 6px;
  padding: 0 16px calc(20px + env(safe-area-inset-bottom));
  border-radius: 0;
  text-align: left;
}

:where(.fk-overlay[data-style='Drawer'] > * > :first-child) {
  margin-top: 20px;
}

:where(.fk-overlay[data-style='Drawer'] > * > .fk-text) {
  align-self: stretch;
  padding: 0 8px;
  text-align: left;
}

@media (min-width: ${px(screenLook.drawerDockWidth)}) {
  :where(.fk-overlay[data-style='Drawer']) {
    background: none;
    pointer-events: none;
  }

  :where(.fk-overlay[data-style='Drawer'] > *) {
    pointer-events: auto;
    box-shadow: 0 0 0 1px ${roleVar('Rule')}, 0 0 40px -16px ${roleVar('Shadow')};
  }

  :where(body:has(.fk-overlay[data-style='Drawer'][data-side='Left'])) {
    padding-left: ${px(screenLook.drawerWidth)};
  }

  :where(body:has(.fk-overlay[data-style='Drawer'][data-side='Left']) .fk-dock) {
    left: ${px(screenLook.drawerWidth)};
  }

  :where(body:has(.fk-overlay[data-style='Drawer'][data-side='Right'])) {
    padding-right: ${px(screenLook.drawerWidth)};
  }

  :where(body:has(.fk-overlay[data-style='Drawer'][data-side='Right']) .fk-dock) {
    right: ${px(screenLook.drawerWidth)};
  }
}

:where(.fk-list-group) {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding: 8px 8px 5px;
  border-bottom: 1px solid ${roleVar('Rule')};
  color: ${roleVar('QuietText')};
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
}

:where(.fk-list-group:first-child) {
  margin-top: 0;
}

:where(.fk-list-group-count) {
  font-variant-numeric: tabular-nums;
}

:where(.fk-item-badge) {
  display: inline-block;
  min-width: 18px;
  margin-left: 8px;
  padding: 0 7px;
  border-radius: 999px;
  background: ${roleVar('MarkSoft')};
  color: ${roleVar('Mark')};
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  vertical-align: 1px;
}
`
