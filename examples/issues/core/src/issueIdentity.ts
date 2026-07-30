import { Context, Effect } from 'effect'

/** Identity and time inputs needed to create one new Issue. */
export type IssueIdentityService = Readonly<{
  next: Effect.Effect<Readonly<{ id: string; nowMs: number }>>
}>

/** A controlled dependency for Issue identity and creation time. */
export class IssueIdentity extends Context.Service<
  IssueIdentity,
  IssueIdentityService
>()('issues-example/IssueIdentity') {}

/** Browser and Node identity generation used by live hosts. */
export const LiveIssueIdentity: IssueIdentityService = {
  next: Effect.sync(() => ({ id: crypto.randomUUID(), nowMs: Date.now() })),
}
