import { type Layer } from 'effect'
import { Program } from 'foldkit'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'
import {
  ClickedJob,
  ClosedJob,
  type Message,
  type Model,
  StaticTranscribeResources,
  SubmittedUrl,
  TranscribeProgram,
  type TranscribeStore,
  UpdatedDraftUrl,
  init,
} from 'transcribe-core-example'

/** Actions exposed to React and React Native consumers of the Transcribe Program. */
export type TranscribeActions = Readonly<{
  clickedJob: (id: string) => void
  closedJob: () => void
  submittedUrl: (url: string) => void
  updatedDraftUrl: (draftUrl: string) => void
}>

/** One portable state route accepted by the Transcribe client. */
export type TranscribeInitialRoute = Program.ResolvedProgramRoute<
  Model,
  Message
>

/** The canonical fresh Transcribe route shared by host carriers. */
const [initialModel] = init()
export const initialTranscribeRoute: TranscribeInitialRoute =
  Program.state(initialModel)

/** Creates a React Client over host-selected live or deterministic resources. */
export const makeTranscribeReactClient = (
  resources: Layer.Layer<TranscribeStore>,
) =>
  createReplayableReactProgramClient<
    Model,
    Message,
    TranscribeActions,
    TranscribeInitialRoute,
    TranscribeStore
  >({
    createActions: enqueueMessage => ({
      clickedJob: id => enqueueMessage(ClickedJob.make({ id })),
      closedJob: () => enqueueMessage(ClosedJob.make({})),
      submittedUrl: url => enqueueMessage(SubmittedUrl.make({ url })),
      updatedDraftUrl: draftUrl =>
        enqueueMessage(UpdatedDraftUrl.make({ draftUrl })),
    }),
    name: 'Transcribe',
    program: TranscribeProgram,
    resources,
    route: initialRoute => initialRoute,
  })

/** Deterministic Client used by tests and offline hosts. */
export const StaticTranscribeClient = makeTranscribeReactClient(
  StaticTranscribeResources,
)

/** Provides one static Transcribe runtime to React children. */
export const TranscribeProvider = ({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) => (
  <StaticTranscribeClient.Provider
    initialRoute={initialTranscribeRoute}
    fallback={fallback}
  >
    {children}
  </StaticTranscribeClient.Provider>
)

/** Reads the current immutable Transcribe Model. */
export const useTranscribeModel = StaticTranscribeClient.useModel

/** Returns stable Transcribe actions. */
export const useTranscribeActions = StaticTranscribeClient.useActions
