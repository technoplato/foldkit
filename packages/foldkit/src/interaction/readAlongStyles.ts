import type { ScreenLook } from './screenStyles.js'

const px = (value: number): string => `${value.toString()}px`

/**
 * The look of Read Along's own parts on the web, appended to the shared
 * screen stylesheet: the words a search found, the reader's pills (`Back
 * to playhead`, `Search`), a search by the words, a word's menu, and
 * where a drag of the seek bar will land. It names no color of its own:
 * every color is a token of the shared look or one of the reader's
 * `--fk-reading-*` variables, so it follows them in either appearance.
 *
 * @example
 * ```typescript
 * readAlongStylesOf(screenLook) // ':where(.fk-word[data-mark]) { … }'
 * ```
 */
export const readAlongStylesOf = (look: ScreenLook): string => `
:where(.fk-word[data-mark]) {
  background: color-mix(in srgb, var(--fk-reading-rule) 24%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--fk-reading-rule) 24%, transparent);
  color: var(--fk-reading-text);
}

:where(.fk-word[data-mark='Selected']) {
  background: color-mix(in srgb, var(--fk-reading-rule) 46%, transparent);
  box-shadow: 0 0 0 2px var(--fk-reading-rule);
}

:where(.fk-button[data-variant='Pill']) {
  height: 38px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid ${look.trackColor};
  border-radius: 999px;
  background: ${look.panelColor};
  color: ${look.textColor};
  font-size: 14px;
  box-shadow: 0 6px 18px -10px color-mix(in srgb, ${look.textColor} 50%, transparent);
}

@media (hover: hover) {
  :where(.fk-button[data-variant='Pill']:hover) {
    background: ${look.rowHoverColor};
  }
}

:where(.fk-button[data-variant='Pill'] .fk-icon) {
  width: 18px;
  height: 18px;
}

:where(.fk-dock .fk-row:has(> .fk-button[data-variant='Pill'])) {
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
}

:where(.fk-dock .fk-row:has(.fk-text-input)) {
  box-sizing: border-box;
  align-items: center;
  gap: 8px;
  width: min(100%, ${px(look.listWidth)});
  padding: 0 12px;
}

:where(.fk-dock .fk-row:has(.fk-text-input) .fk-text-input) {
  flex: 1;
  width: auto;
  min-width: 0;
}

:where(.fk-dock .fk-row:has(.fk-text-input) > .fk-text) {
  flex: none;
  max-width: 46%;
  color: ${look.dimColor};
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:where(.fk-dock .fk-column > .fk-list) {
  max-height: 34dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-top: 1px solid ${look.trackColor};
}

:where(.fk-word-menu-backdrop) {
  position: fixed;
  inset: 0;
  z-index: 890;
}

:where(.fk-word-menu) {
  position: fixed;
  z-index: 900;
  display: flex;
  flex-direction: column;
  min-width: 220px;
  padding: 6px;
  border: 1px solid ${look.trackColor};
  border-radius: 14px;
  background: ${look.panelColor};
  box-shadow: 0 18px 40px -16px color-mix(in srgb, ${look.textColor} 45%, transparent);
  text-align: left;
}

:where(.fk-word-menu-item) {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: none;
  color: ${look.textColor};
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

:where(.fk-word-menu-item:hover, .fk-word-menu-item:focus-visible) {
  background: ${look.rowHoverColor};
}

:where(.fk-word-menu-item .fk-icon) {
  width: 18px;
  height: 18px;
  color: ${look.dimColor};
}

:where(.fk-seek-landing) {
  display: block;
  color: ${look.textColor};
  font-size: 14px;
}

:where(.fk-dock .fk-seek-landing) {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%);
  box-sizing: border-box;
  width: max-content;
  max-width: min(92vw, ${px(look.listWidth)});
  margin: 0;
  padding: 8px 14px;
  border: 1px solid ${look.trackColor};
  border-radius: 12px;
  background: ${look.panelColor};
  box-shadow: 0 12px 30px -14px color-mix(in srgb, ${look.textColor} 45%, transparent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

@media (pointer: coarse) {
  :where(.fk-word) {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
}
`
