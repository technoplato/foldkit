import { Array, Option, Schema as S } from 'effect'

/** One native SOL transfer decoded from a Solana Pay URI. */
export const SolanaPayTransfer = S.Struct({
  recipient: S.String,
  maybeAmount: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
  maybeLabel: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
  maybeCluster: S.OptionFromNullishOr(S.String, { onNoneEncoding: null }),
})
/** One native SOL transfer decoded from a Solana Pay URI. */
export type SolanaPayTransfer = typeof SolanaPayTransfer.Type

export type PrintSolanaPayTransferUriInput = Readonly<{
  recipient: string
  amount?: string
  label?: string
  cluster?: string
}>

const queryPart = (
  name: string,
  value: string | undefined,
): string | undefined => {
  if (value === undefined) {
    return undefined
  }
  return `${name}=${encodeURIComponent(value)}`
}

/** Prints a native SOL Solana Pay URI. Amount is decimal SOL. */
export const printSolanaPayTransferUri = (
  input: PrintSolanaPayTransferUriInput,
): string => {
  const query = Array.join(
    Array.getSomes([
      Option.fromNullishOr(queryPart('amount', input.amount)),
      Option.fromNullishOr(queryPart('label', input.label)),
      Option.fromNullishOr(queryPart('cluster', input.cluster)),
    ]),
    '&',
  )
  if (query === '') {
    return `solana:${input.recipient}`
  }
  return `solana:${input.recipient}?${query}`
}

const recipientFromCarrier = (carrier: URL): Option.Option<string> => {
  const pathname = carrier.pathname.startsWith('/')
    ? carrier.pathname.slice(1)
    : carrier.pathname
  const recipient = pathname === '' ? carrier.hostname : pathname
  if (recipient === '' || recipient.includes('/')) {
    return Option.none()
  }
  return Option.some(recipient)
}

/** Parses a pasted native SOL Solana Pay URI. SPL token transfers are ignored. */
export const parseSolanaPayTransferUri = (
  input: string,
): Option.Option<SolanaPayTransfer> => {
  const trimmed = input.trim()
  if (trimmed === '') {
    return Option.none()
  }
  try {
    const carrier = new URL(trimmed)
    if (carrier.protocol !== 'solana:') {
      return Option.none()
    }
    if (carrier.searchParams.get('spl-token') !== null) {
      return Option.none()
    }
    const maybeRecipient = recipientFromCarrier(carrier)
    if (Option.isNone(maybeRecipient)) {
      return Option.none()
    }
    return Option.some(
      SolanaPayTransfer.make({
        recipient: maybeRecipient.value,
        maybeAmount: Option.fromNullishOr(carrier.searchParams.get('amount')),
        maybeLabel: Option.fromNullishOr(carrier.searchParams.get('label')),
        maybeCluster: Option.fromNullishOr(carrier.searchParams.get('cluster')),
      }),
    )
  } catch {
    return Option.none()
  }
}
