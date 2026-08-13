import { Runtime } from "foldkit"
import {
  IdeasProgram,
  StaticIdeasResources,
  makeLiveIdeasResources,
} from "ideas-core-example"

import { overlay } from "@foldkit/devtools"

import { ideasDatabase } from "./database.js"
import { view } from "./view.js"

const database = ideasDatabase()
const resources =
  database === undefined
    ? StaticIdeasResources
    : makeLiveIdeasResources(database)

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById("root"),
  devTools: {
    overlay,
  },
  program: IdeasProgram,
  resources,
  view,
})

Runtime.run(application)
