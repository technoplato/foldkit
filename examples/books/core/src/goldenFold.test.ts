import { Array, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import { App } from './app.js'
import { SetSpeed, ShowBookmarks, ShowLibrary } from './message.js'
import { SyncedBooks } from './synced.js'

/**
 * Golden-fold gate for `SyncedBooks.foldRevision`.
 *
 * If a change to Books' fold semantics alters the serialized Model without
 * bumping `SyncedBooks.foldRevision`, this test fails before a mismatched
 * shared snapshot can be served to cold-booting devices.
 */
describe('Books golden fold', () => {
  it('matches the committed golden domain fold for foldRevision books-fold-v2', () => {
    expect(SyncedBooks.foldRevision).toBe('books-fold-v2')

    const messages = [SetSpeed({ speed: 1.5 }), ShowBookmarks(), ShowLibrary()]

    const [initial] = App.init()
    const folded = Array.reduce(messages, initial, (model, message) => {
      const [next] = App.update(model, message)
      return next
    })

    const encoded = S.encodeSync(S.toCodecJson(App.Model))(folded)
    expect(encoded).toEqual(
      expect.objectContaining({
        speed: 1.5,
      }),
    )
    expect(JSON.stringify(encoded)).toMatchSnapshot()
  })
})
