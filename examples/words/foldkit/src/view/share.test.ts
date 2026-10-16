import { Option } from 'effect'
import { Scene } from 'foldkit'
import { evo } from 'foldkit/struct'
import { fromString } from 'foldkit/url'
import { describe, test } from 'vitest'
import {
  type Model,
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
const laterUpdateNotice = 'Audio for shared sections comes in a later update.'

const sharedPageModel = (audio: Share.Model.SharedAudio): Model => {
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
            range: {
              share: {
                id: shareID,
                recordingID,
                visibility: 'Link',
                maybeRecipientEmail: Option.none(),
                maybeLinkToken: Option.some(linkToken),
                firstSegmentIndex: 601,
                lastSegmentIndex: 601,
                startSeconds: 12016.5,
                endSeconds: 12021,
                maybeNote: Option.none(),
                maybeSharedBy: Option.some('Michael'),
                createdAtMs: 1,
              },
              recordingTitle: 'Recording 237',
              recordingStartedAtMs: 0,
              sections: [
                {
                  id: 'section-601',
                  index: 601,
                  startSeconds: 12016.5,
                  endSeconds: 12021,
                  maybeSpeakerID: Option.none(),
                  text: 'The include audio on share is not allowing me to open it.',
                  words: [],
                  isFinal: true,
                },
              ],
              isClaimedByViewer: false,
              audio,
            },
          }),
      }),
  })
}

describe('the share page and its audio clip', () => {
  test('plays a ready clip, with its length, above the shared lines', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(
        sharedPageModel(
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
      Scene.expect(
        Scene.text('The include audio on share is not allowing me to open it.'),
      ).toExist(),
      Scene.expect(Scene.text(laterUpdateNotice)).toBeAbsent(),
    )
  })

  test('says the audio is still uploading while it is prepared', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(sharedPageModel(Share.Model.PreparingSharedAudio())),
      Scene.expect(Scene.text('Audio is still uploading')).toExist(),
      Scene.expect(Scene.selector('audio')).toBeAbsent(),
      Scene.expect(Scene.text(laterUpdateNotice)).toBeAbsent(),
    )
  })

  test('says the audio could not be shared when the clip failed', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(sharedPageModel(Share.Model.FailedSharedAudio())),
      Scene.expect(Scene.text('The audio could not be shared')).toExist(),
      Scene.expect(Scene.selector('audio')).toBeAbsent(),
      Scene.expect(Scene.text(laterUpdateNotice)).toBeAbsent(),
    )
  })

  test('shows no player for a share without audio, as before', () => {
    Scene.scene(
      { update, view: sharedRangePage },
      Scene.with(sharedPageModel(Share.Model.NoSharedAudio())),
      Scene.expect(Scene.selector('audio')).toBeAbsent(),
      Scene.expect(Scene.text('Audio is still uploading')).toBeAbsent(),
      Scene.expect(Scene.text('The audio could not be shared')).toBeAbsent(),
      Scene.expect(Scene.text('Recording 237')).toExist(),
      Scene.expect(Scene.text(laterUpdateNotice)).toExist(),
    )
  })
})
