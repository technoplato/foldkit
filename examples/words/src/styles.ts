/** Styles embedded in the progressive-enhancement bundle. */
export const wordsStyles = `
.words-example {
  --words-accent: #175f52;
  --words-accent-soft: #dff4ee;
  --words-border: #d8dedc;
  --words-ink: #17211f;
  --words-muted: #60706c;
  color: var(--words-ink);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 0 auto;
  max-width: 72rem;
  padding: clamp(1rem, 4vw, 3rem);
}
.words-example * { box-sizing: border-box; }
.words-example__header { margin-bottom: 1.5rem; }
.words-example__eyebrow {
  color: var(--words-accent);
  font-size: 0.75rem;
  font-weight: 750;
  letter-spacing: 0.12em;
  margin: 0 0 0.35rem;
  text-transform: uppercase;
}
.words-example h1 {
  font-size: clamp(1.55rem, 4vw, 2.5rem);
  letter-spacing: -0.035em;
  margin: 0;
}
.words-example__panel {
  background: #fff;
  border: 1px solid var(--words-border);
  border-radius: 1.25rem;
  box-shadow: 0 1rem 3rem rgb(23 33 31 / 0.08);
  overflow: hidden;
}
.words-example__controls {
  align-items: center;
  background: #f7faf9;
  border-bottom: 1px solid var(--words-border);
  display: grid;
  gap: 0.8rem;
  grid-template-columns: auto auto minmax(7rem, 1fr) auto auto;
  padding: 1rem;
}
.words-example__button {
  align-items: center;
  background: #fff;
  border: 1px solid var(--words-border);
  border-radius: 999px;
  color: var(--words-ink);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  justify-content: center;
  min-height: 2.75rem;
  min-width: 2.75rem;
  padding: 0.55rem 0.9rem;
}
.words-example__button:hover:not(:disabled),
.words-example__button:focus-visible {
  border-color: var(--words-accent);
  outline: 3px solid var(--words-accent-soft);
}
.words-example__button--primary {
  background: var(--words-accent);
  border-color: var(--words-accent);
  color: #fff;
  min-width: 5.5rem;
}
.words-example__button:disabled { cursor: not-allowed; opacity: 0.5; }
.words-example__scrubber { accent-color: var(--words-accent); width: 100%; }
.words-example__time {
  color: var(--words-muted);
  font-variant-numeric: tabular-nums;
  min-width: 6.5rem;
  text-align: center;
}
.words-example__transcript {
  font-size: clamp(1.2rem, 2.8vw, 1.75rem);
  line-height: 1.9;
  margin: 0;
  padding: clamp(1.2rem, 4vw, 2.5rem);
}
.words-example__word {
  background: transparent;
  border: 0;
  border-radius: 0.35rem;
  color: inherit;
  cursor: pointer;
  font: inherit;
  margin: 0 0.14em 0.12em;
  padding: 0.08em 0.16em;
}
.words-example__word:hover,
.words-example__word:focus-visible { background: #edf2f0; outline: 2px solid var(--words-accent); }
.words-example__word--active { background: var(--words-accent-soft); color: #0b4b40; }
.words-example__status { color: var(--words-muted); margin: 0; padding: 2rem; }
.words-example__error { color: #8c1c13; margin: 0; padding: 1rem 1.25rem; }
.words-example__visually-hidden {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}
@media (max-width: 42rem) {
  .words-example__controls { grid-template-columns: repeat(4, 1fr); }
  .words-example__scrubber { grid-column: 1 / -1; grid-row: 2; }
  .words-example__time { grid-column: 1 / -1; grid-row: 3; justify-self: center; }
}
`
