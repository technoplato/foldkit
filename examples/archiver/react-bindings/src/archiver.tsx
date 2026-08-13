import {
  ArchiverProgram,
  ClickedArchive,
  Message,
  Model,
  SubmittedArchiveUrl,
  UpdatedUrlDraft,
} from 'archiver-core-example'
import { Layer } from 'effect'
import { Program } from 'foldkit'
import type { ReactNode } from 'react'
import { createReplayableReactProgramClient } from 'shared-react-bindings-example'

/** Actions exposed to React and React Native consumers of the Archiver Program. */
export type ArchiverActions = Readonly<{
  updatedUrlDraft: (value: string) => void
  submittedArchiveUrl: () => void
  clickedArchive: (id: string) => void
}>

/** One portable state or replay route accepted by the Archiver client. */
export type ArchiverInitialRoute = Program.ResolvedProgramRoute<Model, Message>

/** The canonical fresh Archiver route shared by host carriers. */
export const initialArchiverRoute: ArchiverInitialRoute = Program.state(
  Model.make({ urlDraft: '', archives: [] }),
)

/** The canonical React and React Native client for the Archiver Program. */
export const ArchiverClient = createReplayableReactProgramClient<
  Model,
  Message,
  ArchiverActions,
  ArchiverInitialRoute
>({
  createActions: enqueueMessage => ({
    updatedUrlDraft: value => enqueueMessage(UpdatedUrlDraft({ value })),
    submittedArchiveUrl: () => enqueueMessage(SubmittedArchiveUrl()),
    clickedArchive: id => enqueueMessage(ClickedArchive({ id })),
  }),
  name: 'Archiver',
  program: ArchiverProgram,
  resources: Layer.empty,
  route: initialRoute => initialRoute,
})

/** Provides one Archiver runtime to React or React Native children. */
export const ArchiverProvider = ({
  children,
  fallback,
}: Readonly<{ children: ReactNode; fallback?: ReactNode }>) => (
  <ArchiverClient.Provider
    initialRoute={initialArchiverRoute}
    fallback={fallback}
  >
    {children}
  </ArchiverClient.Provider>
)

/** Reads the current immutable Archiver Model and re-renders on Model changes. */
export const useArchiverModel = ArchiverClient.useModel

/** Returns stable, host-callable Archiver actions. */
export const useArchiverActions = ArchiverClient.useActions

/** Returns inert inspection and live branching controls for the Archiver tape. */
export const useArchiverReplay = ArchiverClient.useReplay
