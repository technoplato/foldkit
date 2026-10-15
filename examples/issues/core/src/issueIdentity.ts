import { Context, Effect } from 'effect'

/**
 * Identity and time inputs needed to create one new Issue, and who writes:
 * `author` is the person signed in on the site, such as `owner@example.com`,
 * or an agent's name on the CLI, such as `claude-code`.
 */
export type IssueIdentityService = Readonly<{
  author: Effect.Effect<string>
  next: Effect.Effect<Readonly<{ id: string; nowMs: number }>>
}>

/** A controlled dependency for Issue identity and creation time. */
export class IssueIdentity extends Context.Service<
  IssueIdentity,
  IssueIdentityService
>()('issues-example/IssueIdentity') {}

/** Browser and Node identity generation used by live hosts, writing as `author`. */
export const liveIssueIdentity = (
  author: Effect.Effect<string>,
): IssueIdentityService => ({
  author,
  next: Effect.sync(() => ({ id: crypto.randomUUID(), nowMs: Date.now() })),
})
