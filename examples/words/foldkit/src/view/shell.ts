import { Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  Account,
  AccountRoute,
  type Message,
  type Model,
  RecordingListRoute,
  type ScribeAppScheme,
  scribeRouteToPath,
} from 'words-core-example'

import { icon } from './icon.js'
import { avatar, spinner } from './ui.js'

const listPath = scribeRouteToPath(RecordingListRoute())
const accountPath = scribeRouteToPath(AccountRoute())

/** Host settings the views read. */
export type ViewConfig = Readonly<{
  appScheme: ScribeAppScheme
}>

const brand = (): Html => {
  const h = html<Message>()
  return h.a(
    [
      h.Href(listPath),
      h.AriaLabel('Scribe recordings'),
      h.Class('flex min-h-11 items-center gap-2.5 rounded-full pr-2'),
    ],
    [
      h.span(
        [
          h.Class(
            'inline-flex size-8 items-center justify-center rounded-[10px] bg-gradient-to-b from-[#ff5a4f] to-[#e8261c] text-white shadow-[0_2px_6px_rgb(255_59_48/0.35)]',
          ),
        ],
        [icon('Waveform', 'size-[18px]')],
      ),
      h.span(
        [h.Class('text-[17px] font-semibold tracking-tight text-label')],
        ['Scribe'],
      ),
    ],
  )
}

const statusDot = (colorClass: string): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.Class(
        `absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[var(--surface)] ${colorClass}`,
      ),
    ],
    [],
  )
}

const chipContent = (
  leading: Html,
  title: string,
  subtitle: string,
  subtitleClass: string,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return [
    leading,
    h.span(
      [h.Class('hidden min-w-0 flex-col text-left leading-tight sm:flex')],
      [
        h.span(
          [h.Class('max-w-56 truncate text-[13px] font-semibold text-label')],
          [title],
        ),
        h.span([h.Class(`text-[12px] ${subtitleClass}`)], [subtitle]),
      ],
    ),
  ]
}

const avatarWithStatus = (email: string, dotClass: string): Html => {
  const h = html<Message>()
  return h.span(
    [h.Class('relative inline-flex')],
    [avatar(email), statusDot(dotClass)],
  )
}

const plainLeading = (child: Html): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.Class(
        'inline-flex size-8 items-center justify-center rounded-full bg-fill text-secondary',
      ),
    ],
    [child],
  )
}

const accountChipContent = (model: Model): ReadonlyArray<Html> =>
  M.value(model.account.connection).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tagsExhaustive({
      CheckingAccount: () =>
        chipContent(
          plainLeading(spinner()),
          'Signing in',
          'Asking Cloudflare Access',
          'text-secondary',
        ),
      ConnectingAccount: ({ access }) =>
        chipContent(
          avatarWithStatus(access.email, 'bg-tertiary'),
          access.email,
          'Signing in to Scribe',
          'text-secondary',
        ),
      ConnectedAccount: ({ access }) =>
        chipContent(
          avatarWithStatus(access.email, 'bg-positive'),
          access.email,
          'Signed in',
          'text-secondary',
        ),
      AwaitingIPhone: ({ access }) =>
        chipContent(
          avatarWithStatus(access.email, 'bg-caution'),
          access.email,
          'Connect your iPhone',
          'font-medium text-caution',
        ),
      FailedConnect: ({ access }) =>
        chipContent(
          avatarWithStatus(access.email, 'bg-accent'),
          access.email,
          'Could not sign in',
          'text-accent',
        ),
      SignedOutAccount: ({ access }) =>
        chipContent(
          avatarWithStatus(access.email, 'bg-tertiary'),
          access.email,
          'Signed out',
          'text-secondary',
        ),
      NoAccessIdentity: () =>
        chipContent(
          plainLeading(icon('Person', 'size-[18px]')),
          'Not signed in',
          'No Cloudflare Access login',
          'text-secondary',
        ),
      FailedAccountCheck: () =>
        chipContent(
          plainLeading(icon('Alert', 'size-[18px] text-accent')),
          'Cannot reach Scribe',
          'Trying again',
          'text-accent',
        ),
    }),
  )

const accountChipLabel = (model: Model): string =>
  Option.match(Account.Model.accessOf(model.account), {
    onNone: () => 'Account',
    onSome: access => `Account: ${access.email}`,
  })

/** The top bar: Scribe, and who is signed in with what state, linking to the account page. */
export const topBar = (model: Model): Html => {
  const h = html<Message>()
  const isOnAccount = model.route._tag === 'Account'
  return h.header(
    [h.Class('glass sticky top-0 z-30 border-b border-separator/50')],
    [
      h.div(
        [
          h.Class(
            'mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-3 sm:px-5',
          ),
        ],
        [
          brand(),
          h.a(
            [
              h.Href(accountPath),
              h.AriaLabel(accountChipLabel(model)),
              h.AriaCurrent(isOnAccount ? 'page' : 'false'),
              h.Class(
                `flex min-h-11 min-w-11 items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition hover:bg-fill sm:pr-3.5 ${isOnAccount ? 'bg-fill' : ''}`,
              ),
            ],
            accountChipContent(model),
          ),
        ],
      ),
    ],
  )
}

/** The notice after a copy or a save, announced to screen readers. */
export const toast = (model: Model): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.AriaLive('polite'),
      h.Class(
        'pointer-events-none fixed inset-x-0 bottom-32 z-50 flex justify-center px-4',
      ),
    ],
    Option.match(model.maybeCopyNotice, {
      onNone: () => [],
      onSome: notice => [
        h.span(
          [
            h.Key(`notice-${notice.revision}`),
            h.Class(
              `animate-rise inline-flex max-w-md items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-medium shadow-lg ${notice.isFailure ? 'bg-accent text-white' : 'bg-[#1d1d1f] text-white dark:bg-[#f5f5f7] dark:text-[#1d1d1f]'}`,
            ),
          ],
          [icon(notice.isFailure ? 'Alert' : 'Check', 'size-4'), notice.text],
        ),
      ],
    }),
  )
}

/** The link back to the recording list at the top of a page. */
export const backToRecordings = (): Html => {
  const h = html<Message>()
  return h.a(
    [
      h.Href(listPath),
      h.Class(
        '-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full pl-1 pr-3 text-[17px] text-tint transition hover:bg-tint-soft',
      ),
    ],
    [icon('ChevronLeft', 'size-5'), 'Recordings'],
  )
}

/** A large title, like an iOS navigation title. */
export const largeTitle = (text: string): Html => {
  const h = html<Message>()
  return h.h1(
    [
      h.Class(
        'text-[30px] font-bold leading-[1.15] tracking-tight text-label sm:text-[34px]',
      ),
    ],
    [text],
  )
}
