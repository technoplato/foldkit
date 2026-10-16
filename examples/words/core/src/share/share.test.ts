import { Array, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import type { Section } from '../recording.js'
import {
  decodeReceivedShares,
  decodeShareRecipients,
  decodeSharedRange,
  decodeShares,
} from './decode.js'
import {
  ClickedRevokeShare,
  ClickedShareRecording,
  ClickedSuggestedRecipient,
  ConfirmedMissingSharedRange,
  type Message,
  ObservedReceivedShares,
  ObservedSharedRange,
  OpenedSharedRange,
  SubmittedShareForm,
  SucceededClaimShare,
  SucceededCreateShares,
  UpdatedShareRecipients,
} from './message.js'
import {
  FailedSharedAudio,
  type Model,
  NoSharedAudio,
  PassedScrub,
  PendingScrub,
  PreparingSharedAudio,
  ReadySharedAudio,
  type ShareRecipient,
  type SharedAudio,
  type SharedRange,
  WithheldScrub,
  init,
  recipientEmailsOf,
  sharedItemsOf,
  suggestedRecipientsOf,
} from './model.js'
import { type ShareContext, update } from './update.js'

const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'

const section = (index: number, isFinal = true): Section => ({
  id: `section-${index}`,
  index,
  startSeconds: index * 2.5,
  endSeconds: index * 2.5 + 2,
  maybeSpeakerID: Option.some(0),
  text: `Section ${index}`,
  words: [],
  isFinal,
})

const context = (overrides: Partial<ShareContext> = {}): ShareContext => ({
  sharing: 'Enabled',
  maybeOwnerUserID: Option.some('owner-1'),
  maybeSharedBy: Option.some('owner@example.com'),
  sections: [section(0), section(1), section(2), section(3, false)],
  maybeViewer: Option.some({
    userID: 'owner-1',
    maybeEmail: Option.some('owner@example.com'),
  }),
  maybeLinkToken: Option.none(),
  ...overrides,
})

const run = (
  model: Model,
  messages: ReadonlyArray<Message>,
  shareContext: ShareContext = context(),
) =>
  Array.reduce(
    messages,
    {
      model,
      commandNames: Array.empty<string>(),
      outMessages: Array.empty<string>(),
    },
    (state, message) => {
      const [next, commands, maybeOutMessage] = update(
        state.model,
        message,
        shareContext,
      )
      return {
        model: next,
        commandNames: [
          ...state.commandNames,
          ...commands.map(command => command.name),
        ],
        outMessages: [
          ...state.outMessages,
          ...Option.toArray(
            Option.map(
              maybeOutMessage,
              out => `${out._tag} ${'text' in out ? out.text : ''}`,
            ),
          ),
        ],
      }
    },
  )

const opened = () =>
  run(init(), [
    ClickedShareRecording({
      recordingID,
      rangeStartIndex: 0,
      rangeEndIndex: 2,
    }),
  ]).model

describe('the share sheet', () => {
  it('shares with the people typed, one row each, with the range of finished sections', () => {
    const shared = run(opened(), [
      UpdatedShareRecipients({ value: 'Anna@Example.com, bob@example.com' }),
      SubmittedShareForm(),
    ])
    expect(shared.commandNames).toEqual(['CreateShares'])
    expect(shared.model.sheet._tag).toBe('ShareSheetOpen')
  })

  it('does not save while production waits for the sharing schema, and says why', () => {
    const waiting = run(
      opened(),
      [
        UpdatedShareRecipients({ value: 'anna@example.com' }),
        SubmittedShareForm(),
      ],
      context({ sharing: 'AwaitingSchema' }),
    )
    expect(waiting.commandNames).toEqual([])
    const submission =
      waiting.model.sheet._tag === 'ShareSheetOpen'
        ? waiting.model.sheet.submission
        : undefined
    expect(submission?._tag).toBe('FailedShareSave')
  })

  it('asks for an email before sharing with people', () => {
    const empty = run(opened(), [SubmittedShareForm()])
    expect(empty.commandNames).toEqual([])
  })

  it('reports people shares with a notice and copies a new link share', () => {
    const people = run(opened(), [
      SucceededCreateShares({ shareCount: 2, maybeLink: Option.none() }),
    ])
    expect(people.outMessages).toEqual([
      'RequestedShareNotice Shared with 2 people',
    ])
    const link = run(opened(), [
      SucceededCreateShares({
        shareCount: 1,
        maybeLink: Option.some(
          'https://words.knophy.com/recording/r/share/s?k=abc',
        ),
      }),
    ])
    expect(link.outMessages).toEqual([
      'RequestedShareCopy https://words.knophy.com/recording/r/share/s?k=abc',
    ])
  })

  it('fills a suggested recipient in place of what was being typed', () => {
    const picked = run(opened(), [
      UpdatedShareRecipients({ value: 'bob@example.com, an' }),
      ClickedSuggestedRecipient({ email: 'anna@example.com' }),
    ])
    expect(
      picked.model.sheet._tag === 'ShareSheetOpen'
        ? picked.model.sheet.recipientsInput
        : '',
    ).toBe('bob@example.com, anna@example.com, ')
  })

  it('revokes a share', () => {
    expect(
      run(opened(), [ClickedRevokeShare({ shareID: 'share-1' })]).commandNames,
    ).toEqual(['RevokeShare'])
  })
})

describe('recipients', () => {
  const recipient = (
    email: string,
    lastSharedAtMs: number,
  ): ShareRecipient => ({
    id: email,
    email,
    maybeDisplayName: Option.none(),
    lastSharedAtMs,
    shareCount: 1,
    createdAtMs: lastSharedAtMs,
  })

  it('reads typed emails lowercased, without repeats or invalid entries', () => {
    expect(
      recipientEmailsOf(' Anna@Example.com; anna@example.com, bob@x.io nope'),
    ).toEqual(['anna@example.com', 'bob@x.io'])
  })

  it('suggests people shared with before by prefix, skipping ones already typed', () => {
    const recipients = [
      recipient('anna@example.com', 3),
      recipient('andy@example.com', 2),
    ]
    expect(
      Array.map(
        suggestedRecipientsOf(recipients, 'anna@example.com, an'),
        r => r.email,
      ),
    ).toEqual(['andy@example.com'])
  })
})

describe('opening a share link', () => {
  const range = (isClaimedByViewer: boolean): SharedRange => ({
    share: {
      id: 'share-1',
      recordingID,
      visibility: 'People',
      maybeRecipientEmail: Option.some('reader@example.com'),
      maybeLinkToken: Option.none(),
      firstSegmentIndex: 0,
      lastSegmentIndex: 1,
      startSeconds: 0,
      endSeconds: 4.5,
      maybeNote: Option.none(),
      maybeSharedBy: Option.some('owner@example.com'),
      createdAtMs: 1,
    },
    maybeTitle: Option.some('Recording 019'),
    maybeNote: Option.none(),
    scrub: PassedScrub(),
    lines: [section(0), section(1)],
    images: [],
    isClaimedByViewer,
    audio: NoSharedAudio(),
  })
  const reader = context({
    maybeViewer: Option.some({
      userID: 'reader-1',
      maybeEmail: Option.some('Reader@example.com'),
    }),
  })

  it('claims a share addressed to the viewer so it shows on all their devices', () => {
    const claimed = run(
      init(),
      [
        OpenedSharedRange({ shareID: 'share-1' }),
        ObservedSharedRange({
          shareID: 'share-1',
          maybeRange: Option.some(range(false)),
        }),
      ],
      reader,
    )
    expect(claimed.commandNames).toEqual(['ClaimShare'])
    expect(
      run(claimed.model, [SucceededClaimShare()], reader).model.sharedRange
        ._tag,
    ).toBe('ReadySharedRange')
  })

  it('does not claim twice, and never claims before production has the schema', () => {
    expect(
      run(
        init(),
        [
          ObservedSharedRange({
            shareID: 'share-1',
            maybeRange: Option.some(range(true)),
          }),
        ],
        reader,
      ).commandNames,
    ).toEqual([])
    expect(
      run(
        init(),
        [
          ObservedSharedRange({
            shareID: 'share-1',
            maybeRange: Option.some(range(false)),
          }),
        ],
        { ...reader, sharing: 'AwaitingSchema' },
      ).commandNames,
    ).toEqual([])
  })

  it('checks an empty answer with the server before saying a share is not available', () => {
    const empty = run(
      init(),
      [
        OpenedSharedRange({ shareID: 'share-1' }),
        ObservedSharedRange({ shareID: 'share-1', maybeRange: Option.none() }),
      ],
      reader,
    )
    expect(empty.commandNames).toEqual(['ConfirmSharedRange'])
    expect(empty.model.sharedRange._tag).toBe('OpeningSharedRange')
    expect(
      run(
        empty.model,
        [
          ConfirmedMissingSharedRange({
            shareID: 'share-1',
            maybeViewerUserID: Option.some('reader-1'),
          }),
        ],
        reader,
      ).model.sharedRange._tag,
    ).toBe('MissingSharedRange')
  })

  it('ignores an answer that was asked for before the viewer signed in', () => {
    const answered = run(
      init(),
      [
        OpenedSharedRange({ shareID: 'share-1' }),
        ConfirmedMissingSharedRange({
          shareID: 'share-1',
          maybeViewerUserID: Option.none(),
        }),
        ObservedSharedRange({
          shareID: 'share-1',
          maybeRange: Option.some(range(true)),
        }),
      ],
      reader,
    )
    expect(answered.model.sharedRange._tag).toBe('ReadySharedRange')
  })

  it('turns a share that was open into not available as soon as it is revoked', () => {
    const revoked = run(
      init(),
      [
        OpenedSharedRange({ shareID: 'share-1' }),
        ObservedSharedRange({
          shareID: 'share-1',
          maybeRange: Option.some(range(true)),
        }),
        ObservedSharedRange({ shareID: 'share-1', maybeRange: Option.none() }),
      ],
      reader,
    )
    expect(revoked.commandNames).toEqual([])
    expect(revoked.model.sharedRange._tag).toBe('MissingSharedRange')
  })

  it('shows a missing share as not available', () => {
    expect(
      run(init(), [
        ObservedSharedRange({ shareID: 'share-1', maybeRange: Option.none() }),
      ]).model.sharedRange._tag,
    ).toBe('MissingSharedRange')
  })
})

describe('share rows', () => {
  it('reads share rows, including rows written before the new fields existed', () => {
    const shares = decodeShares([
      {
        id: 'new',
        recordingID,
        firstSegmentIndex: 1,
        lastSegmentIndex: 3,
        startSeconds: 2.5,
        endSeconds: 9.5,
        visibility: 'link',
        linkToken: 'a'.repeat(64),
        createdAtMs: 20,
      },
      {
        id: 'old',
        recordingID,
        firstSegmentIndex: 0,
        lastSegmentIndex: 0,
        createdAtMs: 10,
      },
    ])
    expect(
      Array.map(shares, share => [
        share.id,
        share.visibility,
        share.startSeconds,
      ]),
    ).toEqual([
      ['new', 'Link', 2.5],
      ['old', 'People', 0],
    ])
  })

  it('reads the shares others made to this account, newest first, and not its own', () => {
    const received = decodeReceivedShares(
      [
        {
          id: 'older',
          ownerUserID: 'owner-1',
          recordingID,
          firstSegmentIndex: 0,
          lastSegmentIndex: 1,
          visibility: 'people',
          recipientEmail: 'reader@example.com',
          sharedByDisplayName: 'owner@example.com',
          createdAtMs: 10,
        },
        {
          id: 'mine',
          ownerUserID: 'reader-1',
          recordingID: 'reader-recording',
          firstSegmentIndex: 0,
          lastSegmentIndex: 0,
          createdAtMs: 30,
        },
        {
          id: 'newer',
          ownerUserID: 'owner-2',
          recordingID,
          firstSegmentIndex: 2,
          lastSegmentIndex: 4,
          visibility: 'link',
          linkToken: 'b'.repeat(64),
          createdAtMs: 20,
        },
      ],
      'reader-1',
    )
    expect(Array.map(received, share => share.id)).toEqual(['newer', 'older'])
    expect(Option.getOrThrow(Array.last(received)).maybeSharedBy).toEqual(
      Option.some('owner@example.com'),
    )
  })

  it('keeps the shares made to this account', () => {
    const [model] = update(
      init(),
      ObservedReceivedShares({
        shares: decodeReceivedShares(
          [
            {
              id: 'share-1',
              ownerUserID: 'owner-1',
              recordingID,
              firstSegmentIndex: 0,
              lastSegmentIndex: 1,
              createdAtMs: 1,
            },
          ],
          'reader-1',
        ),
      }),
      context(),
    )
    expect(Array.map(model.received, share => share.id)).toEqual(['share-1'])
  })

  it('reads recipients newest first', () => {
    const recipients = decodeShareRecipients([
      {
        id: '1',
        email: 'a@x.io',
        lastSharedAtMs: 1,
        shareCount: 1,
        createdAtMs: 1,
      },
      {
        id: '2',
        email: 'b@x.io',
        lastSharedAtMs: 5,
        shareCount: 2,
        createdAtMs: 1,
      },
    ])
    expect(Array.map(recipients, recipient => recipient.email)).toEqual([
      'b@x.io',
      'a@x.io',
    ])
  })
})

describe("a share's scrubbed copy", () => {
  const scrubbedLine = (
    index: number,
    status: string,
    text = `Scrubbed line ${index}`,
  ) => ({
    id: `line-${index}`,
    ownerUserID: 'owner-1',
    shareID: 'share-1',
    recordingID,
    segmentID: `s${index}`,
    segmentIndex: index,
    startSeconds: index * 5,
    endSeconds: index * 5 + 4,
    status,
    text,
    wordsJSON: JSON.stringify([
      { text: text.split(' ')[0], start: index * 5, end: index * 5 + 0.5 },
    ]),
    redactions: 0,
    checkedAtMs: 10,
  })
  const scrubbedImage = (
    attachmentID: string,
    offsetSeconds: number,
    status: string,
  ) => ({
    id: `image-${attachmentID}`,
    attachmentID,
    offsetSeconds,
    status,
    width: 640,
    height: 480,
    faces: 1,
    textBoxes: 0,
    checkedAtMs: 10,
    file: {
      id: `file-${attachmentID}`,
      path: `scribe/${recordingID}/share-scrubbed/share-1/${attachmentID}.jpg`,
      url: `https://instant-storage.example.com/${attachmentID}.jpg`,
    },
  })
  const shareRow = (fields: Readonly<Record<string, unknown>>) => ({
    id: 'share-1',
    recordingID,
    firstSegmentIndex: 1,
    lastSegmentIndex: 4,
    startSeconds: 5,
    endSeconds: 24,
    createdAtMs: 1,
    visibility: 'people',
    recipientEmail: 'reader@example.com',
    readers: [{ id: 'reader-1' }],
    ...fields,
  })
  const decodeOne = (fields: Readonly<Record<string, unknown>>) =>
    decodeSharedRange([shareRow(fields)], Option.some('reader-1'))

  it('reads a passed share as its scrubbed title, note, passed lines in order, and passed images', () => {
    const maybeRange = decodeOne({
      scrubStatus: 'passed',
      scrubbedTitle: 'Recording 019',
      scrubbedNote: 'For [a person]',
      scrubbedLines: [
        scrubbedLine(4, 'passed'),
        scrubbedLine(1, 'passed', 'Hello [a person]'),
        scrubbedLine(3, 'pending'),
      ],
      scrubbedImages: [
        scrubbedImage('a1', 7, 'passed'),
        scrubbedImage('a2', 9, 'withheld'),
      ],
    })
    expect(
      Option.map(maybeRange, range => ({
        title: range.maybeTitle,
        note: range.maybeNote,
        scrub: range.scrub,
        lines: Array.map(range.lines, line => [
          line.index,
          line.text,
          line.startSeconds,
        ]),
        firstWord: Option.map(Array.head(range.lines), line =>
          Array.map(line.words, word => word.text),
        ),
        images: Array.map(range.images, image => [
          image.attachmentID,
          image.offsetSeconds,
          image.url,
        ]),
        isClaimedByViewer: range.isClaimedByViewer,
      })),
    ).toEqual(
      Option.some({
        title: Option.some('Recording 019'),
        note: Option.some('For [a person]'),
        scrub: PassedScrub(),
        lines: [
          [1, 'Hello [a person]', 5],
          [4, 'Scrubbed line 4', 20],
        ],
        firstWord: Option.some(['Hello']),
        images: [['a1', 7, 'https://instant-storage.example.com/a1.jpg']],
        isClaimedByViewer: true,
      }),
    )
  })

  it('never reads the original sections, the recording, or the owner note', () => {
    const maybeRange = decodeOne({
      scrubStatus: 'passed',
      note: 'the owner note',
      recording: [{ title: 'Original title', startedAtMs: 5 }],
      segments: [
        {
          id: 's1',
          segmentIndex: 1,
          startTimeSeconds: 5,
          endTimeSeconds: 9,
          text: 'Original words',
          isFinal: true,
        },
      ],
    })
    expect(
      Option.map(maybeRange, range => [
        range.maybeTitle,
        range.maybeNote,
        Array.length(range.lines),
      ]),
    ).toEqual(Option.some([Option.none(), Option.none(), 0]))
  })

  it('reads a share not checked yet as pending, with the lines passed so far', () => {
    expect(
      Option.map(
        decodeOne({
          scrubStatus: 'pending',
          scrubbedLines: [
            scrubbedLine(1, 'passed'),
            scrubbedLine(2, 'pending'),
          ],
        }),
        range => [range.scrub, Array.map(range.lines, line => line.index)],
      ),
    ).toEqual(Option.some([PendingScrub(), [1]]))
    expect(Option.map(decodeOne({}), range => range.scrub)).toEqual(
      Option.some(PendingScrub()),
    )
  })

  it('keeps a pending share to its passed lines: no title, note, or audio until the share passed', () => {
    expect(
      Option.map(
        decodeOne({
          scrubStatus: 'pending',
          scrubbedTitle: 'Recording 019',
          scrubbedNote: 'For [a person]',
          audioClipStatus: 'ready',
          audioClip: {
            id: 'f',
            url: 'https://instant-storage.example.com/c.m4a',
          },
          scrubbedLines: [scrubbedLine(1, 'passed')],
        }),
        range => [
          range.maybeTitle,
          range.maybeNote,
          range.audio,
          Array.map(range.lines, line => line.index),
        ],
      ),
    ).toEqual(Option.some([Option.none(), Option.none(), NoSharedAudio(), [1]]))
  })

  it('reads a withheld share as withheld with its reason, and keeps nothing of it', () => {
    expect(
      Option.map(
        decodeOne({
          scrubStatus: 'withheld',
          scrubReason: 'The checker could not run',
          scrubbedTitle: 'Recording 019',
          scrubbedLines: [scrubbedLine(1, 'passed')],
          scrubbedImages: [scrubbedImage('a1', 7, 'passed')],
          audioClipStatus: 'ready',
          audioClip: {
            id: 'f',
            url: 'https://instant-storage.example.com/c.m4a',
          },
        }),
        range => [
          range.scrub,
          range.maybeTitle,
          Array.length(range.lines),
          Array.length(range.images),
          range.audio,
        ],
      ),
    ).toEqual(
      Option.some([
        WithheldScrub({
          maybeReason: Option.some('The checker could not run'),
        }),
        Option.none(),
        0,
        0,
        NoSharedAudio(),
      ]),
    )
  })

  it('places each image after the lines that start before it', () => {
    const maybeRange = decodeOne({
      scrubStatus: 'passed',
      scrubbedLines: [
        scrubbedLine(1, 'passed'),
        scrubbedLine(2, 'passed'),
        scrubbedLine(3, 'passed'),
      ],
      scrubbedImages: [
        scrubbedImage('late', 30, 'passed'),
        scrubbedImage('early', 2, 'passed'),
        scrubbedImage('middle', 11, 'passed'),
      ],
    })
    expect(
      Option.map(maybeRange, range =>
        Array.map(sharedItemsOf(range), item =>
          item._tag === 'SharedLineItem'
            ? `line ${item.line.index}`
            : `image ${item.image.attachmentID}`,
        ),
      ),
    ).toEqual(
      Option.some([
        'image early',
        'line 1',
        'line 2',
        'image middle',
        'line 3',
        'image late',
      ]),
    )
  })
})

describe("a share's audio clip", () => {
  const clipURL =
    'https://instant-storage.example.com/scribe/rec-1/share-clips/share-1.m4a'
  const sharedRangeRow = (fields: Readonly<Record<string, unknown>>) => ({
    id: 'share-1',
    recordingID,
    firstSegmentIndex: 0,
    lastSegmentIndex: 0,
    createdAtMs: 1,
    visibility: 'link',
    linkToken: 'a'.repeat(64),
    scrubStatus: 'passed',
    ...fields,
  })
  const audioOf = (
    fields: Readonly<Record<string, unknown>>,
  ): Option.Option<SharedAudio> =>
    Option.map(
      decodeSharedRange([sharedRangeRow(fields)], Option.none()),
      range => range.audio,
    )

  it('reads a ready clip as its file and length', () => {
    expect(
      audioOf({
        audioClipStatus: 'ready',
        audioClipDurationSeconds: 12.5,
        audioClip: {
          id: 'file-1',
          path: 'scribe/rec-1/share-clips/share-1.m4a',
          url: clipURL,
        },
      }),
    ).toEqual(
      Option.some(
        ReadySharedAudio({
          url: clipURL,
          maybeDurationSeconds: Option.some(12.5),
        }),
      ),
    )
  })

  it('reads a ready clip whose file comes back as a one-row list, without a length', () => {
    expect(
      audioOf({
        audioClipStatus: 'ready',
        audioClip: [{ id: 'file-1', url: clipURL }],
      }),
    ).toEqual(
      Option.some(
        ReadySharedAudio({ url: clipURL, maybeDurationSeconds: Option.none() }),
      ),
    )
  })

  it('reads a clip still uploading, and a ready status whose file has not arrived, as preparing', () => {
    expect(audioOf({ audioClipStatus: 'preparing' })).toEqual(
      Option.some(PreparingSharedAudio()),
    )
    expect(audioOf({ audioClipStatus: 'ready' })).toEqual(
      Option.some(PreparingSharedAudio()),
    )
  })

  it('reads a failed clip as failed', () => {
    expect(audioOf({ audioClipStatus: 'failed' })).toEqual(
      Option.some(FailedSharedAudio()),
    )
  })

  it('reads a share without audio, or with a status it does not know, as no audio', () => {
    expect(audioOf({})).toEqual(Option.some(NoSharedAudio()))
    expect(audioOf({ audioClipStatus: 'none' })).toEqual(
      Option.some(NoSharedAudio()),
    )
    expect(audioOf({ audioClipStatus: null })).toEqual(
      Option.some(NoSharedAudio()),
    )
    expect(audioOf({ audioClipStatus: 'trimming' })).toEqual(
      Option.some(NoSharedAudio()),
    )
  })

  it('shows the clip the moment the observed share turns ready', () => {
    const rangeWith = (audio: SharedAudio): SharedRange => ({
      share: {
        id: 'share-1',
        recordingID,
        visibility: 'Link',
        maybeRecipientEmail: Option.none(),
        maybeLinkToken: Option.some('a'.repeat(64)),
        firstSegmentIndex: 0,
        lastSegmentIndex: 0,
        startSeconds: 0,
        endSeconds: 2,
        maybeNote: Option.none(),
        maybeSharedBy: Option.some('owner@example.com'),
        createdAtMs: 1,
      },
      maybeTitle: Option.some('Recording 237'),
      maybeNote: Option.none(),
      scrub: PassedScrub(),
      lines: [section(0)],
      images: [],
      isClaimedByViewer: false,
      audio,
    })
    const ready = ReadySharedAudio({
      url: clipURL,
      maybeDurationSeconds: Option.some(12.5),
    })
    const { model } = run(init(), [
      OpenedSharedRange({ shareID: 'share-1' }),
      ObservedSharedRange({
        shareID: 'share-1',
        maybeRange: Option.some(rangeWith(PreparingSharedAudio())),
      }),
      ObservedSharedRange({
        shareID: 'share-1',
        maybeRange: Option.some(rangeWith(ready)),
      }),
    ])
    expect(
      model.sharedRange._tag === 'ReadySharedRange'
        ? model.sharedRange.range.audio
        : NoSharedAudio(),
    ).toEqual(ready)
  })
})
