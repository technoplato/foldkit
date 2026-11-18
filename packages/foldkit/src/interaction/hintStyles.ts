/**
 * The look of a control's hint and of a key's echo on the web, shared by
 * every web painter. The hint is the small dark panel that says what a
 * control does and which keys press it; the echo is the line that says,
 * for a moment, what a key just did. `listenForHints` and `showEcho` add
 * it to the document head once. Every selector sits in `:where()`, so an
 * app's own rule for the same class wins without `!important`.
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
  border: 1px solid rgb(255 255 255 / 0.08);
  border-radius: 0.5rem;
  background: rgb(17 24 39 / 0.96);
  box-shadow: 0 8px 24px -6px rgb(15 23 42 / 0.45);
  color: rgb(243 244 246);
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

:where(.fk-hint-because, .fk-echo-note) {
  color: rgb(252 211 77);
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
  border: 1px solid rgb(255 255 255 / 0.22);
  border-bottom-width: 2px;
  border-radius: 0.3125rem;
  background: rgb(255 255 255 / 0.1);
  color: rgb(255 255 255);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.6875rem;
  line-height: 1rem;
  text-align: center;
}
`
