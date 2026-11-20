import { roleVar } from '../theme/theme.js'
import type { ScreenLook } from './screenStyles.js'

const px = (value: number): string => `${value.toString()}px`

/**
 * The look of Read Along's own parts on the web, appended to the shared
 * screen stylesheet: the words a search found, the reader's pills (`Back
 * to playhead`, `Search`), a search by the words, a word's menu, and
 * where a drag of the seek bar will land. It names roles of the theme and
 * no color of its own, so it follows light and dark with the rest: the
 * marks are mixed from the reader's own rule color, the menu and the
 * pills sit on the raised surface. It takes only sizes from the look.
 *
 * @example
 * ```typescript
 * readAlongStylesOf(screenLook) // ':where(.fk-word[data-mark]) { … }'
 * ```
 */
export const readAlongStylesOf = (look: ScreenLook): string => `
:where(.fk-word[data-mark]) {
  background: color-mix(in srgb, ${roleVar('ReadingRule')} 24%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, ${roleVar('ReadingRule')} 24%, transparent);
  color: ${roleVar('ReadingSpoken')};
}

:where(.fk-word[data-mark='Selected']) {
  background: color-mix(in srgb, ${roleVar('ReadingRule')} 46%, transparent);
  box-shadow: 0 0 0 2px ${roleVar('ReadingRule')};
}

:where(.fk-word[data-mark='Picked']) {
  background: ${roleVar('ReadingCurrentGround')};
  box-shadow: 0 0 0 2px ${roleVar('ReadingToCome')};
}

:where(.fk-button[data-variant='Pill']) {
  height: 38px;
  min-width: 0;
  padding: 0 16px;
  border: 1px solid ${roleVar('Rule')};
  border-radius: 999px;
  background: ${roleVar('RaisedSurface')};
  color: ${roleVar('Text')};
  font-size: 14px;
  box-shadow: 0 6px 18px -10px ${roleVar('Shadow')};
}

@media (hover: hover) {
  :where(.fk-button[data-variant='Pill']:hover) {
    background: ${roleVar('Surface')};
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

:where(.fk-dock .fk-row > .fk-button[data-variant='Ghost']) {
  white-space: nowrap;
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
  color: ${roleVar('QuietText')};
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
  border-top: 1px solid ${roleVar('Rule')};
}

:where(.fk-dock .fk-column > .fk-list .fk-item-title) {
  -webkit-line-clamp: 2;
  font-weight: 400;
}

@media (max-width: 560px) {
  :where(.fk-dock .fk-column > .fk-list) {
    max-height: 24dvh;
  }
}

:where(.fk-item-mark) {
  background: none;
  color: inherit;
  font-weight: 700;
}

:where(.fk-dock .fk-column > .fk-list + .fk-text) {
  padding: 0 20px;
  font-size: 13px;
  text-align: left;
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
  border: 1px solid ${roleVar('Rule')};
  border-radius: 14px;
  background: ${roleVar('RaisedSurface')};
  box-shadow: 0 18px 40px -16px ${roleVar('Shadow')};
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
  color: ${roleVar('Text')};
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

:where(.fk-word-menu-item:hover, .fk-word-menu-item:focus-visible) {
  background: ${roleVar('Surface')};
}

:where(.fk-word-menu-item .fk-icon) {
  width: 18px;
  height: 18px;
  color: ${roleVar('QuietText')};
}

/* A seek bar that names its landings sits in a wrapper that takes no room
   of its own, so the bar lays out as a bar alone does. */
:where(.fk-seek-field) {
  display: contents;
}

:where(.fk-seek-landing[hidden]) {
  display: none;
}

:where(.fk-seek-landing) {
  display: block;
  color: ${roleVar('Text')};
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
  border: 1px solid ${roleVar('Rule')};
  border-radius: 12px;
  background: ${roleVar('RaisedSurface')};
  box-shadow: 0 12px 30px -14px ${roleVar('Shadow')};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

@media (pointer: coarse) {
  :where(.fk-word, .fk-item[data-menu] .fk-item-press) {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
}
`
