#!/usr/bin/env node
import { parseHeadlessTimeFormat, startHeadlessPrinter } from './print.js'

const time = parseHeadlessTimeFormat(process.env['PUZZLE_HEADLESS_TIME'])
const timeZone = process.env['PUZZLE_HEADLESS_TZ']
const printer =
  timeZone === undefined
    ? startHeadlessPrinter({ time })
    : startHeadlessPrinter({ time, timeZone })
let printed = 0

const flush = (): void => {
  const lines = printer.lines()
  if (lines.length === printed) {
    return
  }
  const next = lines.slice(printed)
  printed = lines.length
  for (const line of next) {
    console.log(line)
  }
}

printer.handle.subscribe(flush)
flush()

const shutdown = (): void => {
  printer.stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
