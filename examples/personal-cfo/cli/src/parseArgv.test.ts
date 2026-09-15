import { describe, expect, it } from 'vitest'

import { parseCfoArgv } from './parseArgv.js'

describe('parseCfoArgv', () => {
  it('parses login, ledger writes, radar, notify, and chat', () => {
    expect(parseCfoArgv(['login', '--email', 'a@b.com'])).toEqual({
      _tag: 'Login',
      email: 'a@b.com',
    })
    expect(
      parseCfoArgv([
        'accounts',
        'add',
        '--name',
        'Cash',
        '--kind',
        'cash',
        '--balance-cents',
        '100',
      ]),
    ).toMatchObject({ _tag: 'AddAccount', name: 'Cash', kind: 'cash' })
    expect(parseCfoArgv(['radar', 'arm', '--question', 'Move?'])).toMatchObject(
      {
        _tag: 'ArmRadar',
        question: 'Move?',
        cadence: 'daily',
      },
    )
    expect(parseCfoArgv(['notify', '--title', 'T', '--body', 'B'])).toEqual({
      _tag: 'Notify',
      title: 'T',
      body: 'B',
    })
    expect(parseCfoArgv(['chat', 'send', '--text', 'Net?'])).toEqual({
      _tag: 'Chat',
      text: 'Net?',
    })
  })

  it('fails unknown commands with exit 1', () => {
    expect(parseCfoArgv(['transfer'])).toEqual({
      _tag: 'Failed',
      message: 'Unknown command "transfer". Use cfo --help.',
      exitCode: 1,
    })
  })
})
