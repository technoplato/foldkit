import { Array, Option } from 'effect'
import { Catalog, Interaction } from 'foldkit'
import * as Declaration from 'foldkit/declaration'
import { describe, expect, it } from 'vitest'

import { App } from './app.js'
import { ReceivedShelf, catalog } from './message.js'
import { sampleShelf } from './sample.js'

const interaction = Option.getOrThrowWith(
  Option.fromNullishOr(App.interaction),
  () => new Error('Books has no interaction'),
)

const withShelf = App.update(
  App.init()[0],
  ReceivedShelf({ shelf: sampleShelf }),
)[0]

const sentences = Array.map(catalog.actions, action => action.what)

const declaredKeys = Array.flatMap(catalog.actions, action => action.meta.keys)

const platforms: ReadonlyArray<Interaction.KeyPlatform> = ['Mac', 'Other']

describe('what each Books Action says it does', () => {
  it('is one plain sentence that starts with what it does', () => {
    expect(
      Array.filter(
        sentences,
        sentence =>
          !/^[A-Z][a-z]+s\b/.test(sentence) ||
          /[.!?]/.test(sentence) ||
          sentence.length > 110,
      ),
    ).toEqual([])
  })

  it('speaks of the book and the place, not of a title, a listener, or a player', () => {
    expect(
      Array.filter(sentences, sentence =>
        /\b(the|a) (title|listener|player)\b/.test(sentence),
      ),
    ).toEqual([])
  })

  it('says what it does and why the user would want it, never to the user, and in no Client’s words', () => {
    expect(
      Array.flatMap(Catalog.declarationsOf(catalog), declaration => [
        ...Declaration.problemsOf(declaration),
        ...Declaration.clientWordsOf(declaration),
      ]),
    ).toEqual([])
  })

  it('is the same sentence the menu row and the button show', () => {
    const rows = Option.getOrThrow(
      interaction.menu(
        Array.reduce(
          interaction.openMenu(withShelf),
          withShelf,
          (model, message) => App.update(model, message)[0],
        ),
      ),
    ).rows
    const listen = Option.getOrThrow(
      Array.findFirst(rows, row => row.entry.tag === 'Listen'),
    )
    expect(Interaction.textOf(listen.description)).toBe(
      'Plays this book from where it was last stopped',
    )
  })
})

describe('the keys Books shows in a browser', () => {
  it('declares no key a browser keeps for itself', () => {
    expect(
      Array.flatMap(platforms, platform =>
        Array.filter(declaredKeys, key =>
          Interaction.isHostOwnedKey(
            'Browser',
            platform,
            Interaction.keyInput(key),
          ),
        ),
      ),
    ).toEqual([])
  })

  it('opens the menu with a chord a browser leaves to the page', () => {
    expect(
      Array.flatMap(platforms, platform =>
        Array.filter(interaction.menuKeys, key =>
          Interaction.isHostOwnedKey('Browser', platform, key),
        ),
      ),
    ).toEqual([])
  })

  it('numbers menu rows with Control on a Mac, never with the chord that switches tabs', () => {
    expect(
      Array.map(Array.range(1, 9), pick =>
        Option.getOrNull(Interaction.pickShortcutOf(pick, 'Mac', 'Browser')),
      ),
    ).toEqual(['⌃1', '⌃2', '⌃3', '⌃4', '⌃5', '⌃6', '⌃7', '⌃8', '⌃9'])
    expect(
      Array.filter(Array.range(1, 9), pick =>
        Option.isSome(Interaction.pickShortcutOf(pick, 'Other', 'Browser')),
      ),
    ).toEqual([])
  })
})
