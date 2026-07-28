type YouTubePlayer = Readonly<{
  destroy: () => void
  getCurrentTime: () => number
  getPlayerState: () => number
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
}>

type YouTubeNamespace = Readonly<{
  Player: new (
    elementId: string,
    options: Readonly<{
      events: Readonly<{
        onReady: (event: Readonly<{ target: YouTubePlayer }>) => void
      }>
    }>,
  ) => YouTubePlayer
}>

type YouTubeWindow = typeof globalThis &
  Readonly<{
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }>

/** The small imperative surface owned by the browser's YouTube adapter. */
export type VideoPlayerController = Readonly<{
  destroy: () => void
  seekTo: (seconds: number) => void
}>

let youtubeApiPromise: Promise<YouTubeNamespace> | undefined

const youtubeWindow = (): YouTubeWindow => globalThis as YouTubeWindow

const loadYouTubeApi = (): Promise<YouTubeNamespace> => {
  const existingNamespace = youtubeWindow().YT
  if (existingNamespace !== undefined) {
    return Promise.resolve(existingNamespace)
  }
  if (youtubeApiPromise !== undefined) {
    return youtubeApiPromise
  }

  youtubeApiPromise = new Promise((resolve, reject) => {
    const win = youtubeWindow()
    const previousReady = win.onYouTubeIframeAPIReady
    ;(win as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady =
      () => {
        previousReady?.()
        const namespace = youtubeWindow().YT
        if (namespace === undefined) {
          reject(new Error('YouTube iframe API initialized without YT'))
        } else {
          resolve(namespace)
        }
      }

    const existingScript = document.getElementById('youtube-iframe-api')
    if (existingScript === null) {
      const script = document.createElement('script')
      script.id = 'youtube-iframe-api'
      script.src = 'https://www.youtube.com/iframe_api'
      script.addEventListener('error', () => {
        reject(new Error('Unable to load the YouTube iframe API'))
      })
      document.head.append(script)
    }
  })
  return youtubeApiPromise
}

/** Connects the embedded recording to a typed playback observation callback. */
export const setupYouTubePlayer = async (
  elementId: string,
  observeSeconds: (seconds: number) => void,
): Promise<VideoPlayerController> => {
  const namespace = await loadYouTubeApi()
  return new Promise(resolve => {
    new namespace.Player(elementId, {
      events: {
        onReady: ({ target }) => {
          let previousSeconds = Number.NaN
          const interval = globalThis.setInterval(() => {
            const seconds = target.getCurrentTime()
            if (
              Number.isFinite(seconds) &&
              (Number.isNaN(previousSeconds) ||
                Math.abs(seconds - previousSeconds) >= 0.25)
            ) {
              previousSeconds = seconds
              observeSeconds(seconds)
            }
          }, 250)

          resolve({
            seekTo: seconds => {
              const wasPlaying = target.getPlayerState() === 1
              target.seekTo(seconds, true)
              if (!wasPlaying) {
                target.pauseVideo()
                globalThis.setTimeout(() => target.pauseVideo(), 0)
              }
            },
            destroy: () => {
              globalThis.clearInterval(interval)
              target.destroy()
            },
          })
        },
      },
    })
  })
}
