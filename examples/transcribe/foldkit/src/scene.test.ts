import { Option } from "effect"
import {
  CompletedScrollCurrentWord,
  HeardPlaybackPosition,
  LoadedCatalog,
  idlePlayback,
  seedTranscripts,
  update as coreUpdate,
} from "transcribe-core-example"
import { Scene } from "foldkit"
import { describe, test } from "vitest"

import { ObserveReaderVideo, ScrollCurrentWord } from "./video-clock.js"
import { update } from "./playback.js"
import { view } from "./index.js"

const followAlongWords = [
  { id: "w0", text: "Okay,", start: 0, end: 0.4 },
  { id: "w1", text: "so", start: 0.4, end: 0.9 },
]

const loadedModel = {
  catalog: LoadedCatalog.make({ jobs: seedTranscripts }),
  draftUrl: "",
  selectedId: Option.none(),
  source: "Instant" as const,
  ...idlePlayback,
}

describe("view", () => {
  test("renders the Knophy transcribe heading and URL field", () => {
    Scene.scene(
      { update: coreUpdate, view },
      Scene.with(loadedModel),
      Scene.expect(Scene.text("Knophy transcribe")).toExist(),
      Scene.expect(Scene.text("Video transcripts")).toExist(),
    )
  })

  test("playing a job highlights the current word", () => {
    const job = seedTranscripts[0]
    if (job === undefined) {
      throw new Error("seed catalog is empty")
    }
    Scene.scene(
      { update, view },
      Scene.with({
        ...loadedModel,
        selectedId: Option.some(job.videoId),
        currentTime: 0.5,
        mediaUrl: `/media/${job.videoId}.mp4`,
        fallbackUrl: job.url,
        words: followAlongWords,
      }),
      Scene.Mount.resolveAll(
        [ScrollCurrentWord, CompletedScrollCurrentWord.make({})],
        [ObserveReaderVideo, HeardPlaybackPosition.make({ mediaPosition: 0.5 })],
      ),
      Scene.expect(Scene.role("button", { name: "so" })).toHaveAttr(
        "aria-current",
        "true",
      ),
      Scene.expect(Scene.role("button", { name: "Okay," })).not.toHaveAttr(
        "aria-current",
      ),
      Scene.expect(Scene.role("button", { name: "Send" })).toExist(),
    )
  })
})
