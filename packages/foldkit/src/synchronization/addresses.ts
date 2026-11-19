import { Option, pipe } from 'effect'

// ADDRESSES

const withoutSignature = (address: string): Option.Option<URL> =>
  Option.liftThrowable(() => new URL(address))()

/**
 * The file a signed address names: the address without its query and
 * fragment, which is where a file store puts the signature it renews. Two
 * renewals of one file's address have the same key. Text that is not an
 * address is its own key.
 *
 * @example
 * ```typescript
 * addressKeyOf('https://files.example/a/cover?Policy=…&Signature=…')
 * // 'https://files.example/a/cover'
 * ```
 */
export const addressKeyOf = (address: string): string =>
  Option.match(withoutSignature(address), {
    onNone: () => address,
    onSome: url => `${url.origin}${url.pathname}`,
  })

const millisecondsPerSecond = 1_000

const base64Digits =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// NOTE: Written here, not asked of the host: a browser, Node and a phone's
// JavaScript engine do not all have the same base64 function, and this
// reads only the ASCII of a signed policy.
const textOfBase64 = (encoded: string): Option.Option<string> => {
  const digits = [...encoded.replaceAll('=', '')].map(digit =>
    base64Digits.indexOf(digit),
  )
  if (digits.some(digit => digit < 0)) {
    return Option.none()
  }
  const bits = digits.map(digit => digit.toString(2).padStart(6, '0')).join('')
  const bytes = bits.match(/.{8}/g) ?? []
  return Option.some(
    bytes.map(byte => String.fromCharCode(Number.parseInt(byte, 2))).join(''),
  )
}

const finite = (value: number): Option.Option<number> =>
  Number.isFinite(value) ? Option.some(value) : Option.none()

const secondsIn = (maybeText: string | null): Option.Option<number> =>
  pipe(
    Option.fromNullishOr(maybeText),
    Option.filter(text => /^\d+$/.test(text)),
    Option.flatMap(text => finite(Number(text))),
  )

// A content network's signed policy: base64 of a statement that says the
// time before which the address works, with `-`, `_` and `~` standing in
// for `+`, `=` and `/`.
const policyEndOf = (policy: string): Option.Option<number> =>
  pipe(
    textOfBase64(
      policy.replaceAll('-', '+').replaceAll('_', '=').replaceAll('~', '/'),
    ),
    Option.flatMap(text =>
      Option.fromNullishOr(/"AWS:EpochTime"\s*:\s*(\d+)/.exec(text)?.[1]),
    ),
    Option.flatMap(seconds => finite(Number(seconds))),
    Option.map(seconds => seconds * millisecondsPerSecond),
  )

// A signing date as an object store writes it: 20261118T210000Z.
const signingDateOf = (text: string): Option.Option<number> =>
  pipe(
    Option.fromNullishOr(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(text),
    ),
    Option.flatMap(([, year, month, day, hours, minutes, seconds]) =>
      finite(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hours),
          Number(minutes),
          Number(seconds),
        ),
      ),
    ),
  )

/**
 * When a signed address stops working, in epoch milliseconds, read from
 * what the address itself says: a signed policy's end, an `Expires` time
 * in seconds, or a signing date with how many seconds it lasts. None for
 * an address that does not say.
 *
 * @example
 * ```typescript
 * addressExpiresAtMs('https://files.example/a?Expires=1795050000&Signature=…')
 * // Some(1795050000000)
 * ```
 */
export const addressExpiresAtMs = (address: string): Option.Option<number> =>
  Option.flatMap(withoutSignature(address), url => {
    const asked = url.searchParams
    return pipe(
      Option.flatMap(Option.fromNullishOr(asked.get('Policy')), policyEndOf),
      Option.orElse(() =>
        Option.map(
          secondsIn(asked.get('Expires')),
          seconds => seconds * millisecondsPerSecond,
        ),
      ),
      Option.orElse(() =>
        Option.flatMap(
          Option.flatMap(
            Option.fromNullishOr(asked.get('X-Amz-Date')),
            signingDateOf,
          ),
          signedAtMs =>
            Option.map(
              secondsIn(asked.get('X-Amz-Expires')),
              seconds => signedAtMs + seconds * millisecondsPerSecond,
            ),
        ),
      ),
    )
  })

/** How long before its end a held address is given up for a renewed one. */
export const defaultAddressMarginMs = 3_600_000

/**
 * The address a Client keeps for a file when another arrives: the one it
 * holds, while that names the same file and says it still works for
 * longer than the margin, an hour unless told; otherwise the one that
 * arrived. So a renewed signature loads nothing again, and an address is
 * replaced before it stops working. A held address that does not say when
 * it ends is replaced, since nothing says it still works.
 *
 * @example
 * ```typescript
 * keptAddress(Option.some(held), renewed, Date.now()) // held, until its last hour
 * ```
 */
export const keptAddress = (
  maybeHeld: Option.Option<string>,
  arrived: string,
  nowMs: number,
  marginMs: number = defaultAddressMarginMs,
): string =>
  pipe(
    maybeHeld,
    Option.filter(held => addressKeyOf(held) === addressKeyOf(arrived)),
    Option.filter(held =>
      Option.exists(
        addressExpiresAtMs(held),
        endsAtMs => endsAtMs - marginMs > nowMs,
      ),
    ),
    Option.getOrElse(() => arrived),
  )
