import { init } from "@instantdb/core"
import {
  StaticIdeasResources,
  makeLiveIdeasResources,
  schema,
} from "ideas-core-example"

/** Node hosts use INSTANT_APP_ID when present, otherwise the seed catalog. */
export const ideasResources = () => {
  const appId = process.env["INSTANT_APP_ID"]
  if (appId === undefined || appId === "") {
    return StaticIdeasResources
  }
  return makeLiveIdeasResources(init({ appId, schema }))
}
