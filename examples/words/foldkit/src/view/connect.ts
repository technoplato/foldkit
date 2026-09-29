import { Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  type AccessIdentity,
  Account,
  AccountRoute,
  GotAccountMessage,
  type Message,
  scribeRouteToShareUrl,
} from 'words-core-example'

import { icon } from './icon.js'
import { qrCode } from './qr.js'
import { button, spinner } from './ui.js'

const accountLink = scribeRouteToShareUrl(AccountRoute())

const step = (number: number, title: string, detail: string): Html => {
  const h = html<Message>()
  return h.li(
    [h.Class('flex gap-3')],
    [
      h.span(
        [
          h.AriaHidden(true),
          h.Class(
            'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-tint text-[13px] font-semibold text-white',
          ),
        ],
        [String(number)],
      ),
      h.div(
        [h.Class('flex flex-col gap-0.5')],
        [
          h.span([h.Class('text-[15px] font-semibold text-label')], [title]),
          h.span([h.Class('text-[14px] leading-5 text-secondary')], [detail]),
        ],
      ),
    ],
  )
}

/**
 * The next step when Cloudflare Access knows the listener but Scribe has no
 * account for that email yet: a QR code that opens Scribe's Account screen on
 * the iPhone, the steps to sign in there, and a live check that signs this
 * page in on its own as soon as the account exists.
 */
export const connectCard = (access: AccessIdentity): Html => {
  const h = html<Message>()
  return h.section(
    [
      h.AriaLabelledBy('connect-title'),
      h.Class(
        'card animate-rise overflow-hidden rounded-[28px] ring-1 ring-caution/25',
      ),
    ],
    [
      h.div(
        [
          h.Class(
            'flex items-center gap-2 bg-caution-soft px-5 py-3 text-[13px] font-semibold text-caution sm:px-7',
          ),
        ],
        [icon('Phone', 'size-4'), 'One step left: sign in on your iPhone'],
      ),
      h.div(
        [h.Class('flex flex-col gap-6 p-5 sm:flex-row sm:gap-8 sm:p-7')],
        [
          h.div(
            [h.Class('flex shrink-0 flex-col items-center gap-2 sm:w-48')],
            [
              h.div(
                [
                  h.Class(
                    'size-44 rounded-[20px] bg-white p-2 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_8px_24px_rgb(0_0_0/0.08)] sm:size-48',
                  ),
                ],
                [
                  qrCode(
                    accountLink,
                    'QR code that opens the Account screen in Scribe on your iPhone',
                  ),
                ],
              ),
              h.span(
                [h.Class('text-[12px] text-secondary')],
                ['Scan with the iPhone Camera'],
              ),
            ],
          ),
          h.div(
            [h.Class('flex min-w-0 flex-1 flex-col gap-5')],
            [
              h.div(
                [h.Class('flex flex-col gap-1.5')],
                [
                  h.h2(
                    [
                      h.Id('connect-title'),
                      h.Class(
                        'text-[22px] font-bold tracking-tight text-label',
                      ),
                    ],
                    ['Connect Scribe on your iPhone'],
                  ),
                  h.p(
                    [h.Class('text-[15px] leading-6 text-secondary')],
                    [
                      'Cloudflare Access signed you in as ',
                      h.strong(
                        [h.Class('font-semibold text-label')],
                        [access.email],
                      ),
                      '. Scribe does not have that account yet, so this page cannot show your recordings until your iPhone signs in with it.',
                    ],
                  ),
                ],
              ),
              h.ol(
                [h.Class('flex flex-col gap-3.5')],
                [
                  step(
                    1,
                    'Scan the code',
                    'Scribe opens its Account screen. Without a camera: in Scribe, open Settings, then Account & Device, then Manage account.',
                  ),
                  step(
                    2,
                    'Sign in with Google',
                    `Choose ${access.email}. Your iPhone’s guest account becomes this account, recordings and all.`,
                  ),
                  step(
                    3,
                    'Come back here',
                    'This page signs in by itself within a few seconds.',
                  ),
                ],
              ),
              h.div(
                [h.Class('flex flex-col gap-3')],
                [
                  h.span(
                    [
                      h.Role('status'),
                      h.Class(
                        'inline-flex items-center gap-2 text-[13px] text-secondary',
                      ),
                    ],
                    [
                      spinner('size-3.5 text-secondary'),
                      'Waiting for your iPhone. This page checks every 5 seconds.',
                    ],
                  ),
                  h.div(
                    [h.Class('flex flex-wrap gap-2')],
                    [
                      button(
                        'Check now',
                        GotAccountMessage({
                          message: Account.checkAccountNow(),
                        }),
                        'Tinted',
                        Option.some('Refresh'),
                      ),
                      button(
                        'Copy link',
                        GotAccountMessage({
                          message: Account.copyAccountLink(),
                        }),
                        'Gray',
                        Option.some('Link'),
                      ),
                    ],
                  ),
                ],
              ),
              h.details(
                [h.Class('group rounded-2xl bg-fill px-4 py-3 text-[14px]')],
                [
                  h.summary(
                    [
                      h.Class(
                        'flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-label',
                      ),
                    ],
                    [
                      'Why the iPhone first?',
                      icon(
                        'ChevronDown',
                        'size-4 text-secondary transition group-open:rotate-180',
                      ),
                    ],
                  ),
                  h.p(
                    [h.Class('pt-2 leading-6 text-secondary')],
                    [
                      'Your iPhone records as a guest account. Signing in there turns that guest into your email account, so every recording stays yours. If the web created the email account first, the iPhone would join it as a linked guest and its older recordings would lose sharing and some uploads (ADR 0012).',
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}
