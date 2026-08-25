import { type JSX } from 'react'

/**
 * Injected by vite `define` from the checkout's own git remote, so the
 * attribution is always the true source of this running demo — never a
 * hardcoded string.
 */
declare const __GITHUB_SOURCE_URL__: string

/** Derives the GitHub repository URL for display when injection is absent. */
export const githubSourceUrl = (): string =>
  typeof __GITHUB_SOURCE_URL__ === 'string' && __GITHUB_SOURCE_URL__ !== ''
    ? __GITHUB_SOURCE_URL__
    : ''

/**
 * The demo banner every surface renders: what you are looking at and
 * where its source lives.
 */
export const DemoLabel = ({
  surface,
}: Readonly<{ readonly surface: string }>): JSX.Element => {
  const sourceUrl = githubSourceUrl()
  return (
    <p className="font-mono text-xs text-stone-500">
      <span className="uppercase tracking-[0.24em] text-amber-400">
        Foldkit Counters — {surface}
      </span>
      {sourceUrl === '' ? null : (
        <>
          {' · '}
          <a className="underline" href={sourceUrl} rel="noreferrer" target="_blank">
            source
          </a>
        </>
      )}
    </p>
  )
}
