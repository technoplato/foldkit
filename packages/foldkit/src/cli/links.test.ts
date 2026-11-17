import { describe, expect, it } from 'vitest'

import {
  Column,
  List,
  Plain,
  Reference,
  RichText,
  Text,
} from '../renderers/elements.js'
import { linksOf } from '../renderers/query.js'
import { renderScreen } from '../renderers/render.js'
import { screenLinkLines } from './program.js'

const signInAddress = `https://sign-in.example.test/start?${'state=made-up-value&'.repeat(8)}done=1`

const connectScreen = Column(
  { gap: 1 },
  Text('Connect', { emphasis: 'Headline' }),
  List({
    label: 'Sign in',
    items: [
      {
        key: 'sign-in',
        title: 'Open the sign-in',
        lines: ['Opens in a new tab'],
        href: signInAddress,
      },
      {
        key: 'moment',
        title: 'Bookmark at 12:03',
        href: '/books/x/listen/12m03s',
      },
      { key: 'plain', title: 'No link here' },
    ],
  }),
  Text('The handbook', { href: 'https://handbook.example.test/' }),
  RichText([
    Plain('Fixed by '),
    Reference({ label: '#12', href: '/issues/12' }),
    Reference({ label: 'the report', href: 'mailto:reports@example.test' }),
  ]),
)

describe('the links on a screen', () => {
  it('reads every link with the words that name it, in order', () => {
    expect(linksOf(connectScreen)).toEqual([
      { title: 'Open the sign-in', href: signInAddress },
      { title: 'Bookmark at 12:03', href: '/books/x/listen/12m03s' },
      { title: 'The handbook', href: 'https://handbook.example.test/' },
      { title: '#12', href: '/issues/12' },
      { title: 'the report', href: 'mailto:reports@example.test' },
    ])
  })
})

describe('links in terminal text', () => {
  it('the painted screen names the sign-in row and cannot hold its address', () => {
    const painted = renderScreen(connectScreen)
    expect(painted).toContain('Open the sign-in')
    expect(painted).not.toContain(signInAddress)
  })

  it('prints each address that leaves the Program whole, under its words', () => {
    expect(screenLinkLines(connectScreen)).toEqual([
      '',
      'Links',
      '  Open the sign-in',
      `  ${signInAddress}`,
      '  The handbook',
      '  https://handbook.example.test/',
      '  the report',
      '  mailto:reports@example.test',
    ])
  })

  it('prints nothing for a screen whose links all stay in the Program', () => {
    expect(
      screenLinkLines(
        List({
          label: 'Bookmarks',
          items: [{ key: 'm', title: '12:03', href: '/books/x/listen/12m03s' }],
        }),
      ),
    ).toEqual([])
  })
})
