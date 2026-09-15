import { InstantCoreDatabase, i } from '@instantdb/core'

/**
 * Instant mapping of the Personal CFO slice.
 * Nested ADTs become kind strings. Access is always the string `read_only`.
 */
export const schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    personalCfoProfiles: i.entity({
      ownerId: i.string().unique().indexed(),
      email: i.string().unique().indexed(),
      plan: i.string().indexed(),
      createdAtMs: i.number().indexed(),
    }),
    personalCfoAccounts: i.entity({
      ownerId: i.string().indexed(),
      name: i.string(),
      institution: i.string(),
      kind: i.string().indexed(),
      currency: i.string(),
      balanceCents: i.number(),
      access: i.string().indexed(),
    }),
    personalCfoVaultFiles: i.entity({
      ownerId: i.string().indexed(),
      title: i.string(),
      origin: i.string().indexed(),
      createdAtMs: i.number().indexed(),
    }),
    personalCfoRadarJobs: i.entity({
      ownerId: i.string().indexed(),
      question: i.string(),
      cadence: i.string().indexed(),
      everyMinutes: i.number(),
      status: i.string().indexed(),
      lastAnswer: i.string(),
      lastAnswerHash: i.string().indexed(),
    }),
    personalCfoChatMessages: i.entity({
      ownerId: i.string().indexed(),
      role: i.string().indexed(),
      body: i.string(),
      createdAtMs: i.number().indexed(),
      citationsJson: i.string(),
    }),
    personalCfoNotifications: i.entity({
      ownerId: i.string().indexed(),
      title: i.string(),
      body: i.string(),
      channel: i.string().indexed(),
      status: i.string().indexed(),
      createdAtMs: i.number().indexed(),
    }),
  },
})

/** Typed Instant database used by Personal CFO hosts. */
export type PersonalCfoInstantDatabase = InstantCoreDatabase<typeof schema>

export default schema
