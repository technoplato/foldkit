import { init } from "@instantdb/core"
import {
  StaticIdeasResources,
  makeLiveIdeasResources,
  schema,
} from "ideas-core-example"
import { makeIdeasReactClient } from "ideas-react-bindings-example"

const appId = import.meta.env["VITE_INSTANT_APP_ID"]
const resources =
  appId === undefined || appId === ""
    ? StaticIdeasResources
    : makeLiveIdeasResources(init({ appId, schema }))

/** The React host selects live Instant resources when configured. */
export const IdeasClient = makeIdeasReactClient(resources)
