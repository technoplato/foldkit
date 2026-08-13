import { Effect, Fiber } from 'effect'
import { Runtime } from 'foldkit'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { SimulatedWalletResources } from 'wallet-simulated-client-example'
import {
  type Message,
  type Model,
  WorldProgram,
} from 'world-core-example'

type WorldRuntime = Runtime.ProgramRuntime<Model, Message>

const WorldRuntimeContext = createContext<WorldRuntime | null>(null)

/** Provides one World Program runtime to React children. */
export const WorldProvider = ({
  children,
}: {
  readonly children: ReactNode
}) => {
  const [runtime, setRuntime] = useState<WorldRuntime | null>(null)

  useEffect(() => {
    const fiber = Effect.runFork(
      Effect.scoped(
        Effect.gen(function* () {
          const built = yield* Effect.orDie(
            Runtime.makeProgramRuntime({
              program: WorldProgram,
              resources: SimulatedWalletResources,
            }),
          )
          yield* built.initialization
          setRuntime(built)
          yield* Effect.never
        }),
      ),
    )
    return () => {
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [])

  if (runtime === null) {
    return null
  }

  return (
    <WorldRuntimeContext.Provider value={runtime}>
      {children}
    </WorldRuntimeContext.Provider>
  )
}

const useWorldRuntime = (): WorldRuntime => {
  const runtime = useContext(WorldRuntimeContext)
  if (runtime === null) {
    throw new Error('WorldProvider is required')
  }
  return runtime
}

/** Reads the current World Model. */
export const useWorldModel = (): Model => {
  const runtime = useWorldRuntime()
  return useSyncExternalStore(
    listener => runtime.observeModel(() => listener()),
    () => runtime.readModel(),
    () => runtime.readModel(),
  )
}

/** Sends a World Message. */
export const useWorldSend = (): ((message: Message) => void) => {
  const runtime = useWorldRuntime()
  return message => {
    runtime.send(message)
  }
}
