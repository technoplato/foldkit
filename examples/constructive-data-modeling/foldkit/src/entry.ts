import { startSecondsForLocation } from 'constructive-data-modeling-core-example'
import { Option } from 'effect'
import { Runtime } from 'foldkit'

import { makeConstructiveDataModelingApplication } from './application.js'
import { logBuildProvenance } from './buildProvenance.js'
import { type VideoPlayerController, setupYouTubePlayer } from './player.js'
import { locationForSearch, startForSearch } from './route.js'

const root = document.getElementById('root')
if (root === null) {
  throw new Error('Root element not found')
}

const boot = async (): Promise<void> => {
  logBuildProvenance()
  let pendingSeek: number | undefined
  let player: VideoPlayerController | undefined
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
  const initialSeconds = Option.match(
    locationForSearch(globalThis.location.search),
    { onNone: () => 0, onSome: startSecondsForLocation },
  )

  try {
    player = await setupYouTubePlayer('talk-player', seconds => {
      handle.ports.playbackObserved.send(seconds)
    })
    const target = pendingSeek ?? initialSeconds
    pendingSeek = undefined
    if (target > 0) {
      player.seekTo(target)
    }
  } catch (error) {
    console.error('Unable to initialize synchronized YouTube playback', error)
  }

  globalThis.addEventListener('pagehide', () => {
    player?.destroy()
    handle.dispose()
  })
}

void boot()
