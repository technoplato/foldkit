import { init as initInstant } from "@instantdb/core"
import { Runtime } from "foldkit"
import {
  Message,
  Model,
  StaticIdeasResources,
  init,
  makeLiveIdeasResources,
  schema,
  subscriptions,
  update,
} from "ideas-core-example"

import { overlay } from "@foldkit/devtools"

import { view } from "./view.js"

const appId = import.meta.env["VITE_INSTANT_APP_ID"]
const resources =
  appId === undefined || appId === ""
    ? StaticIdeasResources
    : makeLiveIdeasResources(initInstant({ appId, schema }))

/** Builds a captive Foldkit element that does not own document title or URL. */
export const makeIdeasElement = (container: HTMLElement) =>
  Runtime.makeElement({
    Model,
    Message,
    init,
    update,
    view,
    subscriptions,
    resources,
    container,
    devTools: { overlay, Message },
  })
