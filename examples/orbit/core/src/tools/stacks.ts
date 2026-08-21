/**
 * Accepted stacks for the machine agent
 * foldkit | tca
 * rust = funding. grok-ios = current work, not scored.
 */

export type StackId = 'foldkit' | 'tca'
export type Client = 'web' | 'native' | 'terminal' | 'headless'

export function accepts(stack: string): stack is StackId {
  return stack === 'foldkit' || stack === 'tca'
}

export function corePasses(s: {
  stack: StackId
  coreLines: number
  clients: Client[]
  sameCore: boolean
}): boolean {
  return (
    accepts(s.stack) && s.sameCore && s.clients.length >= 2 && s.coreLines > 0
  )
}
