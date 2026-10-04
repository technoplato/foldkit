#!/usr/bin/env node
/**
 * The `books` command. Every command goes to this machine's player, which
 * keeps playing after the command returns, and prints what it is doing
 * and what to run next:
 *
 *   books                          what is playing, and commands to copy
 *   books help                     the same
 *   books listen a-new-earth       play a title from your place
 *   books pause                    pause; `books play` plays again
 *   books skip-forward             30 seconds on; `books skip-back` back
 *   books seek-to 1h00m00s         go to a place
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
import { parseProgramArgv } from 'foldkit/cli/view'
import { spawnSync } from 'node:child_process'

import { askPlayer, showPlayerTui, stopPlayer } from './view.js'

const hostedOrigin = 'https://books.pisspoursoftware.xyz'

const request = parseProgramArgv(process.argv.slice(2))

const [head = ''] = request._tag === 'Do' ? request.token.split(' ') : []

if (request._tag === 'Tail') {
  const { runTail } = await import('./inProcess.js')
  await runTail()
} else if (request._tag === 'Watch') {
  const { runWatch } = await import('./inProcess.js')
  await runWatch()
} else if (request._tag === 'Show') {
  await askPlayer({ _tag: 'Do', token: 'help', flags: request.flags })
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
