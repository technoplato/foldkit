import { Effect, Fiber, Option, Stream } from 'effect'
import { Runtime } from 'foldkit'

import { makeWordsApplication } from './application.js'
import { observeAudioPlayer } from './audioPlayer.js'
import { decodeWordsPayload } from './dataClient.js'
import { type WordsData } from './model.js'
import { audioPorts } from './program.js'
import { wordsStyles } from './styles.js'
import { modelForData } from './update.js'

/** Inputs supplied by a server-rendered native Words page. */
export type MountWordsExampleOptions = Readonly<{
  root: HTMLElement
  audio: HTMLAudioElement
  payload: unknown
}>

type MountedWordsExample = Readonly<{ dispose: () => void }>

const mountedRoots = new WeakMap<HTMLElement, MountedWordsExample>()

const applyPageNonce = (root: HTMLElement, style: HTMLStyleElement): void => {
  const nonceSource = root.ownerDocument.querySelector<HTMLElement>('[nonce]')
  const nonce = nonceSource?.nonce || nonceSource?.getAttribute('nonce') || ''
  if (nonce !== '') {
    style.setAttribute('nonce', nonce)
  }
}

const prepareMount = (
  root: HTMLElement,
  audio: HTMLAudioElement,
  data: WordsData,
): Option.Option<
  Readonly<{ container: HTMLDivElement; mounted: MountedWordsExample }>
> => {
  try {
    const shell = root.ownerDocument.createElement('div')
    const style = root.ownerDocument.createElement('style')
    const container = root.ownerDocument.createElement('div')
    container.id =
      root.id === '' ? 'scribe-words-foldkit' : `${root.id}-foldkit`
    style.textContent = wordsStyles
    applyPageNonce(root, style)
    shell.append(style, container)
    const model = modelForData(data)
    const application = makeWordsApplication(container, model, audio)
    const handle = Runtime.embed(application)
    const fiber = Effect.runFork(
      Stream.runForEach(observeAudioPlayer(audio), event =>
        Effect.sync(() => handle.ports.audioObserved.send(event)),
      ),
    )
    return Option.some({
      container: shell,
      mounted: {
        dispose: () => {
          Effect.runFork(Fiber.interrupt(fiber))
          handle.dispose()
        },
      },
    })
  } catch {
    return Option.none()
  }
}

/**
 * Progressively enhances one native recording page.
 *
 * Validation and detached rendering complete before the supplied root changes.
 * Invalid payloads and failed mounts return `false`, preserving native fallback.
 */
export const mountWordsExample = ({
  root,
  audio,
  payload,
}: MountWordsExampleOptions): boolean => {
  if (!(root instanceof HTMLElement) || !(audio instanceof HTMLAudioElement)) {
    return false
  }
  const maybeData = decodeWordsPayload(payload)
  if (Option.isNone(maybeData)) {
    return false
  }
  const maybePrepared = prepareMount(root, audio, maybeData.value)
  if (Option.isNone(maybePrepared)) {
    return false
  }

  const previous = mountedRoots.get(root)
  if (audio.getAttribute('src') !== maybeData.value.audio.url) {
    audio.setAttribute('src', maybeData.value.audio.url)
  }
  root.replaceChildren(maybePrepared.value.container)
  previous?.dispose()
  mountedRoots.set(root, maybePrepared.value.mounted)
  return true
}

export { audioPorts }
