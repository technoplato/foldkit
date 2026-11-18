import { describe, expect, it } from 'vitest'

import { bindChapters } from '../test/apps/chapterContents.js'
import { runProgramCommand } from './program.js'

const run = (bound: ReturnType<typeof bindChapters>, text: string) =>
  runProgramCommand(bound, 'chapters', text.split(' '), {})

describe('a command’s choice, typed as a person names it', () => {
  it('takes the choice’s name, in any case, as well as its word', () => {
    const bound = bindChapters()
    expect(run(bound, 'jump-to-chapter chapter 7').exitCode).toBe(0)
    expect(bound.readModel().playing).toBe(7)
    expect(run(bound, 'jump-to-chapter 9').exitCode).toBe(0)
    expect(bound.readModel().playing).toBe(9)
  })

  it('takes part of the name when one choice holds every word typed, in any order', () => {
    const bound = bindChapters()
    expect(run(bound, 'jump-to-chapter 12 CHAPTER').exitCode).toBe(0)
    expect(bound.readModel().playing).toBe(12)
  })

  it('takes the choice named exactly even when longer names hold the same words', () => {
    const bound = bindChapters()
    expect(run(bound, 'jump-to-chapter Chapter 3').exitCode).toBe(0)
    expect(bound.readModel().playing).toBe(3)
  })

  it('lists the choices that match when there are several, with the command for each, and does nothing', () => {
    const bound = bindChapters()
    const vague = run(bound, 'jump-to-chapter chap 11')
    expect(vague.exitCode).toBe(2)
    expect(vague.stdout).toBe('')
    expect(vague.stderr?.split('\n')).toEqual([
      '"chap 11" matches 6 choices of jump-to-chapter. Say more of the name, or copy one:',
      '  chapters jump-to-chapter 11   Chapter 11',
      '  chapters jump-to-chapter 110  Chapter 110',
      '  chapters jump-to-chapter 111  Chapter 111',
      '  chapters jump-to-chapter 112  Chapter 112',
      '  chapters jump-to-chapter 113  Chapter 113',
      '  chapters jump-to-chapter 114  Chapter 114',
    ])
    expect(bound.readModel().playing).toBe(1)
  })

  it('shows a few of many matches and says how many more there are', () => {
    const result = run(bindChapters(), 'jump-to-chapter chapter')
    expect(result.exitCode).toBe(2)
    const lines = result.stderr?.split('\n') ?? []
    expect(lines[0]).toBe(
      '"chapter" matches 114 choices of jump-to-chapter. Say more of the name, or copy one:',
    )
    expect(lines).toHaveLength(10)
    expect(lines.at(-1)).toBe('  and 106 more.')
  })

  it('says nothing matches, shows the command’s own usage and a few it can take, and does nothing', () => {
    const result = run(bindChapters(), 'jump-to-chapter the tide')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    const lines = result.stderr?.split('\n') ?? []
    expect(lines[0]).toBe(
      'No choice of jump-to-chapter matches "the tide". Usage: chapters jump-to-chapter <chapter>, such as:',
    )
    expect(lines[1]).toBe('  chapters jump-to-chapter 2  Chapter 2')
    expect(lines.at(-1)).toMatch(/^ {2}and \d+ more\.$/)
  })

  it('shows the usage of a command given nothing to choose', () => {
    const result = run(bindChapters(), 'jump-to-chapter')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr?.split('\n')[0]).toBe(
      'jump-to-chapter needs a chapter. Usage: chapters jump-to-chapter <chapter>, such as:',
    )
  })
})

describe('a command nobody declared', () => {
  it('says so in a sentence, names the nearest by spelling, and where every command is listed', () => {
    const result = run(bindChapters(), 'jmp-to-chapter 3')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(
      'Unknown command "jmp-to-chapter 3". Nearest: chapters jump-to-chapter <chapter>. `chapters help` lists every command.',
    )
  })

  it('names up to three, the nearest first, and a host’s own commands among them', () => {
    const result = runProgramCommand(
      bindChapters(),
      'chapters',
      ['next'],
      {},
      {
        listCommand: 'actions',
        hostCommands: [{ command: 'text', what: 'Prints the text' }],
      },
    )
    expect(result.stderr).toBe(
      'Unknown command "next". Nearest: chapters next-chapter, chapters text. `chapters actions` lists every command.',
    )
  })

  it('names none when nothing is near', () => {
    const result = run(bindChapters(), 'zzzzzzzz')
    expect(result.stderr).toBe(
      'Unknown command "zzzzzzzz". `chapters help` lists every command.',
    )
  })
})
