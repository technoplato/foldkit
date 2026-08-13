import { init } from "@instantdb/core"
import {
  StaticTranscribeResources,
  makeLiveTranscribeResources,
  schema,
} from "transcribe-core-example"
import { makeTranscribeReactClient } from "transcribe-react-bindings-example"

const appId = import.meta.env["VITE_INSTANT_APP_ID"]
const resources =
  appId === undefined || appId === ""
    ? StaticTranscribeResources
    : makeLiveTranscribeResources(init({ appId, schema }))

/** The React host selects live Instant resources when configured. */
export const TranscribeClient = makeTranscribeReactClient(resources)
