import { Array, Option, String } from 'effect'
import { Html, html } from 'foldkit/html'

import { Message } from './message'

const KEYWORDS: ReadonlyArray<string> = [
  'const',
  'let',
  'var',
  'function',
  'return',
  'import',
  'export',
  'from',
  'type',
  'interface',
  'class',
  'if',
  'else',
  'true',
  'false',
  'null',
  'undefined',
  'new',
  'await',
  'async',
  'switch',
  'case',
  'break',
  'default',
]

type TokenKind = 'keyword' | 'string' | 'comment' | 'number' | 'plain'

const tokenClass = (kind: TokenKind): string => {
  if (kind === 'keyword') {
    return 'text-amber-300'
  }
  if (kind === 'string') {
    return 'text-emerald-300'
  }
  if (kind === 'comment') {
    return 'text-zinc-500'
  }
  if (kind === 'number') {
    return 'text-sky-300'
  }
  return 'text-zinc-100'
}

const takeWhile = (
  source: string,
  start: number,
  pred: (ch: string) => boolean,
): string => {
  let end = start
  while (end < source.length) {
    const ch = source.slice(end, end + 1)
    if (!pred(ch)) {
      break
    }
    end += 1
  }
  return source.slice(start, end)
}

const highlightLine = (
  h: ReturnType<typeof html<Message>>,
  source: string,
): ReadonlyArray<Html | string> => {
  const tokens: Array<Html | string> = []
  let i = 0
  while (i < source.length) {
    const rest = source.slice(i)
    if (rest.startsWith('//')) {
      tokens.push(h.span([h.Class(tokenClass('comment'))], [source.slice(i)]))
      break
    }
    const ch = source.slice(i, i + 1)
    if (ch === '"' || ch === "'" || ch === '`') {
      let end = i + 1
      while (end < source.length) {
        const next = source.slice(end, end + 1)
        if (next === '\\') {
          end += 2
          continue
        }
        if (next === ch) {
          end += 1
          break
        }
        end += 1
      }
      tokens.push(
        h.span([h.Class(tokenClass('string'))], [source.slice(i, end)]),
      )
      i = end
      continue
    }
    if (/[0-9]/.test(ch)) {
      const number = takeWhile(source, i, c => /[0-9.]/.test(c))
      tokens.push(h.span([h.Class(tokenClass('number'))], [number]))
      i += number.length
      continue
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const word = takeWhile(source, i, c => /[A-Za-z0-9_$]/.test(c))
      const kind: TokenKind = Array.some(KEYWORDS, key => key === word)
        ? 'keyword'
        : 'plain'
      tokens.push(h.span([h.Class(tokenClass(kind))], [word]))
      i += word.length
      continue
    }
    tokens.push(ch)
    i += 1
  }
  return tokens
}

const highlightCode = (
  h: ReturnType<typeof html<Message>>,
  source: string,
): ReadonlyArray<Html | string> => {
  const lines = source.split('\n')
  return Array.flatMap(lines, (line, index) => {
    const highlighted = highlightLine(h, line)
    if (index === lines.length - 1) {
      return highlighted
    }
    return [...highlighted, '\n']
  })
}

const STORY_CLASS =
  'text-[clamp(1.05rem,2.2vw,1.45rem)] font-semibold leading-snug text-zinc-100'
const MAP_CLASS =
  'min-w-0 w-full whitespace-pre-wrap break-words text-[clamp(0.95rem,1.8vw,1.2rem)] font-mono leading-relaxed'

const stripFence = (chunk: string): string => {
  const trimmed = String.trim(chunk)
  if (trimmed.endsWith('```')) {
    return String.trim(trimmed.slice(0, trimmed.length - 3))
  }
  return trimmed
}

const codeFromFence = (chunk: string): string => {
  const body = stripFence(chunk)
  const maybeNl = String.indexOf('\n')(body)
  if (Option.isNone(maybeNl)) {
    return body
  }
  return String.trim(body.slice(maybeNl.value + 1))
}

export type HtmlFactory = ReturnType<typeof html<Message>>

/**
 * Splits explore markdown into blocks. A fenced ``` pair stays one
 * block even when the fence contains blank lines. Example: two CLI
 * prints inside one ```text fence on `04-lock-in-vs-surface.md`.
 */
export const splitMarkdownBlocks = (
  markdown: string,
): ReadonlyArray<string> => {
  const source = markdown.replace(/\r\n/g, '\n')
  const lines = source.split('\n')
  const blocks: Array<string> = []
  let current: Array<string> = []
  let isInFence = false

  const flush = () => {
    const text = current.join('\n')
    if (!String.isEmpty(String.trim(text))) {
      blocks.push(text)
    }
    current = []
  }

  for (const line of lines) {
    const trimmed = String.trim(line)
    if (trimmed.startsWith('```')) {
      if (!isInFence) {
        flush()
        current.push(line)
        isInFence = true
      } else {
        current.push(line)
        flush()
        isInFence = false
      }
    } else if (!isInFence && String.isEmpty(line)) {
      flush()
    } else {
      current.push(line)
    }
  }
  flush()
  return blocks
}

const renderChunk = (h: HtmlFactory, chunk: string): Html => {
  const trimmed = String.trim(chunk)
  if (trimmed.startsWith('```')) {
    return h.pre(
      [
        h.Class(
          `${MAP_CLASS} explore-code rounded-xl border-2 border-zinc-700 bg-zinc-900 px-4 py-3`,
        ),
      ],
      highlightCode(h, codeFromFence(trimmed)),
    )
  }
  if (trimmed.startsWith('### ')) {
    return h.h2(
      [h.Class('text-[clamp(1.15rem,2.4vw,1.7rem)] font-black tracking-tight')],
      [trimmed.slice(4)],
    )
  }
  if (trimmed.startsWith('## ')) {
    return h.h2(
      [h.Class('text-[clamp(1.15rem,2.4vw,1.7rem)] font-black tracking-tight')],
      [trimmed.slice(3)],
    )
  }
  if (trimmed.startsWith('# ')) {
    return h.h2(
      [h.Class('text-[clamp(1.4rem,3vw,2.1rem)] font-black tracking-tight')],
      [trimmed.slice(2)],
    )
  }
  if (trimmed.startsWith('- ')) {
    const items = trimmed
      .split('\n')
      .map(line => String.trim(line))
      .filter(line => line.startsWith('- '))
    return h.ul(
      [h.Class('flex flex-col gap-1 pl-4 list-disc')],
      items.map(item => h.li([h.Class(STORY_CLASS)], [item.slice(2)])),
    )
  }
  return h.p([h.Class(STORY_CLASS)], [trimmed])
}

/** Renders explore markdown as zinc-dark Html. Code fences are highlighted. */
export const markdownView = (h: HtmlFactory, markdown: string): Html => {
  const blocks = Array.map(splitMarkdownBlocks(markdown), chunk =>
    renderChunk(h, chunk),
  )
  return h.div([h.Class('flex flex-col gap-3 pr-1')], blocks)
}
