import { Array, Match as M, Option } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  Account,
  GotShareMessage,
  type Message,
  type Model,
  type Section,
  Share,
  displayedSharedRangeOf,
  formatClock,
} from 'words-core-example'

import { ShowShareDialog } from '../mount.js'
import { type IconName, icon } from './icon.js'
import { readOnlySections } from './transcript.js'
import { badge, button, spinner } from './ui.js'

const shareMessage = (message: Share.Message.Message): Message =>
  GotShareMessage({ message })

const SECTION_PREVIEW_CHARACTERS = 48

const sectionOptionLabel = (section: Section): string => {
  const text =
    section.text.length > SECTION_PREVIEW_CHARACTERS
      ? `${section.text.slice(0, SECTION_PREVIEW_CHARACTERS).trimEnd()}…`
      : section.text
  return `${formatClock(section.startSeconds)}  ${text}`
}

const fieldLabel = (text: string, forID: string): Html => {
  const h = html<Message>()
  return h.label(
    [h.For(forID), h.Class('text-footnote font-semibold text-secondary')],
    [text],
  )
}

const sectionSelect = (
  id: string,
  sections: ReadonlyArray<Section>,
  selectedIndex: number,
  toMessage: (segmentIndex: number) => Message,
): Html => {
  const h = html<Message>()
  return h.select(
    [
      h.Id(id),
      h.OnChange(value => toMessage(Number(value))),
      h.Class(
        'min-h-11 w-full appearance-none rounded-xl border-0 bg-fill px-3 pr-9 text-subhead text-label outline-none focus-visible:ring-2 focus-visible:ring-tint',
      ),
    ],
    Array.map(sections, section =>
      h.option(
        [
          h.Key(section.id),
          h.Value(String(section.index)),
          h.Selected(section.index === selectedIndex),
        ],
        [sectionOptionLabel(section)],
      ),
    ),
  )
}

const visibilityOption = (
  visibility: Share.Model.ShareVisibility,
  current: Share.Model.ShareVisibility,
  label: string,
  shortLabel: string,
  iconName: IconName,
): Html => {
  const h = html<Message>()
  const isSelected = visibility === current
  return h.button(
    [
      h.Type('button'),
      h.Role('radio'),
      h.AriaChecked(isSelected),
      h.AriaLabel(label),
      h.OnClick(shareMessage(Share.chooseVisibility({ visibility }))),
      h.Class(
        `inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-subhead font-semibold transition ${isSelected ? 'bg-segment-selected text-label shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-secondary hover:text-label'}`,
      ),
    ],
    [
      icon(iconName, 'size-4'),
      h.span([h.Class('sm:hidden')], [shortLabel]),
      h.span([h.Class('max-sm:hidden')], [label]),
    ],
  )
}

const suggestions = (
  sheet: typeof Share.Model.ShareSheetOpen.Type,
  recipients: ReadonlyArray<Share.Model.ShareRecipient>,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Array.match(
    Share.Model.suggestedRecipientsOf(recipients, sheet.recipientsInput),
    {
      onEmpty: () => [],
      onNonEmpty: suggested => [
        h.div(
          [
            h.Class('flex flex-wrap gap-2 pt-1'),
            h.AriaLabel('People you shared with before'),
          ],
          Array.map(suggested, recipient =>
            h.button(
              [
                h.Key(recipient.id),
                h.Type('button'),
                h.OnClick(
                  shareMessage(
                    Share.pickRecipient({
                      email: recipient.email,
                    }),
                  ),
                ),
                h.Class(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full bg-tint-soft px-3.5 text-footnote font-medium text-label transition hover:brightness-95',
                ),
              ],
              [icon('Person', 'size-3.5 text-tint'), recipient.email],
            ),
          ),
        ),
      ],
    },
  )
}

const shareRow = (share: Share.Model.RecordingShare): Html => {
  const h = html<Message>()
  const link = Share.shareLinkOf(share)
  const title = Option.getOrElse(share.maybeRecipientEmail, () =>
    share.visibility === 'Link' ? 'Anyone with the link' : 'A recipient',
  )
  return h.li(
    [h.Key(share.id), h.Class('flex flex-wrap items-center gap-3 py-3')],
    [
      h.span(
        [
          h.Class(
            `inline-flex size-9 shrink-0 items-center justify-center rounded-full ${share.visibility === 'Link' ? 'bg-positive-soft text-positive' : 'bg-tint-soft text-tint'}`,
          ),
        ],
        [icon(share.visibility === 'Link' ? 'Globe' : 'Person', 'size-4')],
      ),
      h.span(
        [h.Class('flex min-w-[12rem] flex-1 flex-col')],
        [
          h.span(
            [h.Class('break-words text-subhead font-medium text-label')],
            [title],
          ),
          h.span(
            [h.Class('tabular text-footnote text-secondary')],
            [
              `${formatClock(share.startSeconds)} to ${formatClock(share.endSeconds)} · sections ${share.firstSegmentIndex + 1} to ${share.lastSegmentIndex + 1}`,
            ],
          ),
        ],
      ),
      h.span(
        [h.Class('ml-auto flex gap-1')],
        [
          button(
            'Copy Link',
            shareMessage(Share.copyShareLink({ link })),
            'Plain',
            Option.some('Link'),
          ),
          button(
            share.visibility === 'Link' ? 'Turn Off' : 'Stop Sharing',
            shareMessage(Share.revokeShare({ shareID: share.id })),
            'Destructive',
          ),
        ],
      ),
    ],
  )
}

const existingShares = (model: Model): Html => {
  const h = html<Message>()
  const isSharingReady = Account.Model.isSharingEnabled(model.account)
  return h.section(
    [h.Class('flex flex-col gap-1 border-t border-separator pt-4')],
    [
      h.h3(
        [h.Class('text-footnote font-semibold text-secondary')],
        ['Who Can Read It Now'],
      ),
      ...(isSharingReady
        ? M.value(model.share.shares).pipe(
            M.withReturnType<ReadonlyArray<Html>>(),
            M.tagsExhaustive({
              LoadingShares: () => [
                h.span(
                  [
                    h.Class(
                      'flex items-center gap-2 py-3 text-subhead text-secondary',
                    ),
                  ],
                  [spinner(), 'Loading shares'],
                ),
              ],
              FailedShares: ({ reason }) => [
                h.p(
                  [h.Class('py-3 text-subhead text-accent-strong')],
                  [reason],
                ),
              ],
              LoadedShares: ({ shares }) =>
                Array.match(shares, {
                  onEmpty: () => [
                    h.p(
                      [
                        h.Class(
                          'flex items-center gap-2 py-3 text-subhead text-secondary',
                        ),
                      ],
                      [
                        icon('Lock', 'size-4'),
                        'Private. Only your account can open this recording.',
                      ],
                    ),
                  ],
                  onNonEmpty: nonEmpty => [
                    h.ul(
                      [
                        h.Class(
                          'flex flex-col [&>li+li]:border-t [&>li+li]:border-separator',
                        ),
                      ],
                      Array.map(nonEmpty, shareRow),
                    ),
                  ],
                }),
            }),
          )
        : [
            h.p(
              [
                h.Class(
                  'flex items-center gap-2 py-3 text-subhead text-secondary',
                ),
              ],
              [
                icon('Lock', 'size-4'),
                'Private. Only your account can open this recording.',
              ],
            ),
          ]),
    ],
  )
}

const awaitingSchemaNotice = (): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role('note'),
      h.Class(
        'flex items-start gap-3 rounded-2xl bg-caution-soft px-4 py-3 text-subhead text-caution',
      ),
    ],
    [
      icon('Clock', 'mt-0.5 size-4'),
      h.span(
        [],
        [
          'Sharing is not on for this site yet. You can see what Share will do, but it cannot save until it is. Links to recordings still work for your own account.',
        ],
      ),
    ],
  )
}

const sheetBody = (
  model: Model,
  sheet: typeof Share.Model.ShareSheetOpen.Type,
  title: string,
  sections: ReadonlyArray<Section>,
): Html => {
  const h = html<Message>()
  const finals = Array.filter(sections, section => section.isFinal)
  const inRange = Array.filter(
    finals,
    section =>
      section.index >= sheet.rangeStartIndex &&
      section.index <= sheet.rangeEndIndex,
  )
  const rangeSummary = Option.match(
    Option.all([Array.head(inRange), Array.last(inRange)]),
    {
      onNone: () => 'No finished sections in this range yet.',
      onSome: ([first, last]) =>
        `${Array.length(inRange)} ${Array.length(inRange) === 1 ? 'section' : 'sections'} · ${formatClock(first.startSeconds)} to ${formatClock(last.endSeconds)}`,
    },
  )
  const isSaving = sheet.submission._tag === 'SavingShare'
  const isSharingReady = Account.Model.isSharingEnabled(model.account)
  const isAwaitingSchema = Option.exists(
    Account.Model.maybeSharingOf(model.account),
    sharing => sharing === 'AwaitingSchema',
  )
  return h.form(
    [
      h.OnSubmit(shareMessage(Share.submitShare())),
      h.Class('flex flex-col gap-5'),
    ],
    [
      h.div(
        [h.Class('flex items-start justify-between gap-3')],
        [
          h.div(
            [h.Class('flex min-w-0 flex-col gap-1')],
            [
              h.h2(
                [
                  h.Id('share-title'),
                  h.Class('text-title font-bold tracking-tight text-label'),
                ],
                ['Share'],
              ),
              h.p([h.Class('truncate text-subhead text-secondary')], [title]),
            ],
          ),
          h.button(
            [
              h.Type('button'),
              h.AriaLabel('Close'),
              h.Title('Close (Esc)'),
              h.OnClick(shareMessage(Share.closeShareSheet())),
              h.Class(
                'inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-fill text-secondary transition hover:bg-fill-strong hover:text-label',
              ),
            ],
            [icon('Close', 'size-4')],
          ),
        ],
      ),
      ...(isAwaitingSchema ? [awaitingSchemaNotice()] : []),
      h.div(
        [
          h.Role('radiogroup'),
          h.AriaLabel('Who can read it'),
          h.Class('flex gap-1 rounded-xl bg-fill p-1'),
        ],
        [
          visibilityOption(
            'People',
            sheet.visibility,
            'People',
            'People',
            'People',
          ),
          visibilityOption(
            'Link',
            sheet.visibility,
            'Anyone with the link',
            'Link',
            'Link',
          ),
        ],
      ),
      ...(sheet.visibility === 'People'
        ? [
            h.div(
              [h.Class('flex flex-col gap-1.5')],
              [
                fieldLabel('Emails', 'share-recipients'),
                h.input([
                  h.Id('share-recipients'),
                  h.Type('email'),
                  h.Multiple(true),
                  h.Autocomplete('email'),
                  h.Placeholder('name@example.com, another@example.com'),
                  h.Value(sheet.recipientsInput),
                  h.OnInput(value =>
                    shareMessage(Share.typeRecipients({ value })),
                  ),
                  h.Class(
                    'min-h-11 w-full rounded-xl border-0 bg-fill px-3 text-subhead text-label outline-none placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-tint',
                  ),
                ]),
                ...suggestions(sheet, model.share.recipients),
                h.p(
                  [h.Class('text-footnote text-secondary')],
                  [
                    'They read it after signing in to Scribe with that email, on the iPhone or here. Scribe does not send email, so send them the link.',
                  ],
                ),
              ],
            ),
          ]
        : [
            h.p(
              [
                h.Class(
                  'rounded-2xl bg-fill px-4 py-3 text-subhead text-secondary',
                ),
              ],
              [
                'Share creates a secret link to these sections and copies it. Anyone signed in to Scribe who has the link can read them. Turn it off here at any time.',
              ],
            ),
          ]),
      h.div(
        [h.Class('grid gap-3 sm:grid-cols-2')],
        [
          h.div(
            [h.Class('flex flex-col gap-1.5')],
            [
              fieldLabel('From', 'share-range-start'),
              sectionSelect(
                'share-range-start',
                finals,
                sheet.rangeStartIndex,
                segmentIndex =>
                  shareMessage(Share.moveRangeStart({ segmentIndex })),
              ),
            ],
          ),
          h.div(
            [h.Class('flex flex-col gap-1.5')],
            [
              fieldLabel('To', 'share-range-end'),
              sectionSelect(
                'share-range-end',
                finals,
                sheet.rangeEndIndex,
                segmentIndex =>
                  shareMessage(Share.moveRangeEnd({ segmentIndex })),
              ),
            ],
          ),
        ],
      ),
      h.p(
        [h.Class('tabular -mt-2 text-footnote text-secondary')],
        [rangeSummary],
      ),
      h.div(
        [h.Class('flex flex-col gap-1.5')],
        [
          fieldLabel('Note (optional)', 'share-note'),
          h.textarea(
            [
              h.Id('share-note'),
              h.Rows(2),
              h.Placeholder('A short message they see with the sections'),
              h.Value(sheet.note),
              h.OnInput(value => shareMessage(Share.typeNote({ value }))),
              h.Class(
                'w-full resize-none rounded-xl border-0 bg-fill px-3 py-2.5 text-subhead text-label outline-none placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-tint',
              ),
            ],
            [],
          ),
        ],
      ),
      ...M.value(sheet.submission).pipe(
        M.withReturnType<ReadonlyArray<Html>>(),
        M.tag('FailedShareSave', ({ reason }) => [
          h.p(
            [
              h.Role('alert'),
              h.Class('flex items-start gap-2 text-subhead text-accent-strong'),
            ],
            [icon('Alert', 'mt-0.5 size-4'), reason],
          ),
        ]),
        M.orElse(() => []),
      ),
      h.div(
        [h.Class('flex items-center justify-end gap-2')],
        [
          button('Cancel', shareMessage(Share.closeShareSheet()), 'Gray'),
          h.button(
            [
              h.Type('submit'),
              h.Disabled(
                isSaving || !isSharingReady || !Share.Model.isShareReady(sheet),
              ),
              h.Class(
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent-fill px-6 text-subhead font-semibold text-white transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40',
              ),
            ],
            [
              isSaving
                ? spinner('size-4 text-white')
                : icon('Share', 'size-[18px]'),
              sheet.visibility === 'Link' ? 'Create Link' : 'Share',
            ],
          ),
        ],
      ),
      existingShares(model),
    ],
  )
}

/**
 * The share sheet over the recording page, while it is open: a native modal
 * `<dialog>`, so focus stays inside, the page behind is inert, and Escape or
 * a tap outside closes it.
 */
export const shareSheet = (
  model: Model,
  title: string,
  sections: ReadonlyArray<Section>,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return M.value(model.share.sheet).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tag('ShareSheetOpen', sheet => [
      h.dialog(
        [
          h.AriaLabelledBy('share-title'),
          h.OnMount(ShowShareDialog()),
          h.Class('share-dialog'),
        ],
        [
          h.div(
            [
              h.AriaHidden(true),
              h.OnClick(shareMessage(Share.closeShareSheet())),
              h.Class('absolute inset-0'),
            ],
            [],
          ),
          h.div(
            [
              h.Class(
                'pointer-events-none relative flex min-h-full items-end justify-center sm:items-center sm:p-6',
              ),
            ],
            [
              h.div(
                [
                  h.Class(
                    'animate-rise pointer-events-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[30px] bg-raised p-5 shadow-2xl sm:rounded-[30px] sm:p-6',
                  ),
                ],
                [sheetBody(model, sheet, title, sections)],
              ),
            ],
          ),
        ],
      ),
    ]),
    M.orElse(() => []),
  )
}

const claimLine = (claim: Share.Model.ClaimState): ReadonlyArray<Html> => {
  const h = html<Message>()
  return M.value(claim).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tagsExhaustive({
      NoClaim: () => [],
      ClaimingShare: () => [
        h.span(
          [h.Class('flex items-center gap-2 text-footnote text-secondary')],
          [
            spinner('size-3.5'),
            'Adding it to Shared with You on all your devices',
          ],
        ),
      ],
      ClaimedShare: () => [
        h.span(
          [h.Class('flex items-center gap-2 text-footnote text-positive')],
          [icon('Check', 'size-4'), 'In Shared with You on all your devices'],
        ),
      ],
      FailedClaim: ({ reason }) => [
        h.span(
          [h.Class('text-footnote text-accent-strong')],
          [`Could not add it to Shared with You: ${reason}`],
        ),
      ],
    }),
  )
}

const sharedRangeNotice = (
  title: string,
  body: string,
  isLoading: boolean,
): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('card mt-4 flex items-start gap-3 rounded-[26px] p-6')],
    [
      isLoading
        ? spinner('mt-1 size-5')
        : icon('Lock', 'mt-0.5 size-5 text-secondary'),
      h.div(
        [h.Class('flex flex-col gap-1')],
        [
          h.h1(
            [h.Class('text-title font-semibold tracking-tight text-label')],
            [title],
          ),
          h.p([h.Class('text-subhead text-secondary')], [body]),
        ],
      ),
    ],
  )
}

const sharedAudioCard = (
  iconName: IconName,
  title: string,
  body: string,
  isLoading: boolean,
): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class('card mb-4 flex items-start gap-3 rounded-[22px] p-4'),
      h.AriaLive('polite'),
    ],
    [
      isLoading
        ? spinner('mt-0.5 size-5')
        : icon(iconName, 'mt-0.5 size-5 text-secondary'),
      h.div(
        [h.Class('flex flex-col gap-1')],
        [
          h.p([h.Class('text-headline font-semibold text-label')], [title]),
          h.p([h.Class('text-subhead text-secondary')], [body]),
        ],
      ),
    ],
  )
}

const readySharedAudio = (
  url: string,
  maybeDurationSeconds: Option.Option<number>,
): Html => {
  const h = html<Message>()
  const maybeLength = Option.map(maybeDurationSeconds, formatClock)
  return h.section(
    [h.Class('card mb-4 flex flex-col gap-3 rounded-[22px] p-4')],
    [
      h.div(
        [h.Class('flex items-center gap-2')],
        [
          icon('Waveform', 'size-5 text-secondary'),
          h.h2([h.Class('text-headline font-semibold text-label')], ['Audio']),
          ...Option.match(maybeLength, {
            onNone: () => [],
            onSome: length => [
              h.span(
                [h.Class('tabular ml-auto text-subhead text-secondary')],
                [length],
              ),
            ],
          }),
        ],
      ),
      h.audio(
        [
          h.Class('w-full'),
          h.Controls(true),
          h.Preload('metadata'),
          h.Src(url),
          h.AriaLabel(
            Option.match(maybeLength, {
              onNone: () => 'Shared audio',
              onSome: length => `Shared audio, ${length}`,
            }),
          ),
        ],
        [],
      ),
    ],
  )
}

const sharedAudio = (audio: Share.Model.SharedAudio): ReadonlyArray<Html> =>
  M.value(audio).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tagsExhaustive({
      NoSharedAudio: () => [],
      PreparingSharedAudio: () => [
        sharedAudioCard(
          'Waveform',
          'Audio is still uploading',
          'It plays here as soon as it arrives.',
          true,
        ),
      ],
      ReadySharedAudio: ({ url, maybeDurationSeconds }) => [
        readySharedAudio(url, maybeDurationSeconds),
      ],
      FailedSharedAudio: () => [
        sharedAudioCard(
          'Alert',
          'The audio could not be shared',
          'The shared lines are below.',
          false,
        ),
      ],
    }),
  )

const laterAudioNotice = (
  audio: Share.Model.SharedAudio,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return M.value(audio).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tag('NoSharedAudio', () => [
      h.p(
        [h.Class('px-2 pt-6 text-footnote text-secondary')],
        ['Audio for shared sections comes in a later update.'],
      ),
    ]),
    M.orElse(() => []),
  )
}

const viewerEmailOf = (model: Model): string =>
  M.value(model.identity).pipe(
    M.withReturnType<string>(),
    M.tag('SignedIn', ({ maybeEmail }) =>
      Option.getOrElse(maybeEmail, () => 'this account'),
    ),
    M.orElse(() => 'this account'),
  )

/** A share link's page: who shared which sections of which recording, its audio clip, and those sections. */
export const sharedRangePage = (model: Model): Html => {
  const h = html<Message>()
  return h.main(
    [h.Class('mx-auto flex w-full max-w-3xl flex-col px-4 pb-40 pt-4 sm:px-6')],
    [
      ...M.value(displayedSharedRangeOf(model)).pipe(
        M.withReturnType<ReadonlyArray<Html>>(),
        M.tagsExhaustive({
          NoSharedRange: () => [],
          OpeningSharedRange: () => [
            sharedRangeNotice(
              'Opening the shared sections',
              'Loading them from Scribe.',
              true,
            ),
          ],
          MissingSharedRange: () => [
            sharedRangeNotice(
              'This share is not available',
              `It does not exist, was turned off, or is not shared with ${viewerEmailOf(model)}. Ask the person who shared it to share it with this account.`,
              false,
            ),
          ],
          FailedSharedRange: ({ reason }) => [
            sharedRangeNotice('The share could not load', reason, false),
          ],
          ReadySharedRange: ({ range, claim }) => [
            h.header(
              [h.Class('flex flex-col gap-2 pb-4 pt-2')],
              [
                h.div([h.Class('flex')], [badge('Shared', 'Shared with You')]),
                h.h1(
                  [
                    h.Class(
                      'text-title font-bold tracking-tight text-label sm:text-large-title',
                    ),
                  ],
                  [range.recordingTitle],
                ),
                h.p(
                  [h.Class('tabular text-subhead text-secondary')],
                  [
                    `${Option.getOrElse(range.share.maybeSharedBy, () => 'Someone')} shared ${formatClock(range.share.startSeconds)} to ${formatClock(range.share.endSeconds)}, ${Array.length(range.sections)} ${Array.length(range.sections) === 1 ? 'section' : 'sections'}`,
                  ],
                ),
                ...Option.match(range.share.maybeNote, {
                  onNone: () => [],
                  onSome: note => [
                    h.blockquote(
                      [
                        h.Class(
                          'rounded-2xl bg-fill px-4 py-3 text-subhead text-label',
                        ),
                      ],
                      [note],
                    ),
                  ],
                }),
                ...claimLine(claim),
              ],
            ),
            ...sharedAudio(range.audio),
            readOnlySections(range.sections, section =>
              Option.getOrUndefined(
                Option.map(
                  section.maybeSpeakerID,
                  speakerID => `Speaker ${speakerID}`,
                ),
              ),
            ),
            ...laterAudioNotice(range.audio),
          ],
        }),
      ),
    ],
  )
}
