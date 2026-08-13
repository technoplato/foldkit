import { Match as M, Option } from "effect"
import { Runtime } from "foldkit"
import { type UrlRequest } from "foldkit/navigation"
import { toString as urlToString } from "foldkit/url"
import {
  OpenedHref,
  StaticTranscribeResources,
  makeLiveTranscribeResources,
  requestFromHref,
  requestToPath,
  selectedJob,
} from "transcribe-core-example"

import { overlay } from "@foldkit/devtools"

import { transcribeDatabase } from "./database.js"
import { TranscribeFoldkitProgram } from "./playback.js"
import { view } from "./view.js"

const database = transcribeDatabase()
const resources =
  database === undefined
    ? StaticTranscribeResources
    : makeLiveTranscribeResources(database as never)

const openedHrefForRequest = (request: UrlRequest) =>
  M.value(request).pipe(
    M.withReturnType<ReturnType<typeof OpenedHref.make>>(),
    M.tagsExhaustive({
      Internal: ({ url }) => OpenedHref.make({ href: urlToString(url) }),
      External: ({ href }) => OpenedHref.make({ href }),
    }),
  )

const historyReconciliation = { isActive: false }

const application = Runtime.makeFoldkitApplication({
  container: document.getElementById("root"),
  devTools: {
    overlay,
  },
  onModel: model => {
    const nextPath = Option.match(selectedJob(model), {
      onNone: () => "/",
      onSome: job => requestToPath(requestFromHref(`/jobs/${job.videoId}`)),
    })
    const current = `${window.location.pathname}${window.location.search}`
    if (current !== nextPath) {
      const method = historyReconciliation.isActive ? "replaceState" : "pushState"
      window.history[method]({}, "", nextPath)
    }
    historyReconciliation.isActive = false
  },
  program: TranscribeFoldkitProgram,
  resources,
  routing: {
    onUrlChange: url => {
      historyReconciliation.isActive = true
      return OpenedHref.make({ href: urlToString(url) })
    },
    onUrlRequest: openedHrefForRequest,
  },
  view,
})

Runtime.run(application)
