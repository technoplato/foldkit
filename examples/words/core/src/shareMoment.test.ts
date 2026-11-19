import { Array, Option, pipe } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'

import { urlToScribeRoute } from './link.js'
import { ChangedUrl, GotShareMessage, type Message } from './message.js'
import type { Model } from './model.js'
import type { Section } from './recording.js'
import * as Share from './share/index.js'
import { modelForRoute, update } from './update.js'

// A shared moment (#1465): one share of a chapter, or of any disjoint set of lines, is one link, and each of its moments has a
// deep link of its own: the same link with `m`, the line. Michael, typed in Scribe 2026-10-31 00:31:22: "those should be
// shareable just like a disjoint list of segments should be".
const recordingID = '7e0f1b2c-3d4e-4f50-8a6b-7c8d9e0f1a2b'
const shareID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a'
const link = `https://words.pisspoursoftware.xyz/recording/${recordingID}/share/${shareID}?k=secret`

const line = (id: string, index: number): Section => ({
  id,
  index,
  startSeconds: index * 10,
  endSeconds: index * 10 + 8,
  maybeSpeakerID: Option.none(),
  text: `Line ${index}`,
  words: [],
  isFinal: true,
  maybeWordsSeal: Option.none(),
})

const range = (lines: ReadonlyArray<Section>): Share.Model.SharedRange => ({
  share: {
    id: shareID,
    recordingID,
    visibility: 'Link',
    maybeRecipientEmail: Option.none(),
    maybeLinkToken: Option.some('secret'),
    firstSegmentIndex: 0,
    lastSegmentIndex: 5,
    startSeconds: 0,
    endSeconds: 58,
    maybeNote: Option.none(),
    maybeSharedBy: Option.none(),
    createdAtMs: 1,
  },
  maybeTitle: Option.some('Recording 332'),
  maybeNote: Option.some('Chapter title'),
  scrub: Share.Model.PassedScrub(),
  lines,
  images: [],
  isClaimedByViewer: false,
  audience: Share.Model.LinkAudience(),
  audio: Share.Model.NoSharedAudio(),
})

const arrived = (lines: ReadonlyArray<Section>): Message =>
  GotShareMessage({
    message: Share.reportSharedRange({
      shareID,
      maybeRange: Option.some(range(lines)),
    }),
  })

const urlOf = (href: string) => Option.getOrThrow(fromString(href))

const scrolls = (model: Model, message: Message) => {
  const [next, commands] = update(model, message)
  return {
    next,
    sections: pipe(
      commands,
      Array.filter(command => command.name === 'ScrollToSection'),
      Array.map(command => (command.args as { sectionID: string }).sectionID),
    ),
  }
}

describe("a shared moment's own link", () => {
  it('opens the share at that line once its lines arrive, once', () => {
    const start = modelForRoute(urlToScribeRoute(urlOf(`${link}&m=line-5`)))
    const first = scrolls(start, arrived([line('line-1', 1), line('line-5', 5)]))
    expect(first.sections).toEqual(['line-5'])
    const again = scrolls(first.next, arrived([line('line-1', 1), line('line-5', 5)]))
    expect(again.sections).toEqual([])
  })

  it('waits for the line when it has not been scrubbed yet', () => {
    const start = modelForRoute(urlToScribeRoute(urlOf(`${link}&m=line-5`)))
    const first = scrolls(start, arrived([line('line-1', 1)]))
    expect(first.sections).toEqual([])
    expect(scrolls(first.next, arrived([line('line-1', 1), line('line-5', 5)])).sections).toEqual(['line-5'])
  })

  it('moves within the open share when a moment is followed, keeping the page', () => {
    const start = modelForRoute(urlToScribeRoute(urlOf(link)))
    const opened = scrolls(start, arrived([line('line-1', 1), line('line-5', 5)]))
    expect(opened.sections).toEqual([])
    const moved = scrolls(opened.next, ChangedUrl({ url: urlOf(`${link}&m=line-5`) }))
    expect(moved.sections).toEqual(['line-5'])
    expect(moved.next.share.sharedRange._tag).toBe('ReadySharedRange')
  })

  it('a share link without a moment scrolls nowhere', () => {
    const start = modelForRoute(urlToScribeRoute(urlOf(link)))
    expect(scrolls(start, arrived([line('line-1', 1)])).sections).toEqual([])
  })
})
