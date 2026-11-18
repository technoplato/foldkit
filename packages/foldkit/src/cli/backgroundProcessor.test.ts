import { describe, expect, it } from 'vitest'

import {
  BackgroundProcessorError,
  askBackgroundProcessor,
  backgroundProcessorSocketPath,
  ensureBackgroundProcessor,
  isBackgroundProcessorListening,
  listenBackgroundProcessor,
  spawnBackgroundProcessor,
  startBackgroundProcessorServer,
  stopBackgroundProcessor,
} from './backgroundProcessor.js'
import {
  askCliDaemon,
  ensureCliDaemon,
  isCliDaemonListening,
  spawnCliDaemon,
  stopCliDaemon,
} from './client.js'
import { listenCliDaemon, startCliDaemonServer } from './listen.js'
import { cliDaemonSocketPath } from './paths.js'
import { CliDaemonError } from './protocol.js'
import {
  isBackgroundProcessorRunning,
  isCliViewListening,
  spawnBackgroundProcessorFromView,
  spawnCliViewDaemon,
  backgroundProcessorSocketPath as viewSocketPath,
} from './view.js'

describe('the Background Processor', () => {
  it('is the name of what was spelled CLI daemon: the same functions under both', () => {
    expect(listenBackgroundProcessor).toBe(listenCliDaemon)
    expect(startBackgroundProcessorServer).toBe(startCliDaemonServer)
    expect(backgroundProcessorSocketPath).toBe(cliDaemonSocketPath)
    expect(askBackgroundProcessor).toBe(askCliDaemon)
    expect(ensureBackgroundProcessor).toBe(ensureCliDaemon)
    expect(isBackgroundProcessorListening).toBe(isCliDaemonListening)
    expect(spawnBackgroundProcessor).toBe(spawnCliDaemon)
    expect(stopBackgroundProcessor).toBe(stopCliDaemon)
    expect(BackgroundProcessorError).toBe(CliDaemonError)
  })

  it('has the same names in the slim view, which imports no Effect', () => {
    expect(viewSocketPath).toBe(cliDaemonSocketPath)
    expect(isBackgroundProcessorRunning).toBe(isCliViewListening)
    expect(spawnBackgroundProcessorFromView).toBe(spawnCliViewDaemon)
  })
})
