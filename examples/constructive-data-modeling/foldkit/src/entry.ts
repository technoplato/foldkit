import { SlideId, slideForId } from 'constructive-data-modeling-core-example'
import { Option, Schema as S } from 'effect'
import { Runtime } from 'foldkit'

import { makeConstructiveDataModelingApplication } from './application.js'
import { type VideoPlayerController, setupYouTubePlayer } from './player.js'
import { startForSearch } from './route.js'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

let player: VideoPlayerController | undefined
let pendingSeek: number | undefined
const requestVideoSeek = (seconds: number): void => {
  if (player === undefined) {
    pendingSeek = seconds
  } else {
    player.seekTo(seconds)
  }
}

const application = makeConstructiveDataModelingApplication(
  root,
  startForSearch(globalThis.location.search),
  requestVideoSeek,
)
const handle = Runtime.embed(application)

const encodedSlideId = new URLSearchParams(globalThis.location.search).get(
  'slide',
)
const initialSeconds = Option.match(
  S.decodeUnknownOption(SlideId)(encodedSlideId),
  {
    onNone: () => 0,
    onSome: slideId => slideForId(slideId).startSeconds,
  },
)

void setupYouTubePlayer('talk-player', seconds => {
  handle.ports.playbackObserved.send(seconds)
})
  .then(controller => {
    player = controller
    const target = pendingSeek ?? initialSeconds
    pendingSeek = undefined
    if (target > 0) {
      controller.seekTo(target)
    }
  })
  .catch(error => {
    console.error('Unable to initialize synchronized YouTube playback', error)
  })

globalThis.addEventListener('pagehide', () => {
  player?.destroy()
  handle.dispose()
})
