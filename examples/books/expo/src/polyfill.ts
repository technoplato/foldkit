import 'react-native-get-random-values'

const hexByte = (value: number): string => value.toString(16).padStart(2, '0')

const uuidFromBytes = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes, hexByte).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const randomUuid = (): string => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const versioned = Uint8Array.from(bytes, (value, index) => {
    if (index === 6) {
      return (value & 0x0f) | 0x40
    }
    if (index === 8) {
      return (value & 0x3f) | 0x80
    }
    return value
  })
  return uuidFromBytes(versioned)
}

if (typeof globalThis.crypto.randomUUID !== 'function') {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: randomUuid,
  })
}

// NOTE: the phone's JavaScript engine (Hermes) has no `Intl.ListFormat`,
// which the Books core uses to join words: `a, b, and c`. This gives the
// engine English lists, the only ones Books writes.
type ListKind = 'conjunction' | 'disjunction' | 'unit'

const joiningWord = (kind: ListKind): string => {
  if (kind === 'conjunction') {
    return 'and'
  } else if (kind === 'disjunction') {
    return 'or'
  } else {
    return ''
  }
}

const joinedWith = (word: string, items: ReadonlyArray<string>): string => {
  const last = items.at(-1) ?? ''
  const before = items.slice(0, -1)
  const lastPart = word === '' ? last : `${word} ${last}`
  if (before.length === 0) {
    return last
  } else if (before.length === 1) {
    return `${before.join('')}${word === '' ? ',' : ''} ${lastPart}`
  } else {
    return `${before.join(', ')}, ${lastPart}`
  }
}

class EnglishListFormat {
  readonly #word: string

  constructor(
    _locales?: string | ReadonlyArray<string>,
    options?: Readonly<{ type?: ListKind }>,
  ) {
    this.#word = joiningWord(options?.type ?? 'conjunction')
  }

  format(items: Iterable<string>): string {
    return joinedWith(this.#word, [...items])
  }
}

if (typeof Reflect.get(Intl, 'ListFormat') !== 'function') {
  Object.defineProperty(Intl, 'ListFormat', {
    configurable: true,
    value: EnglishListFormat,
  })
}
