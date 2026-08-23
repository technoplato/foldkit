import { Match as M } from 'effect'
import { Command } from 'foldkit'
import { NonEmptyString } from 'foldkit/adt'
import { evo } from 'foldkit/struct'

import { ApplyVisibility, ReadOrigin } from './command.js'
import { type Message } from './message.js'
import {
  Applied,
  ApplyFailed,
  ApplyIdle,
  Applying,
  DraftIdle,
  Drafting,
  type Model,
  Public,
  Restricted,
  Snapshot,
  defaultRestricted,
  findHost,
  isSettingsHost,
  ownerEmail,
  withNotice,
  withSnapshot,
  withoutNotice,
} from './model.js'
import { SettingsOrigin } from './origin.js'

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, SettingsOrigin>>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

const snapshotOf = (
  token: Model['token'],
  hosts: ReadonlyArray<(typeof import('./model.js').Host)['Type']>,
) => Snapshot.make({ token, hosts })

const restrictedEmails = (
  model: Model,
  host: string,
): ReadonlyArray<typeof NonEmptyString.Type> => {
  const maybeHost = findHost(model.hosts, host)
  if (maybeHost._tag === 'None') {
    return defaultRestricted().emails
  }
  if (maybeHost.value.visibility._tag === 'Public') {
    return defaultRestricted().emails
  }
  return maybeHost.value.visibility.emails
}

const asRestricted = (
  emails: ReadonlyArray<typeof NonEmptyString.Type>,
): typeof Restricted.Type => {
  const head = emails[0]
  if (head === undefined) {
    return defaultRestricted()
  }
  return Restricted.make({
    emails: [head, ...emails.slice(1)],
  })
}

const withEmails = (
  emails: ReadonlyArray<typeof NonEmptyString.Type>,
  added: string,
): typeof Restricted.Type => {
  const next = emails.includes(added)
    ? emails
    : [...emails, NonEmptyString.make(added)]
  return asRestricted(next)
}

const withoutEmail = (
  emails: ReadonlyArray<typeof NonEmptyString.Type>,
  host: string,
  removed: string,
): typeof Restricted.Type => {
  const kept = emails.filter(email => email !== removed)
  const ensured =
    isSettingsHost(host) && !kept.includes(ownerEmail)
      ? [NonEmptyString.make(ownerEmail), ...kept]
      : kept
  if (ensured.length === 0) {
    return defaultRestricted()
  }
  return asRestricted(ensured)
}

/** Applies one Settings Message to the current Model. */
export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      ClickedRefresh: () => {
        if (model.apply._tag === 'Applying') {
          return [model, []]
        }
        return [
          evo(model, {
            apply: () => Applying(),
            notice: () => withoutNotice(model).notice,
          }),
          [ReadOrigin()],
        ]
      },
      ClickedPublic: ({ host }) => {
        if (model.apply._tag === 'Applying') {
          return [model, []]
        }
        if (isSettingsHost(host)) {
          return [
            evo(model, {
              apply: () =>
                ApplyFailed.make({
                  reason: NonEmptyString.make('settings stays Restricted'),
                }),
              notice: () =>
                withNotice(model, 'settings stays Restricted').notice,
            }),
            [],
          ]
        }
        return [
          evo(model, {
            apply: () => Applying(),
            notice: () => withoutNotice(model).notice,
          }),
          [ApplyVisibility({ host, visibility: Public() })],
        ]
      },
      ClickedRestricted: ({ host }) => {
        if (model.apply._tag === 'Applying') {
          return [model, []]
        }
        const maybeHost = findHost(model.hosts, host)
        const visibility =
          maybeHost._tag === 'Some' &&
          maybeHost.value.visibility._tag === 'Restricted'
            ? maybeHost.value.visibility
            : defaultRestricted()
        return [
          evo(model, {
            apply: () => Applying(),
            notice: () => withoutNotice(model).notice,
          }),
          [ApplyVisibility({ host, visibility })],
        ]
      },
      ClickedAddEmail: ({ host }) => [
        evo(model, {
          draft: () => Drafting.make({ host, text: '' }),
        }),
        [],
      ],
      TypedEmail: ({ text }) => {
        const draft = model.draft
        if (draft._tag !== 'Drafting') {
          return [model, []]
        }
        return [
          evo(model, {
            draft: () => Drafting.make({ host: draft.host, text }),
          }),
          [],
        ]
      },
      AppliedEmail: () => {
        if (model.draft._tag !== 'Drafting') {
          return [model, []]
        }
        const host = model.draft.host
        const email = model.draft.text.trim()
        if (!email.includes('@')) {
          return [model, []]
        }
        return [
          evo(model, {
            apply: () => Applying(),
            draft: () => DraftIdle(),
            notice: () => withoutNotice(model).notice,
          }),
          [
            ApplyVisibility({
              host,
              visibility: withEmails(restrictedEmails(model, host), email),
            }),
          ],
        ]
      },
      CancelledEmail: () => [
        evo(model, {
          draft: () => DraftIdle(),
        }),
        [],
      ],
      ClickedRemoveEmail: ({ host, email }) => {
        if (isSettingsHost(host) && email === ownerEmail) {
          return [withNotice(model, 'settings keeps the owner'), []]
        }
        return [
          evo(model, {
            apply: () => Applying(),
            notice: () => withoutNotice(model).notice,
          }),
          [
            ApplyVisibility({
              host,
              visibility: withoutEmail(
                restrictedEmails(model, host),
                host,
                email,
              ),
            }),
          ],
        ]
      },
      DismissedNotice: () => [withoutNotice(model), []],
      SucceededReadOrigin: ({ token, hosts }) => [
        evo(withSnapshot(model, snapshotOf(token, hosts)), {
          apply: () => ApplyIdle(),
        }),
        [],
      ],
      FailedReadOrigin: ({ reason }) => [
        evo(model, {
          apply: () =>
            ApplyFailed.make({
              reason: NonEmptyString.make(reason._tag),
            }),
          notice: () => withNotice(model, reason._tag).notice,
        }),
        [],
      ],
      SucceededApply: ({ token, hosts }) => [
        evo(withSnapshot(model, snapshotOf(token, hosts)), {
          apply: () => Applied(),
          draft: () => DraftIdle(),
        }),
        [],
      ],
      FailedApply: ({ reason }) => [
        evo(model, {
          apply: () =>
            ApplyFailed.make({
              reason: NonEmptyString.make(reason._tag),
            }),
          notice: () =>
            withNotice(
              model,
              reason._tag === 'Refused'
                ? 'settings stays Restricted'
                : reason._tag,
            ).notice,
        }),
        [],
      ],
    }),
  )
