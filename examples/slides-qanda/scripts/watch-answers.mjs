import { readFileSync, watch } from 'node:fs'
import { resolve } from 'node:path'

const answersDir = resolve(import.meta.dirname, '../answers')
const pending = new Map()
const lastHead = new Map()
const DEBOUNCE_MS = 400

const headKey = raw => {
  try {
    const value = JSON.parse(raw)
    if (value === null || typeof value !== 'object') {
      return raw
    }
    const answers = value.answers
    if (!Array.isArray(answers)) {
      return raw
    }
    const newest = answers[0]
    if (newest === null || typeof newest !== 'object') {
      return raw
    }
    return `${String(newest.at)}\n${String(newest.verbatim)}`
  } catch {
    return raw
  }
}

const emit = filename => {
  const full = resolve(answersDir, filename)
  let raw = ''
  try {
    raw = readFileSync(full, 'utf8')
  } catch {
    return
  }
  const key = headKey(raw)
  if (lastHead.get(filename) === key) {
    return
  }
  lastHead.set(filename, key)
  const slideId = filename.replace(/\.json$/, '')
  process.stdout.write(
    `AGENT_LOOP_WAKE_death-answers ${JSON.stringify({
      prompt: `Answer file changed: examples/slides-qanda/answers/${filename}. Read the newest stamp. Write cleaned. Fold into DEATH/qanda.md. Add a follow-up slide only if the answer is unclear.`,
      slideId,
      file: `examples/slides-qanda/answers/${filename}`,
    })}\n`,
  )
}

watch(answersDir, (_event, filename) => {
  if (filename === null || !filename.endsWith('.json')) {
    return
  }
  const prior = pending.get(filename)
  if (prior !== undefined) {
    clearTimeout(prior)
  }
  pending.set(
    filename,
    setTimeout(() => {
      pending.delete(filename)
      emit(filename)
    }, DEBOUNCE_MS),
  )
})

process.stdout.write(`death-answers watcher ready ${answersDir}\n`)
