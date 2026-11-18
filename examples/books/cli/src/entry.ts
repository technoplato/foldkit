#!/usr/bin/env node
/**
 * The `books` command. Every command goes to this machine's player, which
 * keeps playing after the command returns, and prints what it is doing
 * and what to run next. `books` alone, or `books help`, says what there
 * is to run; `books help <command>` says everything about one. That help
 * is read from the declarations in `declared.ts` and in the Books core,
 * so no list of commands is kept here.
 *
 * Run it as `books`, the launcher `scripts/install-books-command` puts on
 * your PATH: it picks where to sign in and which library to open. This
 * file must not import Effect, Instant, or the Program, so a command
 * starts fast: it reads what the terminal declares as plain data, kept
 * in a file beside the player's socket and derived again when the code
 * changes.
 */
import {
  type Node,
  type Parameters,
  askedOf,
  cachedDerivation,
  declaredCommandOf,
  flagOf,
  parseProgramArgv,
  readStdinText,
  toggleFlagsOf,
  withStdinWord,
  writeCliViewResult,
} from 'foldkit/cli/view'
import type { GivenOfDeclared } from 'foldkit/declaration'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { viewDeclared } from './declared.js'
import { listAudioDevices, paintAudioDevices } from './devices.js'
import { booksCommandName, booksPlayerSocketPath } from './settings.js'
import {
  askPlayer,
  followPlayer,
  paintsColor,
  showBriefOrUsage,
  showPlayerTui,
  stopPlayer,
} from './view.js'

const hostedOrigin = 'https://books.pisspoursoftware.xyz'

const notUnderstoodExitCode = 2

type Declared = Readonly<{
  hostTree: ReadonlyArray<Node>
  everywhere: Parameters
}>

const declared = await cachedDerivation<Declared>({
  cachePath: join(dirname(booksPlayerSocketPath()), 'books-declared.json'),
  sourcePath: fileURLToPath(new URL('./declared.js', import.meta.url)),
  derive: async () => {
    const { everywhere, hostTree } = await import('./declared.js')
    return { hostTree, everywhere }
  },
})

const argv = await withStdinWord(process.argv.slice(2), () => readStdinText())

// NOTE: Whether to paint is this view's to know: its output is a
// terminal, and color was not refused. The player paints from the theme.
const paints = paintsColor(process.stdout.isTTY === true, process.env)

// NOTE: The ground a terminal has is a fact only this view can read; the
// player takes it as said, and assumes nothing when the terminal is silent.
const groundSaid = process.env['COLORFGBG'] ?? ''

const paintedArgv =
  paints && !argv.includes('--json')
    ? [
        ...argv,
        '--color=1',
        ...(groundSaid === ''
          ? []
          : [`${flagOf('terminalGround')}=${groundSaid}`]),
      ]
    : argv

const request = parseProgramArgv(paintedArgv, {
  switches: toggleFlagsOf(declared.hostTree, declared.everywhere),
})

const wordsOf = (): ReadonlyArray<string> => {
  if (request._tag === 'Do') {
    return request.token.split(' ')
  } else if (request._tag === 'Tail') {
    return ['tail']
  } else if (request._tag === 'Watch') {
    return ['watch']
  } else {
    return ['help']
  }
}

const words = wordsOf()

const asked = askedOf(declared.hostTree, words, request.flags, {
  name: booksCommandName,
  everywhere: declared.everywhere,
})

// NOTE: The player picks its audio output when it starts, from this
// variable, so the device takes effect on the command that starts it.
if (request.flags['device'] !== undefined) {
  process.env['FOLDKIT_AUDIO_DEVICE'] = request.flags['device']
}

type ViewDeclared = (typeof viewDeclared)[number]

type ViewHandlers = {
  readonly [D in ViewDeclared as D['declaration']['name']]: (
    given: GivenOfDeclared<D>,
  ) => Promise<void>
}

// NOTE: One handler for each command this terminal answers itself. The
// type is read from the declarations, so a command declared without a
// handler, or a handler that reads a parameter that is not declared,
// does not compile.
const answer: ViewHandlers = {
  Help: async given => {
    if (given.command === undefined) {
      await showBriefOrUsage(request.flags)
    } else {
      const { commandHelp } = await import('./help.js')
      const text = commandHelp(given.command.split(' '))
      writeCliViewResult(
        text === undefined
          ? {
              stdout: '',
              stderr: `Nothing here is called "${given.command}".`,
              exitCode: notUnderstoodExitCode,
            }
          : { stdout: text, stderr: '', exitCode: 0 },
      )
    }
  },
  Devices: async () => {
    process.stdout.write(
      `${paintAudioDevices(listAudioDevices(), {
        stop: `${booksCommandName} ${declaredCommandOf(['Stop'])}`,
        deviceFlag: flagOf('device'),
      })}\n`,
    )
  },
  Login: async () => {
    const login = spawnSync('cloudflared', ['access', 'login', hostedOrigin], {
      stdio: 'inherit',
    })
    process.exitCode = login.status ?? 1
  },
  Stop: () => stopPlayer(),
  Tui: () => showPlayerTui(),
  Follow: given => followPlayer({ topic: given.topic, flags: request.flags }),
  Watch: async () => {
    const { runWatch } = await import('./inProcess.js')
    await runWatch()
  },
  Tail: async () => {
    const { runTail } = await import('./inProcess.js')
    await runTail()
  },
}

const isViewName = (name: string): name is keyof ViewHandlers =>
  Object.hasOwn(answer, name)

if (asked._tag === 'Refused') {
  writeCliViewResult({
    stdout: '',
    stderr: asked.sentence,
    exitCode: notUnderstoodExitCode,
  })
} else if (asked._tag === 'Asked' && isViewName(asked.declaration.name)) {
  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  await answer[asked.declaration.name](asked.given as never)
} else if (
  asked._tag === 'Asked' &&
  asked.declaration.name === 'Actions' &&
  asked.given['json'] === true
) {
  const { toolsText } = await import('./help.js')
  process.stdout.write(`${toolsText()}\n`)
} else if (asked._tag === 'Asked' && request._tag === 'Do') {
  // NOTE: The player hears a command by its own name, whichever of its
  // names was typed, with the words after it as they were.
  await askPlayer({
    ...request,
    token: [
      declaredCommandOf(asked.path),
      ...words.slice(asked.path.length),
    ].join(' '),
  })
} else if (request._tag === 'Tail' || request._tag === 'Watch') {
  await showBriefOrUsage(request.flags)
} else {
  await askPlayer(request)
}
