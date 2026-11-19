import { Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  Account,
  AccountRoute,
  type Message,
  type Model,
  QuestionsRoute,
  RecordingListRoute,
  type ScribeAppScheme,
  isListRoute,
  scribeRouteToPath,
} from 'words-core-example'

import { icon } from './icon.js'
import { avatar, spinner } from './ui.js'

const listPath = scribeRouteToPath(RecordingListRoute())
const accountPath = scribeRouteToPath(AccountRoute())
const questionsPath = scribeRouteToPath(QuestionsRoute({ q: Option.none() }))

/** Host settings the views read. */
export type ViewConfig = Readonly<{
  appScheme: ScribeAppScheme
  canShareLinks: boolean
}>

const brand = (visibilityClass = ''): Html => {
  const h = html<Message>()
  return h.a(
    [
      h.Href(listPath),
      h.AriaLabel('Scribe recordings'),
      h.Class(
        `flex min-h-11 shrink-0 items-center gap-2.5 rounded-full pr-2 ${visibilityClass}`,
      ),
    ],
    [
      h.span(
        [
          h.Class(
            'inline-flex size-8 items-center justify-center rounded-[10px] bg-accent-fill text-white',
          ),
        ],
        [icon('Waveform', 'size-[18px]')],
      ),
      h.span(
        [h.Class('text-body font-semibold tracking-tight text-label')],
        ['Scribe'],
      ),
    ],
  )
}

const backButton = (visibilityClass = ''): Html => {
  const h = html<Message>()
  return h.a(
    [
      h.Href(listPath),
      h.Class(
        `-ml-1 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-full pl-1 pr-3 text-body text-tint transition hover:bg-tint-soft ${visibilityClass}`,
      ),
    ],
    [icon('ChevronLeft', 'size-6'), 'Recordings'],
  )
}

const statusDot = (colorClass: string): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.Class(
        `absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[var(--canvas)] ${colorClass}`,
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
  phoneLabel: ReadonlyArray<Html> = [],
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return [
    leading,
    ...phoneLabel,
    h.span(
      [h.Class('hidden min-w-0 flex-col text-left sm:flex')],
      [
        h.span(
          [h.Class('max-w-56 truncate text-footnote font-semibold text-label')],
          [title],
        ),
        h.span([h.Class(`text-footnote ${subtitleClass}`)], [subtitle]),
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

/**
 * The chip while the browser is offline: the account's avatar with a caution
 * dot and the word Offline, on a phone too (where the chip shows no other
 * text), so the state stays in the top bar after the offline notice scrolls
 * away.
 */
const offlineChipContent = (model: Model): ReadonlyArray<Html> => {
  const h = html<Message>()
  const phoneLabel = [
    h.span(
      [h.Class('text-footnote font-semibold text-caution sm:hidden')],
      ['Offline'],
    ),
  ]
  return Option.match(Account.Model.accessOf(model.account), {
    onNone: () =>
      chipContent(
        plainLeading(icon('Offline', 'size-[18px] text-caution')),
        'Offline',
        'Syncs when the network is back',
        'text-secondary',
        phoneLabel,
      ),
    onSome: access =>
      chipContent(
        avatarWithStatus(access.email, 'bg-caution'),
        access.email,
        'Offline',
        'font-medium text-caution',
        phoneLabel,
      ),
  })
}

const accountChipContent = (model: Model): ReadonlyArray<Html> =>
  model.connectivity === 'Offline'
    ? offlineChipContent(model)
    : onlineChipContent(model)

const onlineChipContent = (model: Model): ReadonlyArray<Html> =>
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
          'text-accent-strong',
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
          plainLeading(icon('Alert', 'size-[18px] text-accent-strong')),
          'Cannot reach Scribe',
          'Trying again',
          'text-accent-strong',
        ),
    }),
  )

const accountChipLabel = (model: Model): string => {
  const offline = model.connectivity === 'Offline' ? ', offline' : ''
  return Option.match(Account.Model.accessOf(model.account), {
    onNone: () => `Settings${offline}`,
    onSome: access => `Settings${offline}, signed in as ${access.email}`,
  })
}

/**
 * The open recording's title in the top bar: always on a phone, like an iOS
 * inline title, and from 640 px once the page's large title scrolls under
 * the bar. With large text on a narrow screen (`.bar-title` in styles.css)
 * the bar has no room for it, so the page shows its own title, wrapping.
 */
const barTitleOf = (model: Model): ReadonlyArray<Html> => {
  const h = html<Message>()
  return M.value(model.playback).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tag('ReadyPlayback', ready => [
      h.span(
        [
          h.AriaHidden(true),
          h.Class(
            'bar-title min-w-0 flex-1 truncate text-center text-body font-semibold text-label sm:hidden',
          ),
        ],
        [ready.detail.summary.title],
      ),
      h.span(
        [
          h.AriaHidden(true),
          h.Class(
            'bar-title folded-title min-w-0 flex-1 truncate text-center text-body font-semibold text-label max-sm:hidden',
          ),
        ],
        [ready.detail.summary.title],
      ),
    ]),
    M.orElse(() => []),
  )
}

const leadingOf = (
  isOnList: boolean,
  isSplit: boolean,
): ReadonlyArray<Html> => {
  if (isOnList) {
    return [brand()]
  } else if (isSplit) {
    return [backButton('lg:hidden'), brand('hidden lg:flex')]
  } else {
    return [backButton()]
  }
}

/**
 * The top bar: Scribe on the list, or the way back to it elsewhere (Scribe
 * again from 1024 px, where the list is the sidebar); the open recording's
 * title once the page title scrolls under the bar; and who is signed in with
 * what state, linking to the account page. It lines up with the page's
 * column, or spans the sidebar and the page when they split.
 */
export const topBar = (model: Model, isSplit: boolean): Html => {
  const h = html<Message>()
  const isOnAccount = model.route._tag === 'Account'
  const isOnQuestions = model.route._tag === 'Questions'
  const isOnList = isListRoute(model.route)
  return h.header(
    [h.Class('bar sticky top-0 z-30')],
    [
      h.div(
        [
          h.Class(
            `mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4 sm:px-6 ${isSplit ? 'lg:max-w-none lg:px-5' : ''}`,
          ),
        ],
        [
          ...leadingOf(isOnList, isSplit),
          ...barTitleOf(model),
          h.a(
            [
              h.Href(questionsPath),
              h.AriaLabel('Questions'),
              h.Title('Questions'),
              h.AriaCurrent(isOnQuestions ? 'page' : 'false'),
              h.Class(
                `ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-full text-label transition hover:bg-fill ${isOnQuestions ? 'bg-fill' : ''}`,
              ),
            ],
            [icon('Question', 'size-[22px]')],
          ),
          h.a(
            [
              h.Href(accountPath),
              h.AriaLabel(accountChipLabel(model)),
              h.AriaCurrent(isOnAccount ? 'page' : 'false'),
              h.Class(
                `flex min-h-11 min-w-11 shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 transition hover:bg-fill sm:pr-3.5 ${model.connectivity === 'Offline' ? 'pr-3' : 'pr-1'} ${isOnAccount ? 'bg-fill' : ''}`,
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
export const toast = (model: Model, isSplit: boolean): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.AriaLive('polite'),
      h.Class(
        `pointer-events-none fixed inset-x-0 bottom-36 z-50 flex justify-center px-4 ${isSplit ? 'lg:left-[21rem] xl:left-[24rem] min-[100rem]:left-[35rem]' : ''}`,
      ),
    ],
    Option.match(model.maybeCopyNotice, {
      onNone: () => [],
      onSome: notice => [
        h.span(
          [
            h.Key(`notice-${notice.revision}`),
            h.Class(
              `animate-rise inline-flex max-w-md items-center gap-2 rounded-full px-4 py-2.5 text-subhead font-medium shadow-lg ${notice.isFailure ? 'bg-accent-fill text-white' : 'bg-label text-canvas'}`,
            ),
          ],
          [icon(notice.isFailure ? 'Alert' : 'Check', 'size-4'), notice.text],
        ),
      ],
    }),
  )
}

/** A large title, like an iOS navigation title. */
export const largeTitle = (text: string): Html => {
  const h = html<Message>()
  return h.h1(
    [
      h.Class(
        'text-large-title font-bold tracking-tight text-label sm:text-display',
      ),
    ],
    [text],
  )
}
