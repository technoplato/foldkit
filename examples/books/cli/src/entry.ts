#!/usr/bin/env node
/**
 * The `books` command. Every command goes to this machine's player, which
 * keeps playing after the command returns, and prints what it is doing
 * and what to run next:
 *
 *   books                          what is playing, and commands to copy;
 *                                  with no player running, how to use it,
 *                                  and it starts none
 *   books help                     the same
 *   books listen a-new-earth       play a title from your place
 *   books pause                    pause; `books play` plays again
 *   books skip-forward             30 seconds on; `books skip-back` back
 *   books seek-to 1h00m00s         go to a place
 *   books open /books/audible      go to a page and print it; `books back` returns
 *   books screen                   the page the player is on
 *   books devices                  the audio outputs, by number
 *   books listen <title> --device 4   play on that output, when this command starts the player
 *   pbpaste | books connect-audible -   a last word of `-` is read from stdin
 *   books words                    the paragraph being read, with those around it
 *   books follow words             the same, again on each new paragraph
 *   books follow words --json      as lines of JSON, for another program
 *   books bookmark                 mark the word being spoken; words after it are its note
 *   books bookmarks                this title's bookmarks, a line each; --json for another program
 *   books search "lit at dusk"     where those words are spoken, with links
 *   books search lamp --json       the same as one line of JSON
 *   books open <a link to a word>  go to that word, paused
 *   books link                     the whole link to the word being read
 *   books play-from <link or time> play from the word a link names, or a time
 *   books tui                      the player, live, in this terminal
 *   books stop                     pause, save your place, end the player
 *   books actions                  every command
 *   books login                    sign in to Cloudflare Access
 *   books watch                    repaint the library as it changes
 *   books tail                     print every Message as it lands
 *
 * Run it as `books`, the launcher `scripts/install-books-command` puts on
 * your PATH: it picks where to sign in and which library to open. This
 * file must not import Effect, Instant, or the Program, so a command
 * starts fast.
 */
import {
  followArgvOf,
  parseProgramArgv,
  readStdinText,
  withStdinWord,
} from 'foldkit/cli/view'
import { spawnSync } from 'node:child_process'

import { listAudioDevices, paintAudioDevices } from './devices.js'
import {
  askPlayer,
  followPlayer,
  showBriefOrUsage,
  showPlayerTui,
  stopPlayer,
} from './view.js'

const hostedOrigin = 'https://books.pisspoursoftware.xyz'

const argv = await withStdinWord(process.argv.slice(2), () => readStdinText())

// NOTE: Whether to paint is this view's to know: its output is a
// terminal, and color was not refused. The player paints from the theme.
const paints =
  process.stdout.isTTY === true &&
  (process.env['NO_COLOR'] ?? '') === '' &&
  process.env['TERM'] !== 'dumb'

const paintedArgv =
  paints && !argv.includes('--json') ? [...argv, '--color', '1'] : argv

const request = parseProgramArgv(paintedArgv)

const maybeFollow = followArgvOf(paintedArgv)

const [head = ''] = request._tag === 'Do' ? request.token.split(' ') : []

// NOTE: The player picks its audio output when it starts, from this
// variable, so --device takes effect on the command that starts it.
if (request.flags['device'] !== undefined) {
  process.env['FOLDKIT_AUDIO_DEVICE'] = request.flags['device']
}

if (maybeFollow !== undefined) {
  await followPlayer(maybeFollow)
} else if (request._tag === 'Tail') {
  const { runTail } = await import('./inProcess.js')
  await runTail()
} else if (request._tag === 'Watch') {
  const { runWatch } = await import('./inProcess.js')
  await runWatch()
} else if (request._tag === 'Show' || head === 'help') {
  await showBriefOrUsage(request.flags)
} else if (head === 'devices') {
  process.stdout.write(`${paintAudioDevices(listAudioDevices())}\n`)
} else if (head === 'login') {
  const login = spawnSync('cloudflared', ['access', 'login', hostedOrigin], {
    stdio: 'inherit',
  })
  process.exitCode = login.status ?? 1
} else if (head === 'stop') {
  await stopPlayer()
} else if (head === 'tui') {
  await showPlayerTui()
} else {
  await askPlayer(request)
}
