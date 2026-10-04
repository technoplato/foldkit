/**
 * The look of the action menu on the web, shared by every web painter:
 * Foldkit HTML, React, and Svelte. It styles the `fk-action-menu` class
 * names those painters emit: a dimmed backdrop, a centered panel, a
 * search field, rows with their key hints, matched letters, and a footer
 * of the keys that work right now. Every selector sits in `:where()`, so
 * an app's own rule for the same class wins without `!important`.
 *
 * @example
 * ```tsx
 * <style href="foldkit-action-menu" precedence="foldkit">
 *   {Interaction.menuStylesheet}
 * </style>
 * ```
 */
export const menuStylesheet = `
:where(.fk-action-menu-backdrop) {
  position: fixed;
  inset: 0;
  z-index: 999;
  margin: 0;
  padding: 0;
  border: none;
  background: rgb(15 23 42 / 0.4);
  backdrop-filter: blur(2px);
  cursor: default;
}

:where(.fk-action-menu) {
  position: fixed;
  top: 12vh;
  left: 50%;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: min(36rem, calc(100vw - 2rem));
  max-height: 70vh;
  overflow: hidden;
  transform: translateX(-50%);
  border: 1px solid rgb(0 0 0 / 0.08);
  border-radius: 0.875rem;
  background: rgb(255 255 255);
  box-shadow:
    0 24px 64px -12px rgb(15 23 42 / 0.35),
    0 2px 6px rgb(15 23 42 / 0.08);
  color: rgb(17 24 39);
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 0.875rem;
  line-height: 1.25rem;
  text-align: left;
}

@media (prefers-reduced-motion: no-preference) {
  :where(.fk-action-menu) {
    animation: fk-action-menu-in 120ms ease-out;
  }
}

@keyframes fk-action-menu-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-4px) scale(0.98);
  }
}

:where(.fk-action-menu-title, .fk-action-menu-status) {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

:where(.fk-action-menu-filter) {
  box-sizing: border-box;
  width: 100%;
  padding: 1rem 1.125rem;
  border: none;
  border-bottom: 1px solid rgb(229 231 235);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 1rem;
  line-height: 1.5rem;
  outline: none;
}

:where(.fk-action-menu-filter)::placeholder {
  color: rgb(156 163 175);
}

:where(.fk-action-menu-filter[readonly]) {
  color: rgb(107 114 128);
  caret-color: transparent;
}

:where(.fk-action-menu-rows) {
  flex: 1 1 auto;
  margin: 0;
  padding: 0.375rem;
  overflow-y: auto;
  list-style: none;
}

:where(.fk-action-menu-row) {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  cursor: pointer;
  scroll-margin: 0.375rem;
}

:where(.fk-action-menu-row:hover) {
  background: rgb(249 250 251);
}

:where(.fk-action-menu-row[aria-selected='true']) {
  background: rgb(243 244 246);
}

:where(.fk-action-menu-row[data-focused='true']) {
  background: rgb(238 242 255);
  box-shadow: inset 3px 0 0 rgb(79 70 229);
}

:where(.fk-action-menu-row[aria-disabled='true']) {
  cursor: not-allowed;
}

:where(.fk-action-menu-row[data-first-unavailable='true']) {
  position: relative;
  margin-top: 0.75rem;
}

:where(.fk-action-menu-row[data-first-unavailable='true'])::before {
  content: '';
  position: absolute;
  top: -0.375rem;
  right: 0.75rem;
  left: 0.75rem;
  height: 1px;
  background: rgb(229 231 235);
}

:where(.fk-action-menu-row[data-nested='true'])::after {
  content: '›';
  flex: none;
  color: rgb(156 163 175);
  font-size: 1.125rem;
}

:where(.fk-action-menu-row[aria-disabled='true'])
  :where(.fk-action-menu-label, .fk-action-menu-what) {
  color: rgb(156 163 175);
}

:where(.fk-action-menu-text) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

:where(.fk-action-menu-label) {
  font-weight: 600;
}

:where(.fk-action-menu-what) {
  overflow: hidden;
  color: rgb(107 114 128);
  text-overflow: ellipsis;
  white-space: nowrap;
}

:where(.fk-action-menu-because) {
  color: rgb(180 83 9);
  font-size: 0.75rem;
}

:where(.fk-action-menu-match) {
  background: none;
  color: rgb(79 70 229);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}

:where(.fk-action-menu-keys) {
  display: flex;
  flex: none;
  gap: 0.25rem;
}

:where(.fk-action-menu-pick) {
  flex: none;
  min-width: 1.75rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.375rem;
  color: rgb(107 114 128);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  line-height: 1rem;
  text-align: right;
}

:where(.fk-action-menu-key) {
  box-sizing: border-box;
  min-width: 1.5rem;
  padding: 0.125rem 0.375rem;
  border: 1px solid rgb(229 231 235);
  border-bottom-width: 2px;
  border-radius: 0.375rem;
  background: rgb(249 250 251);
  color: rgb(55 65 81);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  line-height: 1rem;
  text-align: center;
}

:where(.fk-action-menu-empty) {
  margin: 0;
  padding: 2rem 1rem;
  color: rgb(107 114 128);
  text-align: center;
}

:where(.fk-action-menu-footer) {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 0;
  padding: 0.625rem 1rem;
  border-top: 1px solid rgb(229 231 235);
  background: rgb(249 250 251);
  color: rgb(107 114 128);
  font-size: 0.75rem;
}

:where(.fk-action-menu-hint) {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
`
