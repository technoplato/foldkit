import { init as initInstant } from "@instantdb/core"
import { Runtime } from "foldkit"
import {
  Message,
  Model,
  StaticTranscribeResources,
  init,
  makeLiveTranscribeResources,
  schema,
  subscriptions,
  update,
} from "transcribe-core-example"

import { overlay } from "@foldkit/devtools"

import { view } from "./view.js"

const appId = import.meta.env["VITE_INSTANT_APP_ID"]
const resources =
  appId === undefined || appId === ""
    ? StaticTranscribeResources
    : makeLiveTranscribeResources(initInstant({ appId, schema }))

/** Builds a captive Foldkit element that does not own document title or URL. */
export const makeTranscribeElement = (container: HTMLElement) =>
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
