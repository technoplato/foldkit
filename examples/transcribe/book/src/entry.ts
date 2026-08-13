import { Runtime } from "foldkit"
import {
  TranscribeProgram,
  StaticTranscribeResources,
  makeLiveTranscribeResources,
} from "transcribe-core-example"

import { overlay } from "@foldkit/devtools"

import { transcribeDatabase } from "./database.js"
import { view } from "./view.js"

const database = transcribeDatabase()
const resources =
  database === undefined
    ? StaticTranscribeResources
    : makeLiveTranscribeResources(database as never)

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById("root"),
  devTools: { overlay },
  program: TranscribeProgram,
  resources,
  view,
})

Runtime.run(application)
