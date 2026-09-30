import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  type AccessIdentity,
  Account,
  Capture,
  GotAccountMessage,
  type Message,
  type Model,
} from 'words-core-example'

import { connectCard } from './connect.js'
import { type IconName, icon } from './icon.js'
import { largeTitle } from './shell.js'
import {
  type BadgeTone,
  avatar,
  badge,
  button,
  group,
  groupFootnote,
  groupRow,
  groupTitle,
  rowIcon,
  spinner,
} from './ui.js'

const accountMessage = (message: Account.Message.Message): Message =>
  GotAccountMessage({ message })

const expiryLabel = (access: AccessIdentity): string =>
  M.value(access.source).pipe(
    M.withReturnType<string>(),
    M.when(
      'Loopback',
      () => 'Local preview on this Mac, without Cloudflare Access',
    ),
    M.when('CloudflareAccess', () =>
      Option.match(access.maybeExpiresAtMs, {
        onNone: () => 'Active',
        onSome: expiresAtMs =>
          `Active until ${new Date(expiresAtMs).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}`,
      }),
    ),
    M.exhaustive,
  )

type Status = Readonly<{ tone: BadgeTone; text: string; detail: string }>

const statusOf = (model: Model): Status =>
  M.value(model.account.connection).pipe(
    M.withReturnType<Status>(),
    M.tagsExhaustive({
      CheckingAccount: () => ({
        tone: 'Neutral',
        text: 'Checking',
        detail: 'Asking words.knophy.com who Cloudflare Access says you are.',
      }),
      ConnectingAccount: () => ({
        tone: 'Neutral',
        text: 'Signing in',
        detail: 'Signing this browser in to your Scribe account.',
      }),
      ConnectedAccount: () => ({
        tone: 'Positive',
        text: 'Connected',
        detail:
          'This browser and your iPhone use the same Scribe account, so recordings from either appear on both, live.',
      }),
      AwaitingIPhone: () => ({
        tone: 'Caution',
        text: 'Waiting for your iPhone',
        detail:
          'Scribe has no account for this email yet. Sign in on your iPhone first; this page follows within seconds.',
      }),
      FailedConnect: ({ reason }) => ({
        tone: 'Caution',
        text: 'Could not sign in',
        detail: `${reason} Trying again every few seconds.`,
      }),
      SignedOutAccount: () => ({
        tone: 'Neutral',
        text: 'Signed out',
        detail: 'You signed out of Scribe in this browser.',
      }),
      NoAccessIdentity: () => ({
        tone: 'Neutral',
        text: 'Not signed in',
        detail:
          'No Cloudflare Access login reached words.knophy.com. Open https://words.knophy.com to sign in with Google.',
      }),
      FailedAccountCheck: ({ reason }) => ({
        tone: 'Caution',
        text: 'Cannot reach Scribe',
        detail: `${reason} Trying again every few seconds.`,
      }),
    }),
  )

const heroOf = (model: Model): Html => {
  const h = html<Message>()
  const status = statusOf(model)
  const maybeAccess = Account.Model.accessOf(model.account)
  return h.div(
    [h.Class('card flex items-center gap-4 rounded-[26px] p-5 sm:p-6')],
    [
      Option.match(maybeAccess, {
        onNone: () =>
          h.span(
            [
              h.Class(
                'inline-flex size-16 items-center justify-center rounded-full bg-fill text-secondary',
              ),
            ],
            [icon('Person', 'size-8')],
          ),
        onSome: access => avatar(access.email, 'size-16 text-title'),
      }),
      h.div(
        [h.Class('flex min-w-0 flex-1 flex-col gap-1.5')],
        [
          h.span(
            [
              h.Class(
                'truncate text-title font-semibold tracking-tight text-label',
              ),
            ],
            [
              Option.match(maybeAccess, {
                onNone: () => 'No account',
                onSome: access => access.email,
              }),
            ],
          ),
          h.div(
            [h.Class('flex flex-wrap items-center gap-2')],
            [badge(status.tone, status.text)],
          ),
          h.p([h.Class('text-footnote text-secondary')], [status.detail]),
        ],
      ),
    ],
  )
}

const accessGroup = (access: AccessIdentity): ReadonlyArray<Html> => [
  groupTitle('Cloudflare Access'),
  group([
    groupRow(
      'Signed in as',
      [access.email],
      Option.some(rowIcon('Shield', 'bg-[#ff9500]')),
    ),
    groupRow(
      'Sign-in method',
      [
        access.source === 'CloudflareAccess'
          ? 'Google, through Cloudflare Access for every knophy.com site'
          : 'The loopback preview email on this Mac',
      ],
      Option.some(rowIcon('Globe', 'bg-[#007aff]')),
    ),
    groupRow(
      'Session',
      [expiryLabel(access)],
      Option.some(rowIcon('Clock', 'bg-[#8e8e93]')),
    ),
  ]),
  groupFootnote([
    'words.knophy.com uses the Google login in front of every knophy.com site, and signs you in to Scribe with that email. There is no second password.',
  ]),
]

const accountKindOf = (model: Model): string =>
  M.value(model.identity).pipe(
    M.withReturnType<string>(),
    M.tag('SignedIn', ({ isGuest, maybeEmail }) =>
      isGuest
        ? 'Guest account'
        : Option.match(maybeEmail, {
            onNone: () => 'Account',
            onSome: email => `Email account, ${email}`,
          }),
    ),
    M.orElse(() => 'Not signed in to Scribe in this browser'),
  )

const userIDRow = (model: Model): ReadonlyArray<Html> => {
  const h = html<Message>()
  return M.value(model.identity).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tag('SignedIn', ({ userID }) => [
      h.details(
        [h.Class('group')],
        [
          h.summary(
            [
              h.Class(
                'flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2.5',
              ),
            ],
            [
              rowIcon('Sparkle', 'bg-[#5856d6]'),
              h.span([h.Class('flex-1 text-subhead text-label')], ['Details']),
              icon(
                'ChevronDown',
                'size-4 text-tertiary transition group-open:rotate-180',
              ),
            ],
          ),
          h.div(
            [h.Class('flex flex-col gap-3 px-4 pb-4 pl-[60px]')],
            [
              h.div(
                [h.Class('flex flex-col gap-1')],
                [
                  h.span(
                    [h.Class('text-footnote font-medium text-secondary')],
                    ['Instant user ID'],
                  ),
                  h.div(
                    [h.Class('flex flex-wrap items-center gap-2')],
                    [
                      h.code(
                        [
                          h.Class(
                            'select-all break-all rounded-lg bg-fill px-2 py-1 font-mono text-footnote text-label',
                          ),
                        ],
                        [userID],
                      ),
                      button(
                        'Copy',
                        accountMessage(Account.copyUserID({ userID })),
                        'Plain',
                        Option.some('Copy'),
                      ),
                    ],
                  ),
                ],
              ),
              h.p(
                [h.Class('text-footnote text-secondary')],
                [
                  'The id of your account in Scribe’s Instant app. Your iPhone shows the same account under Settings, Account & Device.',
                ],
              ),
            ],
          ),
        ],
      ),
    ]),
    M.orElse(() => []),
  )
}

const scribeGroup = (model: Model): ReadonlyArray<Html> => [
  groupTitle('Scribe Account'),
  group([
    groupRow(
      'Account',
      [accountKindOf(model)],
      Option.some(rowIcon('Phone', 'bg-[#1c1c1e] dark:bg-[#48484a]')),
    ),
    ...userIDRow(model),
  ]),
  groupFootnote([
    'The web and your iPhone use one account in Scribe’s Instant app. Record on either, and the other shows it as it happens.',
  ]),
]

type ShortcutRow = Readonly<{ keys: string; action: string }>

const shortcutRows: ReadonlyArray<ShortcutRow> = [
  { keys: 'Space', action: 'Play or pause the recording you are reading' },
  { keys: '← →', action: 'Back or forward 15 seconds' },
  { keys: 'R', action: 'New Recording, on the recording list' },
  { keys: 'P', action: 'Pause or resume the recording in progress' },
  { keys: 'L', action: 'Back to Playhead, or Back to Live while recording' },
  { keys: 'Esc', action: 'Close a menu or the share sheet' },
]

const shortcutsGroup = (): ReadonlyArray<Html> => {
  const h = html<Message>()
  return [
    groupTitle('Keyboard Shortcuts'),
    group(
      Array.map(shortcutRows, ({ keys, action }) =>
        h.div(
          [h.Key(keys), h.Class('flex min-h-12 items-center gap-3 px-4 py-2')],
          [
            h.kbd(
              [
                h.Class(
                  'tabular inline-flex min-h-7 min-w-12 shrink-0 items-center justify-center rounded-lg bg-fill px-2 font-mono text-footnote font-semibold text-label',
                ),
              ],
              [keys],
            ),
            h.span([h.Class('text-subhead text-label')], [action]),
          ],
        ),
      ),
    ),
    groupFootnote([
      'Shortcuts work anywhere on the page except while typing in a field.',
    ]),
  ]
}

type SharingStatus = Readonly<{
  detail: string
  iconName: IconName
  colorClass: string
}>

const sharingStatusOf = (model: Model): SharingStatus =>
  Option.match(Account.Model.maybeSharingOf(model.account), {
    onNone: () => ({
      detail: 'Checking with words.knophy.com.',
      iconName: 'Clock',
      colorClass: 'bg-[#8e8e93]',
    }),
    onSome: sharing =>
      M.value(sharing).pipe(
        M.withReturnType<SharingStatus>(),
        M.when('Enabled', () => ({
          detail: 'Ready.',
          iconName: 'Check',
          colorClass: 'bg-[#34c759]',
        })),
        M.when('AwaitingSchema', () => ({
          detail:
            'Built and waiting for one approval: Scribe’s database needs the sharing fields (ADR 0014). Until then Share shows what it will do but cannot save.',
          iconName: 'Clock',
          colorClass: 'bg-[#ff9500]',
        })),
        M.exhaustive,
      ),
  })

const sharingGroup = (model: Model): ReadonlyArray<Html> => {
  const status = sharingStatusOf(model)
  return [
    groupTitle('Sharing'),
    group([
      groupRow(
        'Private by default',
        ['Only your account can open your recordings.'],
        Option.some(rowIcon('Lock', 'bg-[#8e8e93]')),
      ),
      groupRow(
        'Share with people',
        [
          'Open a recording, choose Share, pick the sections, and type their email. They read it after signing in to Scribe with that email. Emails you used before are suggested as you type.',
        ],
        Option.some(rowIcon('People', 'bg-[#007aff]')),
      ),
      groupRow(
        'Anyone with the link',
        [
          'Share creates a secret link to the sections you picked. Anyone signed in to Scribe who has it can read them. On words.knophy.com, links still sit behind the Google login.',
        ],
        Option.some(rowIcon('Link', 'bg-[#34c759]')),
      ),
      groupRow(
        'Sharing on this site',
        [status.detail],
        Option.some(rowIcon(status.iconName, status.colorClass)),
      ),
    ]),
  ]
}

const signOutNoteOf = (model: Model): string => {
  const isEndingGoogleLogin =
    model.account.connection._tag === 'ConnectedAccount' &&
    Option.exists(
      Account.Model.accessOf(model.account),
      access => access.source === 'CloudflareAccess',
    )
  if (Capture.Model.isHoldingUnsavedAudio(model.capture)) {
    return 'Stop the recording in progress and let it save first. Signing out now would lose its audio.'
  } else if (isEndingGoogleLogin) {
    return 'Signs out of Scribe in this browser and ends the Google login for knophy.com, so the next visit asks Google again.'
  } else {
    return 'Signs out of Scribe in this browser.'
  }
}

const actionsOf = (model: Model): ReadonlyArray<Html> => {
  const h = html<Message>()
  return M.value(model.account.connection).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tag('SignedOutAccount', () => [
      h.div(
        [h.Class('flex flex-col items-start gap-2 pt-8')],
        [
          button(
            'Sign In Again',
            accountMessage(Account.signInAgain()),
            'Prominent',
            Option.some('Person'),
          ),
        ],
      ),
    ]),
    M.tag('CheckingAccount', 'NoAccessIdentity', () => []),
    M.orElse(() => [
      h.div(
        [h.Class('flex flex-col items-start gap-2 pt-8')],
        [
          button(
            'Sign Out',
            accountMessage(Account.signOut()),
            'Destructive',
            Option.some('SignOut'),
            Capture.Model.isHoldingUnsavedAudio(model.capture),
          ),
          h.p(
            [h.Class('text-footnote text-secondary')],
            [signOutNoteOf(model)],
          ),
        ],
      ),
    ]),
  )
}

/**
 * Settings: who Cloudflare Access says you are, your Scribe account, how
 * sharing works, the keyboard shortcuts, and sign out.
 */
export const accountPage = (model: Model): Html => {
  const h = html<Message>()
  const maybeAccess = Account.Model.accessOf(model.account)
  return h.main(
    [h.Class('mx-auto flex w-full max-w-2xl flex-col px-4 pb-40 pt-4 sm:px-6')],
    [
      h.div([h.Class('pb-5 pt-2')], [largeTitle('Settings')]),
      heroOf(model),
      ...M.value(model.account.connection).pipe(
        M.withReturnType<ReadonlyArray<Html>>(),
        M.tag('AwaitingIPhone', ({ access }) => [
          h.div([h.Class('pt-6')], [connectCard(access)]),
        ]),
        M.tag('CheckingAccount', 'ConnectingAccount', () => [
          h.div(
            [
              h.Class(
                'flex items-center gap-2 px-1 pt-5 text-subhead text-secondary',
              ),
            ],
            [spinner(), 'Signing in to Scribe'],
          ),
        ]),
        M.orElse(() => []),
      ),
      ...Option.match(maybeAccess, {
        onNone: () => [],
        onSome: accessGroup,
      }),
      ...scribeGroup(model),
      ...sharingGroup(model),
      ...shortcutsGroup(),
      ...actionsOf(model),
    ],
  )
}
