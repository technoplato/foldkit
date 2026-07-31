import type { InstantCounterDatabase } from '../../instant.schema.js'
import {
  type ActorSequenceRegistry,
  type AttemptedEffectRegistry,
  type ClientIdentity,
  type ClientProcessor,
  allocateClientProcessor,
  makeClientProcessor,
} from '../processorClient/index.js'
import {
  browserEffectExecutorLayer,
  browserProcessorDescriptor,
} from './browserCapabilities.js'

export {
  observeProcessorPresence,
  observeProcessorSnapshots,
} from '../processorClient/index.js'

/** Inputs needed to start one authenticated browser Processor. */
export type BrowserProcessorConfig = Readonly<{
  actorSequences: ActorSequenceRegistry
  attemptRegistry: AttemptedEffectRegistry
  database: InstantCounterDatabase
  identity: ClientIdentity
  subjectId: string
}>

/** One running browser Processor and its detachable host surfaces. */
export type BrowserProcessor = ClientProcessor

const browserClientProcessorConfig = (
  config: BrowserProcessorConfig,
): import('../processorClient/index.js').ClientProcessorConfig => ({
  ...config,
  host: {
    isEffectExecutor: true,
    makeDescriptor: browserProcessorDescriptor,
    makeEffectExecutorLayer: browserEffectExecutorLayer,
    processorKind: 'browser',
  },
})

/** Starts a real Foldkit runtime whose Model consumes only accepted Messages. */
export const makeBrowserProcessor = (
  config: BrowserProcessorConfig,
): ReturnType<typeof makeClientProcessor> =>
  makeClientProcessor(browserClientProcessorConfig(config))

/** Allocates a browser Processor with an interruptible explicit lifetime. */
export const allocateBrowserProcessor = (
  config: BrowserProcessorConfig,
  signal?: AbortSignal,
): Promise<
  Readonly<{
    processor: BrowserProcessor
    release: () => Promise<void>
  }>
> => allocateClientProcessor(browserClientProcessorConfig(config), signal)
