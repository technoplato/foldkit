import { type Role, cssVariableOf, defaultTheme } from '../theme/theme.js'

// NOTE: A hint can show on a page that paints no screen, so no stylesheet
// has declared the theme there. Each role falls back to the default
// theme's own light color, read from the theme, never written here.
const roleVar = (role: Role): string =>
  `var(${cssVariableOf(role)}, ${defaultTheme[role].light})`

/**
 * The look of a control's hint and of a key's echo on the web, shared by
 * every web painter. The hint is the small dark panel that says what a
 * control does and which keys press it; the echo is the line that says,
 * for a moment, what a key just did. `listenForHints` and `showEcho` add
 * it to the document head once. It names roles of the theme and no color
 * of its own: the panel is the text color with the page's ground for its
 * words, so it stands out in either mode. Every selector sits in
 * `:where()`, so an app's own rule for the same class wins without
 * `!important`.
 *
 * @example
 * ```tsx
 * <style>{Interaction.hintStylesheet}</style>
 * ```
 */
export const hintStylesheet = `
:where(.fk-hint, .fk-echo) {
  position: fixed;
  z-index: 1100;
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  box-sizing: border-box;
  margin: 0;
  padding: 0.4375rem 0.625rem;
  border: 1px solid color-mix(in srgb, ${roleVar('PageGround')} 14%, transparent);
  border-radius: 0.5rem;
  background: ${roleVar('Text')};
  box-shadow: 0 8px 24px -6px
    color-mix(in srgb, ${roleVar('Text')} 35%, transparent);
  color: ${roleVar('PageGround')};
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.125rem;
  letter-spacing: normal;
  text-align: left;
  text-transform: none;
  white-space: normal;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
}

:where(.fk-hint) {
  top: 0;
  left: 0;
  max-width: min(20rem, calc(100vw - 1rem));
}

:where(.fk-echo) {
  top: 0.75rem;
  left: 50%;
  max-width: min(28rem, calc(100vw - 2rem));
  transform: translateX(-50%);
  align-items: center;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

:where(.fk-hint, .fk-echo)[data-shown='true'] {
  opacity: 1;
  visibility: visible;
}

@media (prefers-reduced-motion: no-preference) {
  :where(.fk-hint, .fk-echo) {
    transition:
      opacity 90ms ease-out,
      visibility 90ms;
  }
}

:where(.fk-hint-text, .fk-echo-text) {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

:where(.fk-hint-title, .fk-echo-title) {
  font-weight: 600;
}

:where(.fk-hint-why, .fk-hint-because, .fk-echo-note) {
  opacity: 0.75;
}

:where(.fk-hint-keys, .fk-echo-keys) {
  display: flex;
  flex: none;
  gap: 0.25rem;
  margin-top: 0.0625rem;
}

:where(.fk-hint-key, .fk-echo-key) {
  box-sizing: border-box;
  min-width: 1.25rem;
  padding: 0 0.3125rem;
  border: 1px solid color-mix(in srgb, currentColor 28%, transparent);
  border-bottom-width: 2px;
  border-radius: 0.3125rem;
  background: color-mix(in srgb, currentColor 12%, transparent);
  color: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.6875rem;
  line-height: 1rem;
  text-align: center;
}
`
