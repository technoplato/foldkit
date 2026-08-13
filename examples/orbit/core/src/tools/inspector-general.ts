/**
 * Inspector General — evolving, versioned message policy
 * Bodies stay opaque. Only a class + decision is emitted.
 */

export type Decision = "allow" | "hold" | "refuse"

export type Verdict = {
  decision: Decision
  rule: string
  version: number
}

const REFUSE = [
  /child\s*(porn|explo)/i,
  /\b(kill|murder)\b.{0,20}\b(for hire|instruction)/i,
]

const HOLD = [/\b(wallet seed|private key|mnemonic)\b/i, /\bsend\s+bitcoin\b/i]

export const VERSION = 1

export function inspectMessage(text: string): Verdict {
  for (const r of REFUSE) {
    if (r.test(text)) return { decision: "refuse", rule: String(r), version: VERSION }
  }
  for (const r of HOLD) {
    if (r.test(text)) return { decision: "hold", rule: String(r), version: VERSION }
  }
  return { decision: "allow", rule: "genesis.allow", version: VERSION }
}
