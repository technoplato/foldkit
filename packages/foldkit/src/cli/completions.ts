/// <reference types="node" />
/**
 * Tab completion for a terminal host's command, as plain text for each
 * shell. The script asks the command itself what may come next, each time
 * Tab is pressed, so the words are the Program's own, as they stand now:
 * `counter completions words` prints `increment`, `decrement`, `reset`.
 *
 * This module must not import Effect, Instant, or a Program.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

/** The shells a completion script is written for. */
export type CompletionShell = 'zsh' | 'bash' | 'fish'

/** The word that installs tab completion, `counter completions`. */
export const completionsWord = 'completions'

/** The word after it that prints what may come next, `counter completions words increment`. */
export const completionWordsWord = 'words'

const isShell = (name: string): name is CompletionShell =>
  name === 'zsh' || name === 'bash' || name === 'fish'

/**
 * The shell a person is in, read from what `SHELL` names, `/bin/zsh`.
 * Nothing when it is another shell or not said.
 *
 * @example
 * ```typescript
 * completionShellOf('/bin/zsh') // 'zsh'
 * completionShellOf('/bin/tcsh') // undefined
 * ```
 */
export const completionShellOf = (
  shellPath: string | undefined,
): CompletionShell | undefined => {
  const name = shellPath === undefined ? '' : basename(shellPath)
  return isShell(name) ? name : undefined
}

const functionNameOf = (name: string): string =>
  `_foldkit_${name.replaceAll(/[^A-Za-z0-9]/gu, '_')}`

/**
 * The completion script for one command in one shell. It holds no word
 * of the Program's: it calls `<name> completions words` with what has
 * been typed and offers what that prints, one word a line.
 *
 * @example
 * ```typescript
 * completionScriptOf('zsh', 'counter')
 * // '_foldkit_counter() { … counter completions words … }\ncompdef _foldkit_counter counter'
 * ```
 */
export const completionScriptOf = (
  shell: CompletionShell,
  name: string,
): string => {
  const fn = functionNameOf(name)
  const ask = `${name} ${completionsWord} ${completionWordsWord}`
  if (shell === 'zsh') {
    return [
      `${fn}() {`,
      '  local -a found',
      `  found=(\${(f)"$(${ask} \${words[2,CURRENT-1]} 2>/dev/null)"})`,
      '  compadd -a found',
      '}',
      '(( $+functions[compdef] )) || { autoload -Uz compinit && compinit }',
      `compdef ${fn} ${name}`,
      '',
    ].join('\n')
  } else if (shell === 'bash') {
    return [
      `${fn}() {`,
      '  local said="${COMP_WORDS[*]:1:COMP_CWORD-1}"',
      `  COMPREPLY=($(compgen -W "$(${ask} $said 2>/dev/null)" -- "\${COMP_WORDS[COMP_CWORD]}"))`,
      '}',
      `complete -F ${fn} ${name}`,
      '',
    ].join('\n')
  } else {
    return [
      `complete -c ${name} -f -a "(${ask} (commandline -opc)[2..-1] 2>/dev/null)"`,
      '',
    ].join('\n')
  }
}

const completionsDirectory = (home: string): string =>
  join(home, '.local', 'share', 'foldkit', 'completions')

const startupMarker = '# foldkit completions'

const startupLineOf = (shell: 'zsh' | 'bash', directory: string): string =>
  shell === 'zsh'
    ? `for f in ${directory}/*.zsh(N); do source "$f"; done ${startupMarker}`
    : `for f in ${directory}/*.bash; do [ -f "$f" ] && source "$f"; done ${startupMarker}`

/** What installing a completion did: the file it wrote, and the startup file it added one line to, if any. */
export type CompletionInstalled = Readonly<{
  scriptPath: string
  startupPath?: string
}>

/**
 * Installs tab completion for one command in one shell. zsh and bash get
 * the script in `~/.local/share/foldkit/completions/` and, once, one line
 * in `~/.zshrc` or `~/.bashrc` that loads every script there; that line
 * runs no command, so a new shell starts as fast as before. fish gets the
 * script in `~/.config/fish/completions/`, which it loads by itself.
 * Installing again writes the script again and adds no second line.
 *
 * @example
 * ```typescript
 * installCompletion('zsh', 'counter')
 * // { scriptPath: '~/.local/share/foldkit/completions/counter.zsh', startupPath: '~/.zshrc' }
 * ```
 */
export const installCompletion = (
  shell: CompletionShell,
  name: string,
  home: string = homedir(),
): CompletionInstalled => {
  if (shell === 'fish') {
    const scriptPath = join(
      home,
      '.config',
      'fish',
      'completions',
      `${name}.fish`,
    )
    mkdirSync(dirname(scriptPath), { recursive: true })
    writeFileSync(scriptPath, completionScriptOf(shell, name))
    return { scriptPath }
  } else {
    const directory = completionsDirectory(home)
    const scriptPath = join(directory, `${name}.${shell}`)
    mkdirSync(directory, { recursive: true })
    writeFileSync(scriptPath, completionScriptOf(shell, name))
    const startupPath = join(home, shell === 'zsh' ? '.zshrc' : '.bashrc')
    const startup = existsSync(startupPath)
      ? readFileSync(startupPath, 'utf8')
      : ''
    if (startup.includes(startupMarker)) {
      return { scriptPath }
    } else {
      appendFileSync(
        startupPath,
        `${startup === '' || startup.endsWith('\n') ? '' : '\n'}${startupLineOf(shell, directory)}\n`,
      )
      return { scriptPath, startupPath }
    }
  }
}
