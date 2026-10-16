import { Option } from 'effect'
import { Scene } from 'foldkit'
import { evo } from 'foldkit/struct'
import { fromString } from 'foldkit/url'
import { describe, test } from 'vitest'
import {
  type Model,
  type Section,
  Share,
  modelForRoute,
  update,
  urlToScribeRoute,
} from 'words-core-example'

import { sharedRangePage } from './share.js'

const recordingID = '7bc520fe-5059-43c9-9481-0da0f35fda2a'
const shareID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a'
const linkToken = 'a'.repeat(64)
const clipURL =
  'https://instant-storage.example.com/scribe/7bc520fe/share-clips/share.m4a'
const imageURL =
  'https://instant-storage.example.com/scribe/7bc520fe/share-scrubbed/share/a1.jpg'
const laterUpdateNotice = 'Audio for shared sections comes in a later update.'
const firstLine = 'The include audio on share is not allowing me to open it.'
const secondLine = 'It says comes with the new sharing rules.'

const scrubbedLine = (index: number, text: string): Section => ({
  id: `line-${index}`,
  index,
  startSeconds: index * 5,
  endSeconds: index * 5 + 4,
  maybeSpeakerID: Option.none(),
  text,
  words: [],
  isFinal: true,
})

const passedRange = (): Share.Model.SharedRange => ({
  share: {
    id: shareID,
    recordingID,
    visibility: 'Link',
    maybeRecipientEmail: Option.none(),
    maybeLinkToken: Option.some(linkToken),
    firstSegmentIndex: 0,
    lastSegmentIndex: 1,
    startSeconds: 0,
    endSeconds: 9,
    maybeNote: Option.none(),
    maybeSharedBy: Option.none(),
    createdAtMs: 1,
  },
  maybeTitle: Option.some('Recording 237'),
  maybeNote: Option.some('Listen to [a person] here'),
  scrub: Share.Model.PassedScrub(),
  lines: [scrubbedLine(0, firstLine), scrubbedLine(1, secondLine)],
  images: [
    {
      id: 'image-a1',
      attachmentID: 'a1',
      offsetSeconds: 2,
      url: imageURL,
      maybeWidth: Option.some(640),
      maybeHeight: Option.some(480),
    },
  ],
  isClaimedByViewer: false,
  audio: Share.Model.NoSharedAudio(),
})

const sharedPageModel = (range: Share.Model.SharedRange): Model => {
  const start = modelForRoute(
    urlToScribeRoute(
      Option.getOrThrow(
        fromString(
          `https://words.pisspoursoftware.xyz/recording/${recordingID}/share/${shareID}?k=${linkToken}`,
        ),
      ),
    ),
  )
  return evo(start, {
    share: share =>
      evo(share, {
        sharedRange: () =>
          Share.Model.ReadySharedRange({
            shareID,
            claim: Share.Model.NoClaim(),
            range,
          }),
      }),
  })
}

const withAudio = (audio: Share.Model.SharedAudio): Model =>
  sharedPageModel({ ...passedRange(), audio })

describe('the share page reads only the scrubbed copy', () => {
  test('shows a passed share: its scrubbed title, note, lines, and images', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(sharedPageModel(passedRange())),
      Scene.expect(Scene.role('heading', { name: 'Recording 237' })).toExist(),
      Scene.expect(Scene.text('Listen to [a person] here')).toExist(),
      Scene.expect(Scene.text(firstLine)).toExist(),
      Scene.expect(Scene.text(secondLine)).toExist(),
      Scene.expect(Scene.altText('Shared image at 0:02')).toHaveAttr(
        'src',
        imageURL,
      ),
      Scene.expect(Scene.text('Being checked')).toBeAbsent(),
      Scene.expect(Scene.text('The rest is being checked')).toBeAbsent(),
    )
  })

  test('never shows who shared it, which the scrubber does not check', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(
        sharedPageModel({
          ...passedRange(),
          share: {
            ...passedRange().share,
            maybeSharedBy: Option.some('Alice Example'),
          },
        }),
      ),
      Scene.expect(Scene.text('Shared 0:00 to 0:09, 2 sections')).toExist(),
      Scene.expect(Scene.text('Alice Example', { exact: false })).toBeAbsent(),
    )
  })

  test('shows only "Being checked" while nothing has passed', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(
        sharedPageModel({
          ...passedRange(),
          maybeTitle: Option.none(),
          maybeNote: Option.none(),
          scrub: Share.Model.PendingScrub(),
          lines: [],
          images: [],
        }),
      ),
      Scene.expect(Scene.text('Being checked')).toExist(),
      Scene.expect(Scene.text('The rest is being checked')).toBeAbsent(),
      Scene.expect(Scene.text(firstLine)).toBeAbsent(),
      Scene.expect(
        Scene.role('heading', { name: 'Recording 237' }),
      ).toBeAbsent(),
    )
  })

  test('shows the lines passed so far while the rest is being checked', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(
        sharedPageModel({
          ...passedRange(),
          maybeTitle: Option.none(),
          scrub: Share.Model.PendingScrub(),
          lines: [scrubbedLine(0, firstLine)],
          images: [],
        }),
      ),
      Scene.expect(Scene.text('Being checked')).toExist(),
      Scene.expect(Scene.text(firstLine)).toExist(),
      Scene.expect(Scene.text(secondLine)).toBeAbsent(),
      Scene.expect(Scene.text('The rest is being checked')).toExist(),
    )
  })

  test('shows nothing of a withheld share but why', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(
        sharedPageModel({
          ...passedRange(),
          maybeTitle: Option.none(),
          maybeNote: Option.none(),
          scrub: Share.Model.WithheldScrub({
            maybeReason: Option.some('The checker could not run.'),
          }),
          lines: [],
          images: [],
        }),
      ),
      Scene.expect(
        Scene.text(
          'This share could not be checked, so nothing in it is shown',
        ),
      ).toExist(),
      Scene.expect(Scene.text('The checker could not run.')).toExist(),
      Scene.expect(Scene.text('Being checked')).toBeAbsent(),
      Scene.expect(Scene.selector('audio')).toBeAbsent(),
      Scene.expect(Scene.selector('img')).toBeAbsent(),
    )
  })
})

describe('the share page and its audio clip', () => {
  test('plays a ready clip, with its length, above the shared lines', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(
        withAudio(
          Share.Model.ReadySharedAudio({
            url: clipURL,
            maybeDurationSeconds: Option.some(72.4),
          }),
        ),
      ),
      Scene.expect(Scene.selector('audio')).toHaveAttr('src', clipURL),
      Scene.expect(Scene.selector('audio')).toHaveAttr('preload', 'metadata'),
      Scene.expect(Scene.label('Shared audio, 1:12')).toExist(),
      Scene.expect(Scene.text('1:12')).toExist(),
      Scene.expect(Scene.text(firstLine)).toExist(),
      Scene.expect(Scene.text(laterUpdateNotice)).toBeAbsent(),
    )
  })

  test('says the audio is still uploading while it is prepared', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(withAudio(Share.Model.PreparingSharedAudio())),
      Scene.expect(Scene.text('Audio is still uploading')).toExist(),
      Scene.expect(Scene.selector('audio')).toBeAbsent(),
      Scene.expect(Scene.text(laterUpdateNotice)).toBeAbsent(),
    )
  })

  test('says the audio could not be shared when the clip failed', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(withAudio(Share.Model.FailedSharedAudio())),
      Scene.expect(Scene.text('The audio could not be shared')).toExist(),
      Scene.expect(Scene.selector('audio')).toBeAbsent(),
      Scene.expect(Scene.text(laterUpdateNotice)).toBeAbsent(),
    )
  })

  test('shows no player for a share without audio, as before', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(withAudio(Share.Model.NoSharedAudio())),
      Scene.expect(Scene.selector('audio')).toBeAbsent(),
      Scene.expect(Scene.text('Audio is still uploading')).toBeAbsent(),
      Scene.expect(Scene.text('The audio could not be shared')).toBeAbsent(),
      Scene.expect(Scene.role('heading', { name: 'Recording 237' })).toExist(),
      Scene.expect(Scene.text(laterUpdateNotice)).toExist(),
    )
  })
})
