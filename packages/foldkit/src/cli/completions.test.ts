/// <reference types="node" />
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  type CompletionShell,
  completionScriptOf,
  completionShellOf,
  installCompletion,
} from './completions.js'

const newHome = (): string =>
  mkdtempSync(join(tmpdir(), 'foldkit-completions-'))

describe('tab completion for a terminal host', () => {
  it('reads the shell a person is in from SHELL', () => {
    expect(completionShellOf('/bin/zsh')).toBe('zsh')
    expect(completionShellOf('/opt/homebrew/bin/fish')).toBe('fish')
    expect(completionShellOf('/bin/tcsh')).toBeUndefined()
    expect(completionShellOf(undefined)).toBeUndefined()
  })

  it('asks the command itself for the words, and holds none of them', () => {
    const shells: ReadonlyArray<CompletionShell> = ['zsh', 'bash', 'fish']
    for (const shell of shells) {
      const script = completionScriptOf(shell, 'counter')
      expect(script).toContain('counter completions words')
      expect(script).not.toContain('increment')
    }
  })

  it('installs for zsh with one startup line, however many commands are installed and however often', () => {
    const home = newHome()
    writeFileSync(join(home, '.zshrc'), 'export EDITOR=vi')
    const first = installCompletion('zsh', 'counter', home)
    expect(first.startupPath).toBe(join(home, '.zshrc'))
    expect(
      installCompletion('zsh', 'counters', home).startupPath,
    ).toBeUndefined()
    expect(
      installCompletion('zsh', 'counter', home).startupPath,
    ).toBeUndefined()
    const startup = readFileSync(join(home, '.zshrc'), 'utf8')
    expect(startup.startsWith('export EDITOR=vi\n')).toBe(true)
    expect(startup.match(/# foldkit completions/gu)).toHaveLength(1)
    expect(readFileSync(first.scriptPath, 'utf8')).toContain(
      'compdef _foldkit_counter counter',
    )
  })

  it('installs for fish where fish loads completions by itself', () => {
    const home = newHome()
    const installed = installCompletion('fish', 'counter', home)
    expect(installed.scriptPath).toBe(
      join(home, '.config', 'fish', 'completions', 'counter.fish'),
    )
    expect(installed.startupPath).toBeUndefined()
  })
})
