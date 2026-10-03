import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  LoadDocument,
  OpenInProgram,
  ShowHostPage,
  linkTargetOf,
} from './browserHistory.js'

const ownsUri = (uri: string): boolean => uri.startsWith('/counter')

describe('linkTargetOf', () => {
  it('opens a Program URI in the Program', () => {
    expect(
      linkTargetOf('/counter/session', {
        ownsUri,
        maybeCurrentUri: Option.some('/counter'),
        hostPages: 'ProgramOnly',
      }),
    ).toEqual(OpenInProgram())
  })

  it('shows a host page without a reload only when the app has them', () => {
    expect(
      linkTargetOf('/about', {
        ownsUri,
        maybeCurrentUri: Option.some('/counter'),
        hostPages: 'WithHostPages',
      }),
    ).toEqual(ShowHostPage())
    expect(
      linkTargetOf('/about', {
        ownsUri,
        maybeCurrentUri: Option.some('/counter'),
        hostPages: 'ProgramOnly',
      }),
    ).toEqual(LoadDocument())
  })

  it('writes the address bar for a Program URI while a host page shows', () => {
    expect(
      linkTargetOf('/counter', {
        ownsUri,
        maybeCurrentUri: Option.some('/about'),
        hostPages: 'WithHostPages',
      }),
    ).toEqual(ShowHostPage())
  })

  it('loads another origin as a document', () => {
    expect(
      linkTargetOf('https://effect.website', {
        ownsUri,
        maybeCurrentUri: Option.some('/counter'),
        hostPages: 'WithHostPages',
      }),
    ).toEqual(LoadDocument())
  })
})
