// LOOK ALIKE

const base58SharedEnds = 3
const hexSharedEnds = 4
const hexPrefix = '0x'

const isHex = (address: string): boolean => address.startsWith(hexPrefix)

const comparable = (address: string): string =>
  (isHex(address) ? address.slice(hexPrefix.length) : address).toLowerCase()

/**
 * True when `address` is not `other` and could be taken for it at a
 * glance: the same first or the same last characters, in any case, three
 * for a Solana address and four after `0x` for an Ethereum one. Address
 * poisoning sends dust from such an address so that it sits in a payment
 * list beside the real one, waiting to be copied. Money Scribe holds never
 * moves to one; an honest address is refused by chance about once in
 * twenty thousand.
 *
 * @example
 * ```typescript
 * isLookAlikeOf('43T9AN5mffG8AboAYcjkvDNfVGhVAG4suMFn1Nug2xjc', '43T9sv9YZEcDD9gMeqUWQX9SEcXU5x9JGv5KQydbKxjc') // true
 * isLookAlikeOf('9P5ZvpucqtaMqGD9LrwmxqZJvELKrehApri4GCCYt6f7', '43T9sv9YZEcDD9gMeqUWQX9SEcXU5x9JGv5KQydbKxjc') // false
 * ```
 */
export const isLookAlikeOf = (address: string, other: string): boolean => {
  const sharedEnds = isHex(other) ? hexSharedEnds : base58SharedEnds
  const mine = comparable(address)
  const theirs = comparable(other)
  return (
    address !== other &&
    (mine.slice(0, sharedEnds) === theirs.slice(0, sharedEnds) ||
      mine.slice(-sharedEnds) === theirs.slice(-sharedEnds))
  )
}
