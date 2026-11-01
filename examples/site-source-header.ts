import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

/**
 * Puts one line at the top of every page a hosted example serves: the full GitHub
 * location of the code it was built from, as the link's own text, read from git
 * when Vite starts. For example, books.pisspoursoftware.xyz built from this fork's
 * main shows
 * `github.com/technoplato/foldkit/tree/main/examples/books/react/src`.
 *
 * The markup is a contract that a sweep in the Scribe repository checks on every
 * hosted name (scripts/site-headers, issue 1547), so it matches that sweep's
 * site-header.mjs exactly:
 *
 * ```html
 * <header data-site-source data-repo="technoplato/foldkit" data-ref="main" data-folder="examples/books/react">
 *   <a href="https://github.com/technoplato/foldkit/tree/main/examples/books/react/src">github.com/technoplato/foldkit/tree/main/examples/books/react/src</a>
 * </header>
 * ```
 *
 * The header sits before the app's root element, outside the app, so the app's
 * view, its Messages and its tests are unchanged. A production build from a
 * detached HEAD or a remote that is not GitHub fails, because the header would
 * otherwise say something untrue; the dev server only warns.
 */
export const siteSourceHeader = (): Plugin => {
  let header = ''

  return {
    name: 'site-source-header',
    configResolved(config) {
      try {
        header = headerHtml(readSourceLocation(config.root))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (config.command === 'build') {
          throw new Error(`site-source-header: ${message}`)
        }
        config.logger.warn(`site-source-header: ${message}`)
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler: html => (header === '' ? html : injectHeader(html, header)),
    },
  }
}

type SourceLocation = Readonly<{
  url: string
  text: string
  repo: string
  ref: string
  folder: string
}>

const git = (directory: string, ...args: ReadonlyArray<string>): string => {
  try {
    return execFileSync('git', ['-C', directory, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim()
  } catch {
    return ''
  }
}

const githubRemote =
  /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/

/**
 * The branch's upstream decides the remote and the branch name: an agent's branch
 * that tracks technoplato/main is code headed for main. A branch with no upstream
 * uses origin and its own name.
 */
const readSourceLocation = (directory: string): SourceLocation => {
  const top = git(directory, 'rev-parse', '--show-toplevel')
  if (top === '') {
    throw new Error(`${directory} is not in a git repository`)
  }
  const branch = git(directory, 'symbolic-ref', '--quiet', '--short', 'HEAD')
  if (branch === '') {
    throw new Error(
      'the site is built from a detached HEAD: build it from a named branch',
    )
  }
  const remote = git(directory, 'config', `branch.${branch}.remote`) || 'origin'
  const ref =
    git(directory, 'config', `branch.${branch}.merge`).replace(
      /^refs\/heads\//,
      '',
    ) || branch
  const remoteUrl = git(directory, 'remote', 'get-url', remote)
  const match = githubRemote.exec(remoteUrl)
  if (match === null) {
    throw new Error(`${remoteUrl} is not a GitHub remote`)
  }
  const repo = `${match[1]}/${match[2]}`
  const folder = path
    .relative(fs.realpathSync(top), fs.realpathSync(directory))
    .split(path.sep)
    .join('/')
  const source = fs.existsSync(path.join(directory, 'src'))
    ? `${folder}/src`
    : folder
  const text = `github.com/${repo}/tree/${ref}/${source}`
  return { url: `https://${text}`, text, repo, ref, folder }
}

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    character =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  )

// One 12 px monospace line that wraps rather than overflowing at 390 px, never
// wider than the screen even when the page below it is (words at 390 px);
// light and dark follow the system. Scoped by attribute, so it styles nothing
// else.
const style =
  '[data-site-source]{display:block;box-sizing:border-box;max-width:100vw;margin:0;padding:4px 10px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;' +
  'background:#f6f6f4;color:#444;border-bottom:1px solid #ddd;overflow-wrap:anywhere;text-align:left}' +
  '[data-site-source] a{color:#0a58ca;text-decoration:underline}' +
  '@media (prefers-color-scheme: dark){[data-site-source]{background:#18181b;color:#bbb;border-bottom-color:#333}' +
  '[data-site-source] a{color:#7cb4ff}}'

const headerHtml = (location: SourceLocation): string => {
  const data = `data-repo="${escapeHtml(location.repo)}" data-ref="${escapeHtml(location.ref)}" data-folder="${escapeHtml(location.folder)}"`
  return `<header data-site-source ${data}><style>${style}</style><a href="${escapeHtml(location.url)}" rel="noopener">${escapeHtml(location.text)}</a></header>`
}

const headerBlock = /<header data-site-source[\s\S]*?<\/header>/
const bodyOpen = /<body\b[^>]*>/i

const injectHeader = (html: string, header: string): string => {
  if (headerBlock.test(html)) {
    return html.replace(headerBlock, header)
  }
  const body = bodyOpen.exec(html)
  if (body === null) {
    return header + html
  }
  const at = body.index + body[0].length
  return html.slice(0, at) + header + html.slice(at)
}
