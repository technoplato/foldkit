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
